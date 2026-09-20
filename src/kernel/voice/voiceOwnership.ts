/**
 * Flow must have exactly ONE authoritative microphone/transcription/dispatch
 * owner at runtime — never both the local Kyutai pipeline and the legacy
 * browser SpeechRecognition path (GlobalCommandDock/useFlowLiveSession)
 * dispatching the same physical utterance into the kernel at once.
 *
 * Ownership is a pure function of one signal: whether the local voice
 * companion is available (connected + STT ready + TTS ready — see
 * useKyutaiVoiceSession's `available`). When it is, Kyutai owns
 * conversational dispatch; the legacy browser recognizer keeps running
 * ONLY for wake-word spotting (it still transitions voice-home UI state)
 * but must never call `runCommand` itself — see GlobalCommandDock.tsx's
 * `dispatchIfOwned` wrapper, which is the actual enforcement point. This
 * module only computes WHO owns; it holds no state of its own.
 */
export type VoiceInputOwner = "kyutai-local" | "browser-fallback";

export function deriveVoiceInputOwner(kyutaiAvailable: boolean): VoiceInputOwner {
  return kyutaiAvailable ? "kyutai-local" : "browser-fallback";
}
