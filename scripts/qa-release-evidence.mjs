import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

export function voiceBrowserResultsPath(projectRoot) {
  return resolve(projectRoot, "artifacts/voice-intelligence/browser/results.json");
}

export function removeStaleVoiceBrowserResults(projectRoot) {
  const path = voiceBrowserResultsPath(projectRoot);
  const existed = existsSync(path);
  rmSync(path, { force: true });
  return existed;
}

export function physicalMicrophoneStatus({ e2eExecuted, automatedVoiceVerified }) {
  if (automatedVoiceVerified) {
    return "NOT PERFORMED — automated Chromium verified acquisition, recovery, and synthetic transcript routing; the Elite acoustic command journey still requires a human with a physical microphone";
  }
  if (e2eExecuted) {
    return "NOT PERFORMED — automated Chromium voice gates did not pass in this release attempt; no physical-microphone result is inferred";
  }
  return "NOT PERFORMED — automated Chromium voice gates were not run in this release attempt; no physical-microphone result is inferred";
}
