import type { ContextPhrase } from "./contextPhrases";
import { UtteranceAssembler, type UtteranceAssemblyTrace } from "./utteranceAssembly";
import { voiceDebug, voiceDebugEnabled } from "./voiceDebug";
import {
  type ResultLike,
  type TranscriptCandidate,
} from "./transcriptCandidates";

export type VoiceLocale = "en-US" | "en-GB";
export const DEFAULT_VOICE_LOCALE: VoiceLocale = "en-US";

export type RecognitionError =
  | "permission-denied"
  | "microphone-unavailable"
  | "recognition-busy"
  | "start-failed"
  | "no-speech"
  | "incomplete-utterance"
  | "network"
  | "language-not-supported"
  | "aborted"
  | "unavailable"
  | "unknown";

export interface RecognitionHandlers {
  onStart(): void;
  onUtteranceStart?(): void;
  onSpeechStart?(): void;
  onInterim(text: string): void;
  onFinal(candidates: TranscriptCandidate[], boundary: RecognitionFinalBoundary): void;
  onError(error: RecognitionError): void;
  onEnd(): void;
}

export interface RecognitionFinalBoundary {
  utteranceId: string;
  cycle: number;
  assembly?: UtteranceAssemblyTrace;
}

export interface RecognitionStartOptions {
  locale: VoiceLocale;
  contextPhrases: ContextPhrase[];
  endpointMode?: () => "command" | "journal";
  isCompleteAtNativeEnd?: (transcript: string) => boolean;
}

export interface RecognitionAdapter {
  readonly supported: boolean;
  readonly language: VoiceLocale;
  /** Minimum quiet period before reacquiring this adapter after `onEnd`.
   * Native Web Speech keeps its conservative default; deterministic adapters
   * may opt into a zero-delay task boundary. */
  readonly restartDelayMs?: number;
  start(handlers: RecognitionHandlers, options: RecognitionStartOptions): void;
  stop(): void;
  abort(): void;
  release(timeoutMs?: number): Promise<RecognitionReleaseResult>;
}

export type RecognitionReleaseResult = "released" | "timed-out";

type ResultListLike = ArrayLike<ResultLike>;
interface EventLike extends Event { results: ResultListLike; resultIndex?: number }
interface ErrorLike extends Event { error: string }
interface PhraseLike { phrase: string; boost: number }
interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  phrases?: PhraseLike[];
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: EventLike) => void) | null;
  onerror: ((event: ErrorLike) => void) | null;
  onend: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onsoundend?: (() => void) | null;
  onaudioend?: (() => void) | null;
}
type RecognitionConstructor = new () => RecognitionLike;
type PhraseConstructor = new (phrase: string, boost?: number) => PhraseLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
    SpeechRecognitionPhrase?: PhraseConstructor;
  }
}

function normalizeError(error: string): RecognitionError {
  if (error === "not-allowed" || error === "service-not-allowed") return "permission-denied";
  if (error === "audio-capture") return "microphone-unavailable";
  if (error === "no-speech") return "no-speech";
  if (error === "network") return "network";
  if (error === "aborted") return "aborted";
  if (error === "language-not-supported") return "language-not-supported";
  return "unknown";
}

function normalizeStartError(error: unknown): RecognitionError {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "permission-denied";
  if (name === "NotFoundError" || name === "NotReadableError") return "microphone-unavailable";
  if (name === "InvalidStateError") return "recognition-busy";
  if (name === "AbortError") return "aborted";
  if (name === "NetworkError") return "network";
  if (name === "NotSupportedError") return "language-not-supported";
  return "start-failed";
}

function applyContextPhrases(instance: RecognitionLike, phrases: ContextPhrase[]) {
  const Phrase = window.SpeechRecognitionPhrase;
  if (!Phrase || !("phrases" in instance)) return;
  try {
    instance.phrases = phrases.map(({ phrase, boost }) => new Phrase(phrase, boost));
  } catch {
    // Contextual biasing is an optional browser enhancement.
  }
}

function detach(instance: RecognitionLike) {
  instance.onstart = null;
  instance.onresult = null;
  instance.onerror = null;
  instance.onend = null;
  instance.onaudiostart = instance.onsoundstart = instance.onspeechstart = null;
  instance.onspeechend = instance.onsoundend = instance.onaudioend = null;
}

export class BrowserRecognitionAdapter implements RecognitionAdapter {
  private instance?: RecognitionLike;
  private releasePromise?: Promise<RecognitionReleaseResult>;
  private fallbackEpoch = 0;
  private cycle = 0;
  private active = false;
  private assembler?: UtteranceAssembler;
  private utteranceSequence = 0;
  private completedCycle?: number;
  private static nextAdapterId = 0;
  private readonly adapterId = ++BrowserRecognitionAdapter.nextAdapterId;
  readonly supported = Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);

  constructor(readonly language: VoiceLocale = DEFAULT_VOICE_LOCALE) {}

  private discard(instance: RecognitionLike) {
    if (this.instance === instance) this.instance = undefined;
    detach(instance);
    try { instance.abort(); } catch { /* The failed browser session is already closed. */ }
  }

  start(handlers: RecognitionHandlers, options: RecognitionStartOptions) {
    if (this.active || this.releasePromise) return;
    this.startAttempt(handlers, options, true);
  }

  private startAttempt(
    handlers: RecognitionHandlers,
    options: RecognitionStartOptions,
    allowPhraseRetry: boolean,
  ) {
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) {
      handlers.onError("unavailable");
      return;
    }

    const cycle = ++this.cycle;
    const instance = this.instance ?? new Constructor();
    let deliveredFinal = false;
    this.active = true;
    this.instance = instance;
    const current = () => this.active && this.cycle === cycle && this.instance === instance;
    let committedFinalTranscript = "";
    const debug = (event: string, extra: object = {}) => {
      if (!voiceDebugEnabled()) return;
      const pending = this.assembler?.debugSnapshot() ?? null;
      voiceDebug(event, { adapterId: this.adapterId, cycle, active: this.active, current: current(),
        committedFinalTranscript, pendingUtterance: pending, endpointMode: options.endpointMode?.() ?? "command",
        ...extra });
      if (pending?.assembledUtterance) voiceDebug("semantic.snapshot", {
        utteranceId: pending.utteranceId, input: pending.assembledUtterance,
        complete: options.isCompleteAtNativeEnd?.(pending.assembledUtterance) ?? null,
      });
    };
    const finish = () => {
      debug("recognition.onend");
      if (!current()) return;
      // Native service restarts are transport boundaries, not speech endpoints.
      // The same immutable finals remain pending during the normal restart gap.
      this.active = false;
      if (options.endpointMode?.() !== "journal" && options.isCompleteAtNativeEnd) this.assembler?.nativeEnd(options.isCompleteAtNativeEnd);
      handlers.onEnd();
    };

    instance.onaudiostart = () => debug("recognition.onaudiostart");
    instance.onsoundstart = () => debug("onsoundstart");
    instance.onspeechstart = () => { debug("recognition.onspeechstart"); if (current()) handlers.onSpeechStart?.(); };
    instance.onspeechend = () => debug("onspeechend");
    instance.onsoundend = () => debug("onsoundend");
    instance.onaudioend = () => debug("onaudioend");
    instance.onstart = () => { debug("recognition.onstart"); if (current()) handlers.onStart(); };
    instance.onresult = (event) => {
      if (voiceDebugEnabled()) debug("recognition.onresult", { resultIndex: event.resultIndex,
        results: Array.from(event.results, (result, index) => ({ index, isFinal: result.isFinal,
          alternatives: Array.from({ length: result.length }, (_, i) => ({ transcript: result[i]?.transcript, confidence: result[i]?.confidence })) })) });
      if (!current() || this.completedCycle === cycle) return;
      if (!this.assembler) {
        const utteranceId = `speech-${this.adapterId}-${++this.utteranceSequence}`;
        const epoch = this.fallbackEpoch;
        const silenceMs = options.endpointMode?.() === "journal" ? 1200 : 600;
        handlers.onUtteranceStart?.();
        const assembly = new UtteranceAssembler(utteranceId, () => silenceMs,
          (text) => { if (this.fallbackEpoch === epoch) handlers.onInterim(text); },
          (candidates, trace) => {
            if (this.fallbackEpoch !== epoch || this.assembler !== assembly) return;
            this.assembler = undefined; deliveredFinal = true; this.completedCycle = this.cycle;
            committedFinalTranscript = candidates[0]?.transcript ?? "";
            debug("adapter.final", { candidates, trace });
            handlers.onFinal(candidates, { utteranceId, cycle, assembly: trace });
          }, () => {
            debug("adapter.incomplete", { reason: "assembler-rejected" });
            if (this.fallbackEpoch !== epoch || this.assembler !== assembly) return;
            this.assembler = undefined;
            handlers.onError("incomplete-utterance");
            this.stop();
          });
        this.assembler = assembly;
      }
      this.assembler.receive(event.results, cycle);
      debug("onresult.assembled");
    };
    instance.onerror = (event) => {
      debug("onerror", { error: event.error });
      if (!current()) return;
      if (event.error === "phrases-not-supported"
        && allowPhraseRetry
        && options.contextPhrases.length > 0
        && !deliveredFinal) {
        // Chrome marks the native object started before it reports that
        // contextual phrases are unsupported. Starting that same object from
        // inside the error callback races its asynchronous abort and throws
        // InvalidStateError forever. Wait for the native terminal boundary,
        // discard the object, and only then construct the plain fallback.
        const fallbackEpoch = this.fallbackEpoch;
        const release = this.releaseNative();
        const releaseCycle = this.cycle;
        void release.then((result) => {
          if (this.fallbackEpoch !== fallbackEpoch
            || this.active
            || this.releasePromise
            || this.cycle !== releaseCycle) return;
          if (result === "timed-out") {
            handlers.onError("recognition-busy"); handlers.onEnd(); return;
          }
          this.startAttempt(handlers, { ...options, contextPhrases: [] }, false);
        });
        return;
      }
      this.active = false;
      this.assembler?.cancel(); this.assembler = undefined;
      const error = normalizeError(event.error);
      this.discard(instance);
      handlers.onError(error);
      handlers.onEnd();
    };
    instance.onend = finish;

    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = 5;
    applyContextPhrases(instance, options.contextPhrases);
    // This assignment intentionally sits immediately before every start call.
    instance.lang = options.locale;
    try {
      debug("recognition.start.request");
      instance.start();
      debug("recognition.start.success");
    } catch (error) {
      debug("recognition.start.blocked", { reason: normalizeStartError(error) });
      if (!current()) return;
      this.active = false;
      this.assembler?.cancel(); this.assembler = undefined;
      this.discard(instance);
      handlers.onError(normalizeStartError(error));
      handlers.onEnd();
    }
  }

  stop() {
    voiceDebug("recognition.stop", { adapterId: this.adapterId, cycle: this.cycle, active: this.active, pendingUtterance: this.assembler?.debugSnapshot() ?? null });
    if (!this.active) return;
    this.instance?.stop();
  }

  abort() {
    this.assembler?.cancel();
    this.assembler = undefined;
    this.fallbackEpoch += 1;
    const instance = this.instance;
    if (!instance) return;
    this.active = false;
    this.cycle += 1;
    this.instance = undefined;
    detach(instance);
    try { instance.abort(); } catch { /* The browser session is already gone. */ }
  }

  release(timeoutMs = 750): Promise<RecognitionReleaseResult> {
    // Public release is an ownership/session boundary. Invalidate any optional
    // capability fallback even when it is already waiting on this same native
    // release promise, so Stop/preemption can never restart recognition later.
    this.fallbackEpoch += 1;
    return this.releaseNative(timeoutMs);
  }

  private releaseNative(timeoutMs = 750): Promise<RecognitionReleaseResult> {
    this.assembler?.cancel();
    this.assembler = undefined;
    if (this.releasePromise) return this.releasePromise;
    const instance = this.instance;
    if (!instance || !this.active) {
      if (instance) detach(instance);
      this.instance = undefined;
      return Promise.resolve("released");
    }

    this.active = false;
    this.cycle += 1;
    instance.onstart = null;
    instance.onresult = null;
    let finish!: (result: RecognitionReleaseResult) => void;
    const promise = new Promise<RecognitionReleaseResult>((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => finish("timed-out"), timeoutMs);
      finish = (result) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        detach(instance);
        if (this.instance === instance) this.instance = undefined;
        this.releasePromise = undefined;
        resolve(result);
      };
      instance.onerror = () => finish("released");
      instance.onend = () => finish("released");
    });
    this.releasePromise = promise;
    queueMicrotask(() => {
      try { instance.abort(); } catch { finish("timed-out"); }
    });
    return promise;
  }
}

export function createBrowserRecognitionAdapter(locale: VoiceLocale = DEFAULT_VOICE_LOCALE) {
  return new BrowserRecognitionAdapter(locale);
}
