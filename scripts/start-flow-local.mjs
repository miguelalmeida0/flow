#!/usr/bin/env node
/**
 * ONE reproducible command to bring up Flow's full local stack: the
 * desktop companion (Node), the voice companion (Python, Kyutai STT +
 * Kokoro TTS), Ollama, and the Vite dev server — reusing anything already
 * healthy, starting only what's missing, validating pairing/config,
 * waiting out model warm-up, and reporting the SPECIFIC failure when
 * something can't come up (never a single generic "unavailable").
 *
 * Usage: npm run start:local
 *
 * Leaves every process it started running in the foreground process group;
 * Ctrl+C stops everything this script itself started (not a companion you
 * were already running before invoking it).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VOICE_DIR = path.join(REPO_ROOT, "voice-companion");
const FLOW_HOME = path.join(homedir(), ".flow-companion");

const started = [];
let failed = false;

function log(msg) {
  console.log(`[start-flow-local] ${msg}`);
}
function fail(msg) {
  console.error(`[start-flow-local] FAILED: ${msg}`);
  failed = true;
}

async function httpJson(url, timeoutMs = 2000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function waitFor(checkFn, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  fail(`${label} did not become ready within ${Math.round(timeoutMs / 1000)}s`);
  return null;
}

function spawnTracked(name, command, args, options = {}) {
  log(`starting ${name}: ${command} ${args.join(" ")}`);
  const child = spawn(command, args, { cwd: REPO_ROOT, stdio: "inherit", ...options });
  started.push({ name, child });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) log(`${name} exited with code ${code}`);
  });
  return child;
}

process.on("SIGINT", () => {
  log("stopping services this script started...");
  for (const { name, child } of started) {
    log(`  stopping ${name}`);
    child.kill("SIGTERM");
  }
  process.exit(failed ? 1 : 0);
});

// --- 1. Ollama (reasoner) ---
log("checking Ollama...");
let ollamaOk = await httpJson("http://127.0.0.1:11434/api/tags");
if (!ollamaOk) {
  spawnTracked("ollama", "ollama", ["serve"], { stdio: "ignore" });
  ollamaOk = await waitFor(() => httpJson("http://127.0.0.1:11434/api/tags"), 15_000, "Ollama");
}
if (ollamaOk) log("Ollama: reachable, reused if already running");
else fail("Ollama could not be reached — is it installed? (`brew install ollama` or https://ollama.com)");

// --- 2. Desktop companion (port 8765) ---
log("checking desktop companion...");
let desktopHealth = await httpJson("http://127.0.0.1:8765/health");
if (!desktopHealth) {
  spawnTracked("desktop-companion", "npm", ["run", "companion:dev"]);
  desktopHealth = await waitFor(() => httpJson("http://127.0.0.1:8765/health"), 10_000, "desktop companion");
} else {
  log("desktop companion: already running, reused");
}
const desktopTokenPath = path.join(FLOW_HOME, "token");
const desktopToken = existsSync(desktopTokenPath) ? readFileSync(desktopTokenPath, "utf8").trim() : null;
if (desktopHealth && desktopToken) {
  log(`desktop companion: healthy, token at ${desktopTokenPath}`);
} else if (desktopHealth && !desktopToken) {
  fail("desktop companion is healthy but no token file was found — pairing is broken");
}

// --- 2b. Reasoner live-probe THROUGH the desktop companion (the same
// authenticated path the browser actually uses) — a bare /health 200 or a
// process existing is not proof the selected model can serve a request. ---
if (desktopHealth && desktopToken) {
  log("probing the selected reasoner model through the authenticated companion path (bounded, harmless)...");
  let probeResult = null;
  try {
    const res = await fetch("http://127.0.0.1:8765/capability", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${desktopToken}`, Origin: "http://localhost:5173" },
      body: JSON.stringify({ capability: "ai.status", args: { liveProbe: true } }),
      signal: AbortSignal.timeout(12_000),
    });
    probeResult = res.ok ? await res.json() : null;
  } catch {
    probeResult = null;
  }
  if (!probeResult) {
    fail("could not reach ai.status through the authenticated companion path — check the companion is actually the one paired in the browser");
  } else if (!probeResult.defaultModelInstalled) {
    fail(`reasoner model "${probeResult.defaultModel}" is not installed — run \`ollama pull ${probeResult.defaultModel}\``);
  } else if (probeResult.liveProbeOk === false) {
    fail(`reasoner model "${probeResult.defaultModel}" is installed but did not respond to a real request — it may be stuck loading or Ollama needs a restart`);
  } else {
    log(`reasoner ready: ${probeResult.defaultModel} responded to a real bounded request`);
  }
}

// --- 3. Voice companion (STT + TTS, port 8766) ---
log("checking voice companion...");
let voiceHealth = await httpJson("http://127.0.0.1:8766/health");
if (!voiceHealth) {
  if (!existsSync(path.join(VOICE_DIR, ".venv", "bin", "python")) || !existsSync(path.join(VOICE_DIR, ".venv-tts", "bin", "python"))) {
    fail("voice companion virtual environments are missing — see voice-companion/docs/VOICE_COMPANION.md's 'First-time setup'");
  } else {
    spawnTracked("voice-companion", path.join(VOICE_DIR, ".venv", "bin", "python"), ["server.py"], {
      cwd: VOICE_DIR,
      env: { ...process.env, HF_HOME: path.join(VOICE_DIR, ".hf-cache") },
    });
    voiceHealth = await waitFor(async () => {
      const health = await httpJson("http://127.0.0.1:8766/health");
      return health && health.sttReady && health.ttsReady ? health : null;
    }, 60_000, "voice companion (STT + TTS warm-up)");
  }
} else if (!voiceHealth.sttReady || !voiceHealth.ttsReady) {
  log("voice companion running but still warming up, waiting...");
  voiceHealth = await waitFor(async () => {
    const health = await httpJson("http://127.0.0.1:8766/health");
    return health && health.sttReady && health.ttsReady ? health : null;
  }, 60_000, "voice companion warm-up");
} else {
  log("voice companion: already running and ready, reused");
}
const voiceTokenPath = path.join(FLOW_HOME, "voice-token");
if (voiceHealth && voiceHealth.sttReady && voiceHealth.ttsReady) {
  log(`voice companion: STT ready, TTS ready, token at ${voiceTokenPath}`);
} else if (voiceHealth) {
  fail(`voice companion reachable but not fully ready: sttReady=${voiceHealth.sttReady} ttsReady=${voiceHealth.ttsReady}`);
}

// --- 4. Frontend ---
log("checking frontend...");
// Vite doesn't return JSON at "/", so treat any reachable response as up.
let frontendReachable = false;
try {
  const res = await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(1500) });
  frontendReachable = Boolean(res);
} catch {
  frontendReachable = false;
}
if (!frontendReachable) {
  spawnTracked("frontend", "npm", ["run", "dev"]);
  await waitFor(async () => {
    try {
      await fetch("http://127.0.0.1:5173", { signal: AbortSignal.timeout(1500) });
      return true;
    } catch {
      return false;
    }
  }, 15_000, "frontend");
} else {
  log("frontend: already running, reused");
}

console.log("");
if (failed) {
  console.log("[start-flow-local] STARTUP INCOMPLETE — see FAILED lines above for the specific cause.");
  process.exitCode = 1;
} else {
  console.log("[start-flow-local] READY.");
  console.log(`  Open: http://localhost:5173`);
  console.log(`  Desktop companion token file: ${desktopTokenPath}`);
  console.log(`  Voice companion token file:   ${voiceTokenPath}`);
  console.log("  (one-time browser setup: paste both tokens into localStorage — see voice-companion/docs/VOICE_COMPANION.md)");
  console.log("  Press Ctrl+C to stop the services this script started.");
}
