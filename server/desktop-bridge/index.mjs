#!/usr/bin/env node
/**
 * Flow Desktop Companion bridge.
 *
 * A tiny local HTTP service, built ONLY from Node built-ins, that lets the
 * Flow web app (running in a browser at a localhost dev URL) trigger a small
 * allowlist of real macOS actions. This is intentionally NOT a generic shell
 * bridge: every capability is a hardcoded id in `buildCapabilities()` below,
 * with its own narrow argument validation. There is no code path that lets a
 * client-supplied string turn into an arbitrary function call or shell
 * command.
 *
 * Security model (see also the README-style comments inline at each check):
 *   1. Binds to 127.0.0.1 only - never reachable from the network.
 *   2. Every request is checked, in order: (a) method+path is a known route,
 *      (b) Origin header is present and in the allowlist, (c) Authorization:
 *      Bearer <token> exactly matches the session token (constant-time
 *      compare). Any failure short-circuits before any capability runs.
 *   3. Capabilities are looked up in a plain object (`capabilities[id]`),
 *      never constructed from client input via `new Function`/`eval`/dynamic
 *      `require`.
 *   4. File-touching capabilities resolve the path with `fs.realpathSync`
 *      and require the result to sit inside an allowlisted directory, which
 *      defeats symlink escapes (a symlink *inside* an allowed dir that
 *      points *outside* it is rejected after resolution).
 *   5. `desktop.openApp` only accepts an application name from a hardcoded
 *      allowlist. `desktop.openUrl` only accepts http/https URLs.
 *   6. Every accepted or rejected request is written to an audit trail.
 *
 * Local model inference (`ai.interpretTurn`, `ai.status`): the companion is
 * also the ONLY place allowed to reach the local Ollama runtime, for exactly
 * the same reason it's the only place allowed to touch the filesystem or
 * spawn a process — a browser tab must never be able to point inference at
 * an arbitrary host. `OLLAMA_BASE_URL` below is a hardcoded loopback literal
 * with no environment override and no field in the request body can change
 * it; `ALLOWED_MODELS` is a hardcoded allowlist and any other model name is
 * rejected. This keeps inference loopback-only and makes cloud-model routing
 * structurally impossible from this process, not just discouraged by policy.
 */

import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { pathToFileURL } from "node:url";

export const DEFAULT_PORT = 8765;
export const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/** Hardcoded, non-configurable loopback address for local model inference.
 * There is deliberately no env var or request field that can change this —
 * see the module doc above. */
export const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

/** The only local models this companion will EVER invoke — a short,
 * hardcoded, vetted allowlist (never "any model name the client asks for"),
 * so a compromised or buggy client can never redirect inference to an
 * unvetted model. qwen3-vl:2b-instruct-q4_K_M was the original pick after
 * comparing it against qwen3:0.6b on structured multi-clause extraction.
 * qwen2.5:7b-instruct-q4_K_M and qwen3.5:9b were each added, downloaded
 * with explicit approval, and benchmarked head-to-head against the
 * standing winner on the identical held-out corpus (see FINAL REPORT's
 * "HEAD-TO-HEAD" sections) — kept in the allowlist regardless of outcome so
 * each stays available as an explicit opt-in for future comparison without
 * a re-approval/re-download cycle. All Apache-2.0, fully local — never a
 * paid or cloud model. See DEFAULT_MODEL below for which one actually runs
 * by default. */
export const ALLOWED_MODELS = ["qwen3-vl:2b-instruct-q4_K_M", "qwen2.5:7b-instruct-q4_K_M", "qwen3.5:9b", "qwen3.5:4b", "phi4-mini"];

/** Which allowlisted model is used when a request doesn't name one
 * explicitly (every production call site — see modelClient.ts — omits
 * `model` and gets this). Configurable via env so a developer machine can
 * pin a specific one without a code change; falls back to the first
 * (winning) allowlist entry. Never auto-downloaded — see `ai.status` below,
 * which reports plainly when the configured default isn't actually
 * installed instead of silently substituting a different model. */
const DEFAULT_MODEL = ALLOWED_MODELS.includes(process.env.FLOW_DEFAULT_MODEL)
  ? process.env.FLOW_DEFAULT_MODEL
  : ALLOWED_MODELS[0];

// Bounded (Rule #6: "bounded input/output and context size"), not unbounded —
// raised from 8000 after the real capability-derived system prompt (13
// original capabilities + desktop.* once genuinely exposed to the model, see
// capabilityModel.ts) measured 8065 chars and every real turn was silently
// rejected as a body-size violation, not a semantic failure (see FINAL
// REPORT's Tier B root-cause). 16000 chars (~4k tokens) leaves real headroom
// for the registry to keep growing while staying far inside the selected
// model's actual 40960-token context window — still a real, enforced,
// server-side ceiling, never a per-request client override.
const MAX_AI_TEXT_CHARS = 16000;
const MAX_AI_SCHEMA_CHARS = 6000;
const AI_INTERPRET_TIMEOUT_MS = 15000;
const AI_STATUS_TIMEOUT_MS = 2000;
// A model can be "installed" (ollama list shows it) while genuinely unable
// to serve a request right now — loading, OOM-killed, or a stuck Ollama
// process. A bare /api/tags check cannot tell the difference, so ai.status
// below also attempts one real, tiny, bounded generation; this budget is
// deliberately shorter than AI_INTERPRET_TIMEOUT_MS (a real turn can afford
// to wait longer than a readiness probe should).
const AI_LIVE_PROBE_TIMEOUT_MS = 10000;

/** Hardcoded application allowlist for desktop.openApp. Small and boring on purpose. */
export const ALLOWED_APPS = ["Visual Studio Code", "Finder", "Preview", "Safari", "Notes", "Terminal"];

/** Fixed AppleScript source for desktop.getFrontmostApp. Never built from request input. */
const FRONTMOST_APP_SCRIPT =
  'tell application "System Events" to get name of first application process whose frontmost is true';

const MAX_BODY_BYTES = 64 * 1024; // 64KB is generous for these tiny JSON bodies.
const MAX_AUDIT_ENTRIES_IN_MEMORY = 500;
const DEFAULT_AUDIT_LIMIT = 50;
const MAX_AUDIT_LIMIT = 500;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

export class HttpError extends Error {
  constructor(status, message, reason = "error") {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

/** Resolves node:child_process.execFile into a Promise, so we can inject a
 * fake implementation with the exact same (file, args, callback) shape in
 * tests without ever touching the real OS. */
function execFileAsync(execFileImpl, file, args) {
  return new Promise((resolve, reject) => {
    execFileImpl(file, args, (err, stdout) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(typeof stdout === "string" ? stdout : String(stdout ?? ""));
    });
  });
}

function requireString(args, key) {
  const value = args ? args[key] : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, `"${key}" is required and must be a non-empty string.`, "invalid-args");
  }
  return value;
}

/** True when `candidateReal` is `rootReal` or lives underneath it. Both
 * arguments MUST already be resolved with fs.realpathSync. */
function isInsideDir(rootReal, candidateReal) {
  const rel = path.relative(rootReal, candidateReal);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Resolves the allowlisted root directories for path-touching capabilities.
 * Reads FLOW_COMPANION_ALLOWED_DIRS (comma separated) or defaults to
 * ~/Downloads, ~/Documents, ~/Desktop. Roots are realpath-resolved up front
 * so later symlink comparisons are apples-to-apples; a root that doesn't
 * exist yet is kept as a plain resolved path (nothing inside it could exist
 * either, so there is nothing to defeat). */
export function defaultAllowedDirs(env = process.env) {
  const home = os.homedir();
  const raw = env.FLOW_COMPANION_ALLOWED_DIRS;
  const candidates =
    raw && raw.trim().length > 0
      ? raw
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : [path.join(home, "Downloads"), path.join(home, "Documents"), path.join(home, "Desktop")];
  return candidates.map((candidate) => {
    const resolved = path.resolve(candidate);
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  });
}

export function resolveOriginsFromEnv(env = process.env) {
  const raw = env.FLOW_COMPANION_ORIGINS;
  if (!raw || raw.trim().length === 0) return DEFAULT_ORIGINS.slice();
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Validates a client-supplied file path against the allowed directories and
 * returns its canonical (symlink-resolved) form. Throws HttpError otherwise.
 * Defense in depth: explicit ".." segment rejection PLUS realpath+prefix
 * comparison, so a symlink inside an allowed dir that points outside it is
 * still caught after resolution. */
export function resolveAllowedPath(rawPath, allowedDirs) {
  const value = requireString({ path: rawPath }, "path");
  if (value.includes("\0")) {
    throw new HttpError(400, "Path contains an invalid character.", "invalid-path");
  }
  const segments = value.split(/[\\/]/);
  if (segments.includes("..")) {
    throw new HttpError(400, "Path traversal ('..') is not allowed.", "path-traversal");
  }
  const resolved = path.resolve(value);
  let real;
  try {
    real = fs.realpathSync(resolved);
  } catch {
    throw new HttpError(400, "File does not exist.", "not-found");
  }
  let stat;
  try {
    stat = fs.statSync(real);
  } catch {
    throw new HttpError(400, "File does not exist.", "not-found");
  }
  if (!stat.isFile()) {
    throw new HttpError(400, "Path must point to a file.", "not-a-file");
  }
  if (!allowedDirs.some((dir) => isInsideDir(dir, real))) {
    throw new HttpError(400, "Path is outside the allowed directories.", "path-not-allowed");
  }
  return real;
}

/** Non-recursive (top-level only) directory listing, metadata only - file
 * contents are never opened or read. */
export function listRecentFiles(args, allowedDirs) {
  let limit = DEFAULT_LIST_LIMIT;
  if (args && args.limit !== undefined) {
    const n = Number(args.limit);
    if (!Number.isFinite(n) || n <= 0) {
      throw new HttpError(400, '"limit" must be a positive number.', "invalid-args");
    }
    limit = Math.min(Math.floor(n), MAX_LIST_LIMIT);
  }

  let dirsToScan;
  if (args && args.dir !== undefined) {
    const requested = requireString(args, "dir");
    const resolved = path.resolve(requested);
    let real;
    try {
      real = fs.realpathSync(resolved);
    } catch {
      throw new HttpError(400, "Directory does not exist.", "not-found");
    }
    if (!allowedDirs.some((dir) => isInsideDir(dir, real))) {
      throw new HttpError(400, "Directory is outside the allowed directories.", "path-not-allowed");
    }
    dirsToScan = [real];
  } else {
    dirsToScan = allowedDirs;
  }

  const files = [];
  for (const dir of dirsToScan) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue; // Allowed root may not exist on this machine; skip it.
    }
    for (const name of names) {
      const full = path.join(dir, name);
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      files.push({
        path: full,
        name,
        extension: path.extname(name),
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size,
      });
    }
  }

  files.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0));
  return { files: files.slice(0, limit) };
}

function requireBoundedString(args, key, maxChars) {
  const value = requireString(args, key);
  if (value.length > maxChars) {
    throw new HttpError(400, `"${key}" exceeds the ${maxChars}-character limit.`, "invalid-args");
  }
  return value;
}

/** A structured-output schema is only ever used as decoding guidance we pass
 * straight through to Ollama's `format` field - never interpreted as code -
 * but it still needs a size bound so a malformed or hostile caller can't
 * balloon the request. */
function requireBoundedSchema(args) {
  const schema = args ? args.schema : undefined;
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new HttpError(400, '"schema" is required and must be a JSON object.', "invalid-args");
  }
  let json;
  try {
    json = JSON.stringify(schema);
  } catch {
    throw new HttpError(400, '"schema" must be JSON-serializable.', "invalid-args");
  }
  if (json.length > MAX_AI_SCHEMA_CHARS) {
    throw new HttpError(400, `"schema" exceeds the ${MAX_AI_SCHEMA_CHARS}-character limit.`, "invalid-args");
  }
  return schema;
}

function resolveAllowedModel(args) {
  const requested = args && args.model !== undefined ? requireString(args, "model") : DEFAULT_MODEL;
  if (!ALLOWED_MODELS.includes(requested)) {
    throw new HttpError(400, `"${requested}" is not on the allowed model list.`, "model-not-allowlisted");
  }
  return requested;
}

/** POSTs to the local Ollama chat endpoint with a request deadline. Never
 * throws HttpError itself for network failure - the caller decides how to
 * classify "model unavailable" vs. a client-args error.
 *
 * `think: false` is set unconditionally: Flow never reads `message.thinking`
 * (see the one call site below, which only ever touches `message.content`),
 * and Rule #9 explicitly forbids ever surfacing chain-of-thought in the UI —
 * so hidden reasoning is pure wasted latency here, not a quality trade-off.
 * For a hybrid-thinking model (verified directly against Ollama's own
 * `/api/chat` for qwen3.5:4b and qwen3.5:9b) this is the difference between
 * an 80s+ response and a sub-second one for the exact same prompt. Models
 * that don't support hybrid thinking (qwen3-vl:2b, qwen2.5:7b) simply ignore
 * the field. */
async function ollamaChat(fetchImpl, { model, system, user, schema }, timeoutMs = AI_INTERPRET_TIMEOUT_MS) {
  const response = await fetchImpl(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      // Bounded weight residency, renewed by real reasoning/probe requests.
      // No conversation messages or KV state are reused between requests.
      keep_alive: "5m",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      format: schema,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Ollama responded with status ${response.status}`);
  }
  return response.json();
}

/** The ONE central capability registry. Every id is hardcoded here; there is
 * no generic "call function named X" path. Each handler receives only the
 * parsed JSON `args` object and returns a plain JSON-serializable result or
 * throws HttpError. */
function buildCapabilities({ execFileImpl, allowedDirs, fetchImpl }) {
  return {
    "desktop.getFrontmostApp": async () => {
      const stdout = await execFileAsync(execFileImpl, "osascript", ["-e", FRONTMOST_APP_SCRIPT]);
      return { app: stdout.trim() };
    },

    "desktop.openApp": async (args) => {
      const app = requireString(args, "app");
      if (!ALLOWED_APPS.includes(app)) {
        throw new HttpError(400, `"${app}" is not on the allowed application list.`, "app-not-allowlisted");
      }
      await execFileAsync(execFileImpl, "open", ["-a", app]);
      return { opened: app };
    },

    "desktop.openFile": async (args) => {
      const resolved = resolveAllowedPath(args && args.path, allowedDirs);
      await execFileAsync(execFileImpl, "open", [resolved]);
      return { opened: resolved };
    },

    "desktop.revealInFinder": async (args) => {
      const resolved = resolveAllowedPath(args && args.path, allowedDirs);
      await execFileAsync(execFileImpl, "open", ["-R", resolved]);
      return { revealed: resolved };
    },

    "desktop.openUrl": async (args) => {
      const raw = requireString(args, "url");
      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        throw new HttpError(400, "Invalid URL.", "invalid-url");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new HttpError(400, `URL protocol "${parsed.protocol}" is not allowed.`, "protocol-not-allowed");
      }
      await execFileAsync(execFileImpl, "open", [raw]);
      return { opened: raw };
    },

    "desktop.listRecentFiles": async (args) => listRecentFiles(args ?? {}, allowedDirs),

    // Structured-output local inference. The model's job is to propose an
    // interpretation; it never gets to pick where inference runs (hardcoded
    // OLLAMA_BASE_URL) or which model answers (ALLOWED_MODELS), and its
    // output is returned as inert JSON text for the caller to validate
    // against the real capability registry - this endpoint has no authority
    // to execute anything itself.
    "ai.interpretTurn": async (args) => {
      const system = requireBoundedString(args, "system", MAX_AI_TEXT_CHARS);
      const user = requireBoundedString(args, "user", MAX_AI_TEXT_CHARS);
      const schema = requireBoundedSchema(args);
      const model = resolveAllowedModel(args);
      let payload;
      try {
        payload = await ollamaChat(fetchImpl, { model, system, user, schema });
      } catch (err) {
        throw new HttpError(503, "Local model is unavailable.", "model-unavailable");
      }
      const content = payload && payload.message && typeof payload.message.content === "string" ? payload.message.content : "";
      return {
        content,
        model,
        totalDurationMs: typeof payload.total_duration === "number" ? Math.round(payload.total_duration / 1e6) : null,
        loadDurationMs: typeof payload.load_duration === "number" ? Math.round(payload.load_duration / 1e6) : null,
        evalCount: typeof payload.eval_count === "number" ? payload.eval_count : null,
      };
    },

    // Cheap, unauthenticated-in-spirit-but-still-token-gated health probe so
    // the UI can show a clear "local model unavailable" state (Rule #9/#12)
    // instead of silently falling back or hanging on the first real request.
    "ai.status": async (args) => {
      try {
        const response = await fetchImpl(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(AI_STATUS_TIMEOUT_MS) });
        if (!response.ok) return { available: false, model: null, defaultModel: DEFAULT_MODEL, defaultModelInstalled: false, liveProbeOk: false };
        const data = await response.json();
        const names = Array.isArray(data.models) ? data.models.map((entry) => entry.name) : [];
        const defaultModelInstalled = names.includes(DEFAULT_MODEL);
        // `model` (legacy field, kept for existing callers): the configured
        // DEFAULT specifically, not just "some allowlisted model happens to
        // be installed" — a UI checking `available` must not report
        // "ready" while the model it will actually call is missing. See
        // Section 7's "Flow must clearly say local intelligence is not
        // installed" requirement.
        // "Installed" is not the same as "can actually serve a request right
        // now" (loading, OOM-killed, stuck process all still show up in
        // /api/tags) — a caller that wants that stronger guarantee passes
        // livProbe:true, which performs one real, tiny, bounded chat call.
        // Skipped by default so an ordinary status check stays cheap.
        let liveProbeOk = null;
        let liveProbePerformance;
        if (defaultModelInstalled && args && args.liveProbe === true) {
          try {
            const probe = await ollamaChat(fetchImpl, {
              model: DEFAULT_MODEL,
              system: "Reply with one word.",
              user: "Say OK.",
              schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
            }, AI_LIVE_PROBE_TIMEOUT_MS);
            liveProbeOk = Boolean(probe && probe.message && typeof probe.message.content === "string");
            if (args.measurements === true) {
              liveProbePerformance = Object.fromEntries([
                ["totalMs", "total_duration"], ["loadMs", "load_duration"],
                ["promptEvalMs", "prompt_eval_duration"], ["evalMs", "eval_duration"],
              ].map(([key, field]) => [key, Number.isFinite(probe?.[field]) ? probe[field] / 1e6 : null]));
            }
          } catch {
            liveProbeOk = false;
          }
        }
        return {
          available: defaultModelInstalled && liveProbeOk !== false,
          model: defaultModelInstalled ? DEFAULT_MODEL : null,
          defaultModel: DEFAULT_MODEL,
          defaultModelInstalled,
          liveProbeOk,
          ...(liveProbePerformance ? { liveProbePerformance } : {}),
        };
      } catch {
        return { available: false, model: null, defaultModel: DEFAULT_MODEL, defaultModelInstalled: false, liveProbeOk: false };
      }
    },
  };
}

function safeTokenEquals(provided, expected) {
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new HttpError(413, "Request body too large.", "body-too-large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", (err) => reject(err));
  });
}

/** Short, non-sensitive representation of args for the audit trail. Full
 * file contents are never read by any capability, so there is nothing more
 * sensitive than short strings/numbers to redact here; we still cap length
 * defensively in case a future capability grows a large arg. */
function redactArgs(args) {
  try {
    const json = JSON.stringify(args ?? {});
    return json.length > 200 ? `${json.slice(0, 200)}...` : json;
  } catch {
    return "<unserializable>";
  }
}

const KNOWN_ROUTES = new Set(["POST /capability", "GET /health", "GET /audit", "OPTIONS /capability", "OPTIONS /audit"]);

/**
 * Builds the request listener plus test/inspection hooks. Does NOT start
 * listening - callers (main() below, or tests) call `.listen()` themselves.
 *
 * Options:
 *   token           - session bearer token (defaults to a fresh random one)
 *   allowedOrigins  - array of allowed Origin header values
 *   allowedDirs     - array of allowlisted realpath directories
 *   execFileImpl    - injectable replacement for node:child_process.execFile
 *   auditLogPath    - optional path to append JSON-lines audit records to
 *   now             - injectable clock, () => Date
 */
export function createServer(options = {}) {
  const token = options.token ?? crypto.randomBytes(32).toString("hex");
  const allowedOrigins = options.allowedOrigins ?? resolveOriginsFromEnv();
  const allowedDirs = options.allowedDirs ?? defaultAllowedDirs();
  const execFileImpl = options.execFileImpl ?? execFileCb;
  const fetchImpl = options.fetchImpl ?? fetch;
  const auditLogPath = options.auditLogPath ?? null;
  const now = options.now ?? (() => new Date());

  const auditEntries = [];
  function appendAudit(entry) {
    auditEntries.push(entry);
    if (auditEntries.length > MAX_AUDIT_ENTRIES_IN_MEMORY) auditEntries.shift();
    if (auditLogPath) {
      try {
        fs.appendFileSync(auditLogPath, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
      } catch (err) {
        console.error("[flow-companion] failed to write audit log:", err);
      }
    }
  }

  const capabilities = buildCapabilities({ execFileImpl, allowedDirs, fetchImpl });

  async function handleRequest(req, res) {
    const id = crypto.randomUUID();
    const ts = now().toISOString();
    const origin = req.headers.origin;
    const originAllowed = typeof origin === "string" && allowedOrigins.includes(origin);
    const method = req.method || "GET";
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      sendJson(res, 400, { error: "Invalid request URL." });
      return;
    }
    const routeKey = `${method} ${url.pathname}`;

    // (a) Unauthenticated, zero-information liveness probe. Deliberately
    // exempt from origin/token checks: it reveals nothing beyond "a process
    // is listening on this port", which is no more than a port scan would
    // already show, and lets the web app distinguish "companion offline"
    // from "companion online, but I don't have a token yet" before the user
    // has pasted one in.
    if (routeKey === "GET /health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    // (a) Method + path must match a known route.
    if (!KNOWN_ROUTES.has(routeKey)) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }

    // CORS preflight: answer only for allowlisted origins, only with the
    // headers we actually accept.
    if (method === "OPTIONS") {
      if (!originAllowed) {
        sendJson(res, 403, { error: "Origin not allowed." });
        return;
      }
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      res.end();
      return;
    }

    const corsHeaders = originAllowed ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};

    // (b) Origin allowlist.
    if (!originAllowed) {
      appendAudit({ id, ts, capability: routeKey, args: null, origin: origin ?? null, outcome: "rejected", reason: "origin-not-allowed" });
      sendJson(res, 403, { error: "Origin not allowed." }, corsHeaders);
      return;
    }

    // (c) Bearer token, constant-time compare.
    const authHeader = req.headers.authorization || "";
    const match = /^Bearer (.+)$/.exec(authHeader);
    const providedToken = match ? match[1] : null;
    if (!providedToken || !safeTokenEquals(providedToken, token)) {
      appendAudit({ id, ts, capability: routeKey, args: null, origin, outcome: "rejected", reason: "unauthorized" });
      sendJson(res, 401, { error: "Unauthorized." }, corsHeaders);
      return;
    }

    if (routeKey === "GET /audit") {
      const limitParam = url.searchParams.get("limit");
      let limit = DEFAULT_AUDIT_LIMIT;
      if (limitParam) {
        const n = Number(limitParam);
        if (Number.isFinite(n) && n > 0) limit = Math.min(Math.floor(n), MAX_AUDIT_LIMIT);
      }
      sendJson(res, 200, { entries: auditEntries.slice(-limit) }, corsHeaders);
      return;
    }

    // POST /capability
    let bodyText;
    try {
      bodyText = await readBody(req, MAX_BODY_BYTES);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 400;
      appendAudit({ id, ts, capability: null, args: null, origin, outcome: "rejected", reason: "body-error" });
      sendJson(res, status, { error: "Could not read request body." }, corsHeaders);
      return;
    }

    let body;
    try {
      body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
    } catch {
      appendAudit({ id, ts, capability: null, args: null, origin, outcome: "rejected", reason: "invalid-json" });
      sendJson(res, 400, { error: "Malformed JSON body." }, corsHeaders);
      return;
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      appendAudit({ id, ts, capability: null, args: null, origin, outcome: "rejected", reason: "invalid-body" });
      sendJson(res, 400, { error: "Body must be a JSON object." }, corsHeaders);
      return;
    }

    const capabilityId = body.capability;
    const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};

    if (typeof capabilityId !== "string" || !Object.hasOwn(capabilities, capabilityId)) {
      appendAudit({
        id,
        ts,
        capability: typeof capabilityId === "string" ? capabilityId : null,
        args: redactArgs(args),
        origin,
        outcome: "rejected",
        reason: "unknown-capability",
      });
      sendJson(res, 404, { error: "Unknown capability." }, corsHeaders);
      return;
    }

    const handler = capabilities[capabilityId];
    try {
      const data = await handler(args);
      appendAudit({ id, ts, capability: capabilityId, args: redactArgs(args), origin, outcome: "ok" });
      sendJson(res, 200, data, corsHeaders);
    } catch (err) {
      if (err instanceof HttpError) {
        appendAudit({ id, ts, capability: capabilityId, args: redactArgs(args), origin, outcome: "rejected", reason: err.reason });
        sendJson(res, err.status, { error: err.message }, corsHeaders);
      } else {
        // Full error stays server-side only; the client never sees internals.
        console.error("[flow-companion] capability threw:", capabilityId, err);
        appendAudit({ id, ts, capability: capabilityId, args: redactArgs(args), origin, outcome: "rejected", reason: "internal-error" });
        sendJson(res, 500, { error: "Internal error." }, corsHeaders);
      }
    }
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error("[flow-companion] unhandled error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal error." });
    });
  });

  return { server, token, allowedOrigins, allowedDirs, auditEntries };
}

function getConfigDir() {
  return path.join(os.homedir(), ".flow-companion");
}

function persistToken(token) {
  const dir = getConfigDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(dir, 0o700);
  } catch {
    // Best effort on filesystems that don't support chmod (e.g. some CI images).
  }
  const tokenPath = path.join(dir, "token");
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  try {
    fs.chmodSync(tokenPath, 0o600);
  } catch {
    // See above.
  }
  return tokenPath;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

function main() {
  const port = Number(process.env.FLOW_COMPANION_PORT) || DEFAULT_PORT;
  const auditLogPath = path.join(getConfigDir(), "audit.log");
  fs.mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
  const { server, token } = createServer({ auditLogPath });
  const tokenPath = persistToken(token);
  server.listen(port, "127.0.0.1", () => {
    console.log(`[flow-companion] listening on http://127.0.0.1:${port}`);
    console.log(`[flow-companion] session token written to ${tokenPath}`);
    console.log(`[flow-companion] session token: ${token}`);
    console.log("[flow-companion] paste this token into Flow's desktop companion settings.");
  });
}

if (isMainModule()) {
  main();
}
