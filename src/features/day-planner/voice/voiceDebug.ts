import { localCompanionsAllowed } from "../../../kernel/lib/localCompanionUrl";

// Explicit local diagnostics also support the exact production artifact.
// Public-origin pages never emit these potentially personal voice traces.
let sequence = 0;
let optedIn = false;
export function voiceDebugEnabled() {
  if (!localCompanionsAllowed()) return false;
  // Keep this tab's trace enabled when navigation removes the query string.
  optedIn ||= new URLSearchParams(window.location.search).get("flowVoiceDebug") === "1";
  return optedIn;
}

export function voiceDebug(event: string, state: unknown) {
  if (!voiceDebugEnabled()) return;
  console.info("[flow-voice-debug]", JSON.stringify({ sequence: ++sequence, at: performance.now(), event, state }));
}
