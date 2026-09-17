import { normalizeTranscript } from "../interpretation/normalize";
import { collectTranscriptCandidates, type ResultLike, type TranscriptCandidate } from "./transcriptCandidates";
import { voiceDebug } from "./voiceDebug";

export interface UtteranceAssemblyTrace {
  utteranceId: string;
  rawPartials: string[];
  finalSegments: string[];
  segmentIdentities: { cycle: number; resultIndex: number }[];
  assembledUtterance: string;
  normalizedUtterance: string;
  selectedUtterance?: string;
  selectedFinalSegments?: string[];
  endpoint: "silence" | "native-end";
  status?: "FINAL" | "ASSEMBLED_COMPLETE";
}

declare global { interface Window { __FLOW_UTTERANCE_TRACES__?: UtteranceAssemblyTrace[] } }

/** A logical utterance may span native cycles. Cumulative cycle/result IDs—not
 * transcript similarity—identify replayed finals. Later indices are retained.
 * Partial hypotheses require semantic authorization at a native endpoint. */
export class UtteranceAssembler {
  private readonly finals = new Map<string, { cycle: number; resultIndex: number; result: ResultLike }>();
  private partials: string[] = [];
  private timer?: number;
  private delivered = false;
  private pendingPartial = false;
  private interruptedPartial = false;
  private currentCycle?: number;
  private assembledPreview = "";

  debugSnapshot() {
    const finalSegments = this.finalResults().map((result) => result[0]?.transcript ?? "");
    return { utteranceId: this.id, cycle: this.currentCycle, assembledUtterance: this.assembledPreview,
      interimTranscript: this.pendingPartial ? this.partials.at(-1) ?? "" : "", finalSegments,
      pendingPartial: this.pendingPartial, interruptedPartial: this.interruptedPartial, delivered: this.delivered };
  }

  constructor(private readonly id: string, private readonly silenceMs: () => number,
    private readonly onPreview: (text: string) => void,
    private readonly onComplete: (candidates: TranscriptCandidate[], trace: UtteranceAssemblyTrace) => void,
    private readonly onIncomplete: () => void = () => undefined) {}

  receive(results: ArrayLike<ResultLike>, cycle = 0) {
    if (this.delivered) return;
    if (this.currentCycle !== undefined && cycle !== this.currentCycle && this.pendingPartial) this.interruptedPartial = true;
    this.currentCycle = cycle;
    const interim: string[] = [];
    let changed = false;
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (!result) continue;
      if (result.isFinal) {
        const key = `${cycle}:${index}`;
        if (!this.finals.has(key)) {
          // Native SpeechRecognitionAlternative fields are inherited accessors,
          // so object spread loses them. Snapshot their values synchronously.
          const alternatives = Array.from({ length: result.length }, (_, position) => ({
            transcript: result[position]!.transcript, confidence: result[position]!.confidence,
          }));
          const snapshot = Object.assign(alternatives, { isFinal: true });
          this.finals.set(key, { cycle, resultIndex: index, result: snapshot }); changed = true;
        }
      } else if (result[0]?.transcript.trim()) interim.push(result[0].transcript.trim());
    }
    const pendingPartial = interim.length > 0;
    if (pendingPartial !== this.pendingPartial) changed = true;
    this.pendingPartial = pendingPartial;
    const partial = interim.join(" ");
    if (partial && this.partials.at(-1) !== partial) { this.partials = [...this.partials.slice(-127), partial]; changed = true; }
    const full = [...this.finalResults().map((result) => result[0]?.transcript.trim()), ...interim].filter(Boolean).join(" ");
    this.assembledPreview = full;
    if (full) this.onPreview(full);
    if (!changed) return;
    window.clearTimeout(this.timer);
    if (this.pendingPartial) this.timer = window.setTimeout(() => this.rejectIncomplete("partial-timeout"), Math.max(2000, this.silenceMs() * 2));
    else if (this.finals.size) this.timer = window.setTimeout(() => this.finish("silence"), this.silenceMs());
  }

  private finalResults() { return [...this.finals.values()].map(({ result }) => result); }
  private rejectIncomplete(reason = "interrupted-partial") {
    if (!this.delivered) {
      voiceDebug("assembly.incomplete", { ...this.debugSnapshot(), reason });
      this.delivered = true; this.onIncomplete();
    }
  }

  nativeEnd(isComplete: (text: string) => boolean) {
    voiceDebug("assembly.native-end-input", this.debugSnapshot());
    // Only the semantic owner may authorize a complete interim utterance.
    // Never salvage a final prefix while dropping an unresolved suffix.
    if (this.delivered || this.interruptedPartial || !this.assembledPreview || !isComplete(this.assembledPreview)) return;
    if (!this.pendingPartial) { this.finish("native-end"); return; }
    window.clearTimeout(this.timer);
    this.delivered = true;
    const transcript = this.assembledPreview;
    const trace: UtteranceAssemblyTrace = {
      utteranceId: this.id, rawPartials: [...this.partials],
      finalSegments: this.finalResults().map((result) => result[0]?.transcript.trim() ?? ""),
      segmentIdentities: [...this.finals.values()].map(({ cycle, resultIndex }) => ({ cycle, resultIndex })),
      assembledUtterance: transcript, normalizedUtterance: normalizeTranscript(transcript),
      endpoint: "native-end", status: "ASSEMBLED_COMPLETE",
    };
    this.onComplete([{ transcript, finalSegments: [transcript] }], trace);
  }

  finish(endpoint: UtteranceAssemblyTrace["endpoint"]) {
    voiceDebug("assembly.finish", { ...this.debugSnapshot(), endpoint });
    window.clearTimeout(this.timer);
    if (this.delivered || !this.finals.size) return;
    // An unresolved or transport-interrupted hypothesis never grants authority
    // to execute a cropped prefix. Partial inactivity has its own bounded error.
    if (this.pendingPartial) return;
    if (this.interruptedPartial) { this.rejectIncomplete(); return; }
    const candidates = collectTranscriptCandidates(this.finalResults(), 5);
    if (!candidates.length) return;
    this.delivered = true;
    const assembledUtterance = candidates[0]!.transcript;
    const trace: UtteranceAssemblyTrace = { utteranceId: this.id, rawPartials: [...this.partials], finalSegments: this.finalResults().map((result) => result[0]?.transcript.trim() ?? ""), segmentIdentities: [...this.finals.values()].map(({ cycle, resultIndex }) => ({ cycle, resultIndex })), assembledUtterance, normalizedUtterance: normalizeTranscript(assembledUtterance), endpoint };
    if (import.meta.env.DEV) window.__FLOW_UTTERANCE_TRACES__ = [...(window.__FLOW_UTTERANCE_TRACES__ ?? []).slice(-49), trace];
    this.onComplete(candidates, trace);
  }

  cancel() { voiceDebug("assembly.cancel", this.debugSnapshot()); window.clearTimeout(this.timer); this.delivered = true; this.finals.clear(); this.partials = []; }
}
