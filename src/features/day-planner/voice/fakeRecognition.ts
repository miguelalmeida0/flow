import type {
  RecognitionAdapter,
  RecognitionError,
  RecognitionHandlers,
  RecognitionStartOptions,
  VoiceLocale,
} from "./recognition";
import type { TranscriptCandidate } from "./transcriptCandidates";

export class FakeRecognitionAdapter implements RecognitionAdapter {
  readonly supported = true;
  readonly language: VoiceLocale;
  readonly restartDelayMs = 0;
  lastOptions?: RecognitionStartOptions;
  startCount = 0;
  abortCount = 0;
  releaseCount = 0;
  releaseDelayMs = 0;
  finalCount = 0;
  private handlers?: RecognitionHandlers;
  private utteranceStarted = false;

  constructor(locale: VoiceLocale = "en-US") { this.language = locale; }

  start(handlers: RecognitionHandlers, options: RecognitionStartOptions) {
    if (this.handlers) return;
    this.handlers = handlers;
    this.utteranceStarted = false;
    this.lastOptions = options;
    this.startCount += 1;
    handlers.onStart();
  }
  stop() {
    const handlers = this.handlers;
    this.handlers = undefined;
    handlers?.onEnd();
  }
  abort() { this.abortCount += 1; this.handlers = undefined; }
  async release(): Promise<"released"> {
    this.releaseCount += 1;
    this.abortCount += this.handlers ? 1 : 0;
    this.handlers = undefined;
    if (this.releaseDelayMs > 0) await new Promise((resolve) => window.setTimeout(resolve, this.releaseDelayMs));
    return "released";
  }
  private beginUtterance() { if (!this.utteranceStarted) { this.utteranceStarted = true; this.handlers?.onUtteranceStart?.(); } }
  emitInterim(text: string) { this.beginUtterance(); this.handlers?.onInterim(text); }
  emitFinal(value: string | TranscriptCandidate[], utteranceId = `fake-${this.startCount}-${++this.finalCount}`) {
    const handlers = this.handlers;
    if (!handlers) return;
    this.beginUtterance();
    handlers.onFinal(typeof value === "string" ? [{ transcript: value }] : value, { utteranceId, cycle: this.startCount });
    this.handlers = undefined;
    handlers.onEnd();
  }
  emitError(error: RecognitionError) {
    const handlers = this.handlers;
    if (!handlers) return;
    handlers.onError(error);
    this.handlers = undefined;
    handlers.onEnd();
  }
}
