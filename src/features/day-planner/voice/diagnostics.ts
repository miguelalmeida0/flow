import type { CandidateAnalysis, TranscriptCandidate } from "./transcriptCandidates";
import type { VoiceLocale } from "./recognition";

function enabled() {
  const environment = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
  if (environment?.DEV !== true) return false;
  try {
    return window.localStorage.getItem("flow.voice.diagnostics") === "true";
  } catch {
    return false;
  }
}

export function logVoiceDiagnostics(input: {
  locale: VoiceLocale;
  candidates: TranscriptCandidate[];
  selected?: CandidateAnalysis;
  result: string;
}) {
  if (!enabled()) return;
  console.debug("[Flow Voice]", {
    "voice.locale": input.locale,
    "voice.rawCandidates": input.candidates,
    "voice.selectedCandidate": input.selected?.candidate.transcript,
    "voice.browserConfidence": input.selected?.candidate.confidence,
    "voice.interpretation": input.selected?.interpretation,
    "voice.result": input.result,
    reason: input.selected?.reason,
  });
}
