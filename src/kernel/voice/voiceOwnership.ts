import { getRuntimeConfig } from "../../app/runtimeMode";

/** One provider owns microphone, conversational dispatch and speech output.
 * Readiness belongs to the provider selected at startup; disconnecting a
 * hosted provider must never activate browser recognition or local companions.
 */
export type VoiceInputOwner = "kyutai-local" | "browser-fallback" | "hosted" | "none";

export function deriveVoiceInputOwner(providerAvailable: boolean): VoiceInputOwner {
  const runtime = getRuntimeConfig();
  if (runtime.mode === "typed-only") return "none";
  if (runtime.mode === "hosted") return runtime.inferenceEnabled && providerAvailable ? "hosted" : "none";
  return providerAvailable ? "kyutai-local" : "browser-fallback";
}
