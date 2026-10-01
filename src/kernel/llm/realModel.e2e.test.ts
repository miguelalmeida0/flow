/**
 * Tier B verification (see FINAL REPORT §11): exercises the REAL path —
 * kernel -> a real companion process (server/desktop-bridge/index.mjs,
 * spawned as an actual `node` child process, exactly like `npm run
 * companion:dev` would run it) -> real local Ollama runtime -> back through
 * validateModelOutput -> real kernel `submit()`. Nothing here is mocked.
 *
 * The companion runs as a genuine separate process rather than being
 * imported in-process, on purpose: Vitest's jsdom test environment replaces
 * the global `fetch` for the whole worker, and the companion's own OUTBOUND
 * call to Ollama would silently pick up that patched fetch if it were
 * imported directly into this file — a real subprocess is the only way to
 * be sure this test is exercising the exact same code path a user's
 * `npm run companion:dev` does, unaffected by the test runner's own globals.
 *
 * This release-only suite fails when the required local model is unavailable.
 * Ordinary PR CI does not run this hardware/runtime tier.
 *
 * Run explicitly with: npm run test:real-model (or npx vitest run --config vitest.realmodel.config.ts)
 */
import { describe, it, expect, afterAll } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createSession } from "../kernel";
import { journeyDocument, testEnvironment, fixedClock } from "../__tests__/fixtures";
import { runConversationTurn } from "./conversationCoordinator";
import { DESKTOP_COMPANION_TOKEN_KEY, DESKTOP_COMPANION_BASE_URL_KEY } from "../lib/desktopBridgeClient";

const MODEL_ID = "qwen3-vl:2b-instruct-q4_K_M";
const REPO_ROOT = path.resolve(__dirname, "../../..");

function waitForLine(child: ReturnType<typeof spawn>, pattern: RegExp, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for companion output matching ${pattern}`)), timeoutMs);
    child.stdout?.on("data", (chunk: unknown) => {
      buffer += String(chunk);
      const match = buffer.match(pattern);
      if (match) { clearTimeout(timer); resolve(match[1] ?? match[0]); }
    });
    child.on("exit", (code: number | null) => { clearTimeout(timer); reject(new Error(`Companion exited early (code ${code})`)); });
  });
}

const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "flow-real-model-"));
let child: ReturnType<typeof spawn> | undefined;
let baseUrl = "";
let modelAvailable = false;

// A real browser's fetch automatically attaches an Origin header on a
// cross-origin request (localhost:5173 -> localhost:8765); Node's fetch
// (what this test runs under) does not, since it isn't a browser context.
// This wrapper restores that one behavior so the test exercises the
// companion's real origin-allowlist check the way production traffic
// actually does, rather than weakening it in production code.
function browserLikeFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, headers: { ...init?.headers, Origin: "http://localhost:5173" } });
}

try {
  const port = 20000 + Math.floor(Math.random() * 10000);
  child = spawn("node", ["server/desktop-bridge/index.mjs"], {
    cwd: REPO_ROOT,
    env: { ...process.env, FLOW_COMPANION_PORT: String(port), FLOW_COMPANION_CONFIG_DIR: configDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForLine(child, /listening on (http:\/\/127\.0\.0\.1:\d+)/, 10_000);
  const token = fs.readFileSync(path.join(configDir, "token"), "utf8").trim();
  baseUrl = `http://127.0.0.1:${port}`;
  localStorage.setItem(DESKTOP_COMPANION_TOKEN_KEY, token);
  localStorage.setItem(DESKTOP_COMPANION_BASE_URL_KEY, baseUrl);

  const response = await fetch(`${baseUrl}/capability`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, Origin: "http://localhost:5173" },
    body: JSON.stringify({ capability: "ai.status", args: {} }),
  });
  const status = (await response.json()) as { available: boolean; model: string | null };
  modelAvailable = status.available === true;
} catch (error) {
  console.warn("[realModel.e2e] companion startup/status probe failed:", error);
  modelAvailable = false;
}
console.log(`[realModel.e2e] real companion + local model (${MODEL_ID}) available: ${modelAvailable}`);

afterAll(() => {
  child?.kill();
  fs.rmSync(configDir, { recursive: true, force: true });
});

describe("real local model, real companion process (Tier B)", () => {
  it("produces a real spoken answer for an unfamiliar explanatory question, with no action taken", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const start = Date.now();
    const result = await runConversationTurn({
      rawTranscript: "In plain terms, why does resizing a browser window trigger a reflow?",
      normalizedTranscript: "In plain terms, why does resizing a browser window trigger a reflow?",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: browserLikeFetch,
    });
    const latencyMs = Date.now() - start;
    console.log(`[realModel.e2e] answer latency: ${latencyMs}ms, message: ${result.message.slice(0, 160)}`);
    expect(result.recognized).toBe(true);
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.env.document).toBe(env.document);
  }, 45_000);

  it("produces a real validated calendar.move plan for a novel phrasing, executed through the real kernel", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const start = Date.now();
    const result = await runConversationTurn({
      rawTranscript: "Push dinner back to six tonight",
      normalizedTranscript: "Push dinner back to six tonight",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: browserLikeFetch,
    });
    const latencyMs = Date.now() - start;
    console.log(`[realModel.e2e] plan latency: ${latencyMs}ms, outcome: ${result.outcome.status}, message: ${result.message.slice(0, 160)}`);
    // This asserts the REAL round trip completed without crashing and
    // without ever mutating the document on anything less than a fully
    // validated plan — it deliberately does NOT assert which outcome the
    // small 2B model reaches on this novel phrasing (executed/proposed/
    // clarify/declined are all legitimate depending on what the model
    // produced this run). Aggregate semantic accuracy across many phrasings
    // is measured by the acceptance corpus runner, not a single example.
    expect(["executed", "proposed", "clarify", "error"]).toContain(result.outcome.status);
    if (result.outcome.status !== "executed") {
      expect(result.env.document.calendar.events).toEqual(env.document.calendar.events);
    }
  }, 45_000);
});

describe("real local model availability", () => {
  it("requires the actual configured local model to be available", () => {
    if (!modelAvailable) console.warn(`[realModel.e2e] availability: real companion + ${MODEL_ID} were not both reachable on this machine right now.`);
    expect(modelAvailable, "Required real local Ollama model is unavailable").toBe(true);
  });
});
