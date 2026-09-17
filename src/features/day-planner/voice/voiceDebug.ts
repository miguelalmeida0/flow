// Temporary, opt-in development diagnostics. No storage or network transport.
let sequence = 0;
let optedIn = false;
export function voiceDebugEnabled() {
  if (!import.meta.env.DEV) return false;
  // Keep this tab's trace enabled when navigation removes the query string.
  optedIn ||= new URLSearchParams(window.location.search).get("flowVoiceDebug") === "1";
  return optedIn;
}

export function voiceDebug(event: string, state: unknown) {
  if (!voiceDebugEnabled()) return;
  console.info("[flow-voice-debug]", JSON.stringify({ sequence: ++sequence, at: performance.now(), event, state }));
}
