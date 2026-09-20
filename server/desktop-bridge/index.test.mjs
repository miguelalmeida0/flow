import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, ALLOWED_APPS, OLLAMA_BASE_URL, ALLOWED_MODELS } from "./index.mjs";

const ORIGIN = "http://localhost:5173";
const TOKEN = "test-session-token";

/** Records every execFile invocation instead of touching the real OS. */
function makeFakeExecFile(impl) {
  const calls = [];
  const fn = (file, args, callback) => {
    calls.push([file, args]);
    if (impl) {
      impl(file, args, callback);
    } else {
      callback(null, "", "");
    }
  };
  fn.calls = calls;
  return fn;
}

/** Records every fetch invocation and returns a scripted response instead of
 * touching the network. */
function makeFakeFetch(impl) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push([url, init]);
    return impl(url, init);
  };
  fn.calls = calls;
  return fn;
}

let server;
let baseUrl;
let execFileImpl;
let fetchImpl;
let allowedDir;
let tmpRoot;

beforeEach(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "flow-companion-test-"));
  allowedDir = path.join(tmpRoot, "allowed");
  fs.mkdirSync(allowedDir);
  execFileImpl = makeFakeExecFile();
  fetchImpl = makeFakeFetch(async () => {
    throw new Error("fetchImpl not stubbed for this test");
  });

  const created = createServer({
    token: TOKEN,
    allowedOrigins: [ORIGIN],
    allowedDirs: [fs.realpathSync(allowedDir)],
    execFileImpl,
    fetchImpl: (url, init) => fetchImpl(url, init),
  });
  server = created.server;
  server._testHandle = created;

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function post(pathName, body, { origin = ORIGIN, token = TOKEN, rawBody } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  if (rawBody === undefined) headers["Content-Type"] = "application/json";
  return fetch(`${baseUrl}${pathName}`, {
    method: "POST",
    headers,
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

function get(pathName, { origin = ORIGIN, token = TOKEN } = {}) {
  const headers = {};
  if (origin !== null) headers.Origin = origin;
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  return fetch(`${baseUrl}${pathName}`, { method: "GET", headers });
}

describe("origin allowlist", () => {
  it("rejects a missing Origin header with 403 and never dispatches", async () => {
    const res = await post("/capability", { capability: "desktop.getFrontmostApp" }, { origin: null });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBeTruthy();
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("rejects an origin not on the allowlist with 403 and never dispatches", async () => {
    const res = await post(
      "/capability",
      { capability: "desktop.getFrontmostApp" },
      { origin: "https://evil.example.com" },
    );
    expect(res.status).toBe(403);
    expect(execFileImpl.calls).toHaveLength(0);
  });
});

describe("bearer token", () => {
  it("rejects a missing token with 401", async () => {
    const res = await post("/capability", { capability: "desktop.getFrontmostApp" }, { token: null });
    expect(res.status).toBe(401);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("rejects a wrong token with 401", async () => {
    const res = await post("/capability", { capability: "desktop.getFrontmostApp" }, { token: "wrong-token" });
    expect(res.status).toBe(401);
    expect(execFileImpl.calls).toHaveLength(0);
  });
});

describe("capability allowlist", () => {
  it("rejects an unknown capability id without dispatching", async () => {
    const res = await post("/capability", { capability: "shell.exec" });
    expect([400, 404]).toContain(res.status);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("rejects another unknown/dangerous-looking capability id", async () => {
    const res = await post("/capability", { capability: "desktop.rm -rf" });
    expect([400, 404]).toContain(res.status);
    expect(execFileImpl.calls).toHaveLength(0);
  });
});

describe("desktop.openApp", () => {
  it("rejects an app not on the allowlist with 400 and never calls execFile", async () => {
    const res = await post("/capability", { capability: "desktop.openApp", args: { app: "Malicious App" } });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("opens an allowlisted app via execFile with exact array args", async () => {
    const app = ALLOWED_APPS[0];
    const res = await post("/capability", { capability: "desktop.openApp", args: { app } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.opened).toBe(app);
    expect(execFileImpl.calls).toHaveLength(1);
    expect(execFileImpl.calls[0][0]).toBe("open");
    expect(execFileImpl.calls[0][1]).toEqual(["-a", app]);
    expect(Array.isArray(execFileImpl.calls[0][1])).toBe(true);
  });
});

describe("desktop.openFile path validation", () => {
  it("rejects a traversal-style path and never calls execFile", async () => {
    const res = await post("/capability", {
      capability: "desktop.openFile",
      args: { path: path.join(allowedDir, "../../../etc/passwd") },
    });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("rejects a symlink inside the allowed dir that points outside it, after realpath resolution", async () => {
    const outsideDir = path.join(tmpRoot, "outside");
    fs.mkdirSync(outsideDir);
    const secretFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(secretFile, "top secret");
    const linkPath = path.join(allowedDir, "escape-link");
    fs.symlinkSync(secretFile, linkPath);

    const res = await post("/capability", { capability: "desktop.openFile", args: { path: linkPath } });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("opens a real file inside the allowed dir", async () => {
    const filePath = path.join(allowedDir, "note.txt");
    fs.writeFileSync(filePath, "hello");
    const res = await post("/capability", { capability: "desktop.openFile", args: { path: filePath } });
    expect(res.status).toBe(200);
    expect(execFileImpl.calls).toHaveLength(1);
    expect(execFileImpl.calls[0]).toEqual(["open", [fs.realpathSync(filePath)]]);
  });

  it("rejects a file that does not exist", async () => {
    const res = await post("/capability", {
      capability: "desktop.openFile",
      args: { path: path.join(allowedDir, "does-not-exist.txt") },
    });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });
});

describe("desktop.revealInFinder", () => {
  it("uses the same path validation and calls open -R", async () => {
    const filePath = path.join(allowedDir, "reveal-me.txt");
    fs.writeFileSync(filePath, "hi");
    const res = await post("/capability", { capability: "desktop.revealInFinder", args: { path: filePath } });
    expect(res.status).toBe(200);
    expect(execFileImpl.calls[0]).toEqual(["open", ["-R", fs.realpathSync(filePath)]]);
  });

  it("rejects traversal attempts", async () => {
    const res = await post("/capability", {
      capability: "desktop.revealInFinder",
      args: { path: "../../etc/passwd" },
    });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });
});

describe("desktop.openUrl", () => {
  it("rejects javascript: URLs", async () => {
    const res = await post("/capability", { capability: "desktop.openUrl", args: { url: "javascript:alert(1)" } });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("rejects file: URLs", async () => {
    const res = await post("/capability", { capability: "desktop.openUrl", args: { url: "file:///etc/passwd" } });
    expect(res.status).toBe(400);
    expect(execFileImpl.calls).toHaveLength(0);
  });

  it("accepts https URLs (execFile mocked, nothing actually opens)", async () => {
    const res = await post("/capability", { capability: "desktop.openUrl", args: { url: "https://example.com" } });
    expect(res.status).toBe(200);
    expect(execFileImpl.calls).toHaveLength(1);
    expect(execFileImpl.calls[0]).toEqual(["open", ["https://example.com"]]);
  });
});

describe("desktop.listRecentFiles", () => {
  it("returns only metadata fields, sorted desc, respecting limit", async () => {
    for (let i = 0; i < 5; i += 1) {
      fs.writeFileSync(path.join(allowedDir, `file-${i}.txt`), `contents ${i}`);
    }
    const res = await post("/capability", {
      capability: "desktop.listRecentFiles",
      args: { dir: allowedDir, limit: 3 },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.files).toHaveLength(3);
    for (const entry of json.files) {
      expect(Object.keys(entry).sort()).toEqual(["extension", "modifiedAt", "name", "path", "size"].sort());
      expect(typeof entry.modifiedAt).toBe("string");
      expect(new Date(entry.modifiedAt).toISOString()).toBe(entry.modifiedAt);
    }
    // execFile is never used for a pure metadata listing.
    expect(execFileImpl.calls).toHaveLength(0);
  });
});

describe("malformed JSON body", () => {
  it("returns 400 without crashing the server", async () => {
    const res = await post("/capability", undefined, { rawBody: "{ this is not json" });
    expect(res.status).toBe(400);
    // Server should still be alive for a follow-up request.
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
  });
});

describe("desktop.getFrontmostApp", () => {
  it("returns { app } from mocked execFile stdout", async () => {
    execFileImpl = makeFakeExecFile((file, args, callback) => callback(null, "Visual Studio Code\n", ""));
    // Recreate server with the new execFileImpl for this test.
    await new Promise((resolve) => server.close(resolve));
    const created = createServer({
      token: TOKEN,
      allowedOrigins: [ORIGIN],
      allowedDirs: [fs.realpathSync(allowedDir)],
      execFileImpl,
    });
    server = created.server;
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const res = await post("/capability", { capability: "desktop.getFrontmostApp" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ app: "Visual Studio Code" });
    expect(execFileImpl.calls[0][0]).toBe("osascript");
    expect(execFileImpl.calls[0][1][0]).toBe("-e");
  });
});

describe("audit log", () => {
  it("records both an accepted and a rejected request", async () => {
    const app = ALLOWED_APPS[1];
    const ok = await post("/capability", { capability: "desktop.openApp", args: { app } });
    expect(ok.status).toBe(200);

    const rejected = await post("/capability", { capability: "desktop.openApp", args: { app: "Not Allowed" } });
    expect(rejected.status).toBe(400);

    const auditRes = await get("/audit");
    expect(auditRes.status).toBe(200);
    const { entries } = await auditRes.json();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const outcomes = entries.map((e) => e.outcome);
    expect(outcomes).toContain("ok");
    expect(outcomes).toContain("rejected");
    const acceptedEntry = entries.find((e) => e.outcome === "ok" && e.capability === "desktop.openApp");
    expect(acceptedEntry).toBeTruthy();
    const rejectedEntry = entries.find((e) => e.outcome === "rejected" && e.reason === "app-not-allowlisted");
    expect(rejectedEntry).toBeTruthy();
  });

  it("gates /audit behind origin + token too", async () => {
    const res = await get("/audit", { origin: null });
    expect(res.status).toBe(403);
    const res2 = await get("/audit", { token: "wrong" });
    expect(res2.status).toBe(401);
  });
});

describe("health", () => {
  it("returns { ok: true } with no auth required", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });
});

describe("CORS preflight", () => {
  it("answers OPTIONS for an allowed origin", async () => {
    const res = await fetch(`${baseUrl}/capability`, { method: "OPTIONS", headers: { Origin: ORIGIN } });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("rejects OPTIONS for a disallowed origin", async () => {
    const res = await fetch(`${baseUrl}/capability`, {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).toBe(403);
  });
});

describe("ai.interpretTurn", () => {
  const schema = { type: "object", properties: { intent: { type: "string" } }, required: ["intent"] };

  it("calls the hardcoded loopback Ollama endpoint with the allowlisted model and returns the model's content", async () => {
    fetchImpl = makeFakeFetch(async () => ({
      ok: true,
      json: async () => ({ message: { content: '{"intent":"move_event"}' }, total_duration: 123000000, load_duration: 4000000, eval_count: 12 }),
    }));
    const res = await post("/capability", {
      capability: "ai.interpretTurn",
      args: { system: "You are Flow's interpreter.", user: "Move dinner to eight.", schema },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ content: '{"intent":"move_event"}', model: ALLOWED_MODELS[0], totalDurationMs: 123, loadDurationMs: 4, evalCount: 12 });
    expect(fetchImpl.calls).toHaveLength(1);
    const [url, init] = fetchImpl.calls[0];
    expect(url).toBe(`${OLLAMA_BASE_URL}/api/chat`);
    const body = JSON.parse(init.body);
    expect(body.model).toBe(ALLOWED_MODELS[0]);
    expect(body.format).toEqual(schema);
    // A hybrid-thinking model (qwen3.5:4b/9b) defaults to emitting a hidden
    // reasoning pass before its answer — verified directly against Ollama's
    // own /api/chat this session: 80s+ for a trivial prompt with thinking
    // on, sub-second with it off. Flow never reads `message.thinking` and
    // never displays chain-of-thought, so this must always be off.
    expect(body.think).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "You are Flow's interpreter." },
      { role: "user", content: "Move dinner to eight." },
    ]);
  });

  it("rejects a model name that isn't on the allowlist instead of forwarding it", async () => {
    fetchImpl = makeFakeFetch(async () => ({ ok: true, json: async () => ({ message: { content: "{}" } }) }));
    const res = await post("/capability", {
      capability: "ai.interpretTurn",
      args: { system: "s", user: "u", schema, model: "gpt-4o" },
    });
    expect(res.status).toBe(400);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it("rejects an oversized prompt without calling the model", async () => {
    // Exceeds MAX_AI_TEXT_CHARS (16000 — see its own doc comment for why it
    // was raised from 8000: a real capability-derived system prompt now
    // measures just over 8000 chars on its own).
    const res = await post("/capability", {
      capability: "ai.interpretTurn",
      args: { system: "s".repeat(16001), user: "u", schema },
    });
    expect(res.status).toBe(400);
    expect(fetchImpl.calls).toHaveLength(0);
  });

  it("returns 503 (not a raw error) when the local model is unreachable", async () => {
    fetchImpl = makeFakeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await post("/capability", { capability: "ai.interpretTurn", args: { system: "s", user: "u", schema } });
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("Local model is unavailable.");
  });
});

describe("ai.status", () => {
  it("reports available:true (and defaultModelInstalled:true) when the DEFAULT model is installed", async () => {
    fetchImpl = makeFakeFetch(async () => ({ ok: true, json: async () => ({ models: [{ name: ALLOWED_MODELS[0] }, { name: "qwen3:0.6b" }] }) }));
    const res = await post("/capability", { capability: "ai.status", args: {} });
    expect(res.status).toBe(200);
    // liveProbeOk stays null when not explicitly requested (see the
    // liveProbeOk:true test below) — an ordinary status check never pays
    // for a real inference call unless the caller opts in.
    expect(await res.json()).toEqual({ available: true, model: ALLOWED_MODELS[0], defaultModel: ALLOWED_MODELS[0], defaultModelInstalled: true, liveProbeOk: null });
  });

  it("reports available:false when only a NON-default allowlisted model is installed — never silently substitutes it", async () => {
    fetchImpl = makeFakeFetch(async () => ({ ok: true, json: async () => ({ models: [{ name: ALLOWED_MODELS[1] }] }) }));
    const res = await post("/capability", { capability: "ai.status", args: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, model: null, defaultModel: ALLOWED_MODELS[0], defaultModelInstalled: false, liveProbeOk: null });
  });

  it("reports available:false without throwing when Ollama isn't running", async () => {
    fetchImpl = makeFakeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const res = await post("/capability", { capability: "ai.status", args: {} });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, model: null, defaultModel: ALLOWED_MODELS[0], defaultModelInstalled: false, liveProbeOk: false });
  });

  it("liveProbe:true actually calls the model, not just /api/tags — proves a bounded, harmless real request works", async () => {
    let calls = 0;
    fetchImpl = makeFakeFetch(async (url) => {
      calls += 1;
      if (String(url).endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: ALLOWED_MODELS[0] }] }) };
      return { ok: true, json: async () => ({ message: { content: '{"ok":true}' } }) };
    });
    const res = await post("/capability", { capability: "ai.status", args: { liveProbe: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: true, model: ALLOWED_MODELS[0], defaultModel: ALLOWED_MODELS[0], defaultModelInstalled: true, liveProbeOk: true });
    expect(calls).toBe(2); // /api/tags, then the real chat probe.
  });

  it("liveProbe:true reports available:false when the model is installed but genuinely doesn't respond", async () => {
    fetchImpl = makeFakeFetch(async (url) => {
      if (String(url).endsWith("/api/tags")) return { ok: true, json: async () => ({ models: [{ name: ALLOWED_MODELS[0] }] }) };
      throw new Error("model stuck loading");
    });
    const res = await post("/capability", { capability: "ai.status", args: { liveProbe: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, model: ALLOWED_MODELS[0], defaultModel: ALLOWED_MODELS[0], defaultModelInstalled: true, liveProbeOk: false });
  });

  it("does not run the live probe when the default model isn't even installed — nothing to probe", async () => {
    let calls = 0;
    fetchImpl = makeFakeFetch(async () => {
      calls += 1;
      return { ok: true, json: async () => ({ models: [] }) };
    });
    const res = await post("/capability", { capability: "ai.status", args: { liveProbe: true } });
    expect(res.status).toBe(200);
    expect(calls).toBe(1); // only /api/tags — no wasted probe call.
  });
});
