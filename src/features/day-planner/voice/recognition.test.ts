import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrowserRecognitionAdapter,
  type RecognitionError,
  type RecognitionHandlers,
} from "./recognition";

class MockPhrase {
  constructor(public phrase: string, public boost = 1) {}
}

class MockRecognition {
  static instances: MockRecognition[] = [];
  static startFailures: unknown[] = [];
  static abortDelayMs = 0;
  static suppressAbortEnd = false;
  continuous = true;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  phrases: MockPhrase[] = [];
  onstart: (() => void) | null = null;
  onresult: ((event: { results: ArrayLike<unknown> }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startedWith?: { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number };
  aborted = false;
  started = false;

  constructor() { MockRecognition.instances.push(this); }
  start() {
    const failure = MockRecognition.startFailures.shift();
    if (failure) throw failure;
    if (this.started) throw new DOMException("Recognition is already active", "InvalidStateError");
    this.started = true;
    this.startedWith = {
      lang: this.lang,
      continuous: this.continuous,
      interimResults: this.interimResults,
      maxAlternatives: this.maxAlternatives,
    };
    this.onstart?.();
  }
  stop() { this.started = false; this.onend?.(); }
  abort() {
    this.aborted = true;
    if (MockRecognition.suppressAbortEnd) return;
    const finish = () => { this.started = false; this.onend?.(); };
    if (MockRecognition.abortDelayMs > 0) window.setTimeout(finish, MockRecognition.abortDelayMs);
    else finish();
  }
  end() { this.started = false; this.onend?.(); }
  error(value: string) { this.onerror?.({ error: value }); }
  final(alternatives: { transcript: string; confidence?: number }[]) {
    const result = Object.assign({}, alternatives, { isFinal: true, length: alternatives.length });
    this.onresult?.({ results: [result] });
  }
}

function handlers(): RecognitionHandlers {
  return {
    onStart: vi.fn(),
    onInterim: vi.fn(),
    onFinal: vi.fn(),
    onError: vi.fn(),
    onEnd: vi.fn(),
  };
}

function installBrowserSpeech() {
  MockRecognition.instances = [];
  MockRecognition.startFailures = [];
  MockRecognition.abortDelayMs = 0;
  MockRecognition.suppressAbortEnd = false;
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: MockRecognition });
  Object.defineProperty(window, "SpeechRecognitionPhrase", { configurable: true, value: MockPhrase });
}

afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers();
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
  Object.defineProperty(window, "SpeechRecognitionPhrase", { configurable: true, value: undefined });
});

describe("browser recognition adapter", () => {
  it.each(["FL", "flow", "open the journal", ""])("snapshots native accessor alternatives without losing text: %j", async (transcript) => {
    vi.useFakeTimers(); installBrowserSpeech();
    const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
    adapter.start(callbacks, { locale: "en-US", contextPhrases: [] });
    const native = MockRecognition.instances[0]!;
    let text = transcript;
    const alternative = Object.create(Object.defineProperties({}, {
      transcript: { get: () => text }, confidence: { get: () => 0.8361773490905762 },
    }));
    expect({ ...alternative }).toEqual({}); // WebIDL accessors are not own data properties.
    native.onresult?.({ results: [Object.assign([alternative], { isFinal: false })] });
    expect(() => native.onresult?.({ results: [Object.assign([alternative], { isFinal: true })] })).not.toThrow();
    text = "changed after callback";
    native.end();
    await vi.advanceTimersByTimeAsync(2500);
    expect(callbacks.onError).not.toHaveBeenCalled();
    if (transcript) {
      expect(callbacks.onFinal).toHaveBeenCalledTimes(1);
      expect(callbacks.onFinal).toHaveBeenCalledWith(
        [expect.objectContaining({ transcript, confidence: 0.8361773490905762 })],
        expect.objectContaining({ assembly: expect.objectContaining({ finalSegments: [transcript] }) }),
      );
    } else expect(callbacks.onFinal).not.toHaveBeenCalled();
  });

  it("reports an unfinished native suffix without executing or promoting its partial words", async () => {
    vi.useFakeTimers(); installBrowserSpeech(); const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
    adapter.start(callbacks, { locale: "en-US", contextPhrases: [] }); const native = MockRecognition.instances[0]!;
    native.onresult?.({ results: [Object.assign([{ transcript: "Rename it" }], { isFinal: true }), Object.assign([{ transcript: "Fish and" }], { isFinal: false })] });
    native.end(); await vi.advanceTimersByTimeAsync(2500);
    expect(callbacks.onFinal).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith("incomplete-utterance");
  });

  it("cancels a pending logical utterance if the next native acquisition throws", async () => {
    vi.useFakeTimers(); installBrowserSpeech(); const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
    const options = { locale: "en-US" as const, contextPhrases: [] };
    adapter.start(callbacks, options); const native = MockRecognition.instances[0]!;
    native.final([{ transcript: "Delete the meeting" }]); await vi.advanceTimersByTimeAsync(100); native.end();
    MockRecognition.startFailures = [new DOMException("Blocked", "NotAllowedError")]; adapter.start(callbacks, options);
    await vi.advanceTimersByTimeAsync(2000);
    expect(callbacks.onError).toHaveBeenCalledWith("permission-denied"); expect(callbacks.onFinal).not.toHaveBeenCalled();
  });
  it("keeps a logical utterance across a native restart instead of committing its prefix", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech(); const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
      const options = { locale: "en-US" as const, contextPhrases: [] };
      adapter.start(callbacks, options); const native = MockRecognition.instances[0]!;
      native.final([{ transcript: "Rename it Fish" }]);
      await vi.advanceTimersByTimeAsync(100); native.end();
      expect(callbacks.onFinal).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(280); adapter.start(callbacks, options);
      native.final([{ transcript: "and Chips" }]);
      await vi.advanceTimersByTimeAsync(600);
      expect(callbacks.onFinal).toHaveBeenCalledOnce();
      expect(callbacks.onFinal).toHaveBeenCalledWith([expect.objectContaining({ transcript: "Rename it Fish and Chips" })], expect.objectContaining({ assembly: expect.objectContaining({ finalSegments: ["Rename it Fish", "and Chips"] }) }));
    } finally { vi.useRealTimers(); }
  });

  it("rearms the endpoint after a native interim hypothesis is withdrawn", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech(); const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
      adapter.start(callbacks, { locale: "en-US", contextPhrases: [] }); const native = MockRecognition.instances[0]!;
      const final = Object.assign({}, [{ transcript: "Open calendar" }], { isFinal: true, length: 1 });
      const partial = Object.assign({}, [{ transcript: "please" }], { isFinal: false, length: 1 });
      native.onresult?.({ results: [final] }); await vi.advanceTimersByTimeAsync(100);
      native.onresult?.({ results: [final, partial] }); await vi.advanceTimersByTimeAsync(100);
      native.onresult?.({ results: [final] }); await vi.advanceTimersByTimeAsync(600);
      expect(callbacks.onFinal).toHaveBeenCalledOnce();
      expect(callbacks.onFinal).toHaveBeenCalledWith([expect.objectContaining({ transcript: "Open calendar" })], expect.anything());
    } finally { vi.useRealTimers(); }
  });

  it("cancels queued finals and saved native callbacks at an explicit release", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech(); const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
      const options = { locale: "en-US" as const, contextPhrases: [] };
      adapter.start(callbacks, options); const native = MockRecognition.instances[0]!;
      const savedResult = native.onresult;
      native.final([{ transcript: "Delete this meeting" }]); await vi.advanceTimersByTimeAsync(100);
      await adapter.release(); await vi.advanceTimersByTimeAsync(2000);
      savedResult?.({ results: [Object.assign({}, [{ transcript: "Delete this meeting" }], { isFinal: true, length: 1 })] });
      expect(callbacks.onFinal).not.toHaveBeenCalled();
      adapter.start(callbacks, options); MockRecognition.instances.at(-1)!.final([{ transcript: "Open calendar" }]);
      await vi.advanceTimersByTimeAsync(600); expect(callbacks.onFinal).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
  it("assembles distinct native final indices across a small pause before execution", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech();
      const adapter = new BrowserRecognitionAdapter();
      const callbacks = handlers();
      adapter.start(callbacks, { locale: "en-US", contextPhrases: [] });
      const native = MockRecognition.instances[0]!;
      const first = Object.assign({}, [{ transcript: "edit the eleven a.m. meeting name" }], { isFinal: true, length: 1 });
      const last = Object.assign({}, [{ transcript: "and change it to dog walking" }], { isFinal: true, length: 1 });
      native.onresult?.({ results: [first] });
      await vi.advanceTimersByTimeAsync(150);
      expect(callbacks.onFinal).not.toHaveBeenCalled();
      native.onresult?.({ results: [first, last] });
      native.onresult?.({ results: [first, last] });
      await vi.advanceTimersByTimeAsync(800);
      expect(callbacks.onFinal).toHaveBeenCalledOnce();
      expect(callbacks.onFinal).toHaveBeenCalledWith([expect.objectContaining({ transcript: "edit the eleven a.m. meeting name and change it to dog walking" })], expect.anything());
    } finally { vi.useRealTimers(); }
  });
  it("sets explicit locale, five alternatives, and contextual phrases before every start", () => {
    installBrowserSpeech();
    const adapter = new BrowserRecognitionAdapter("en-US");
    const firstHandlers = handlers();
    const options = { locale: "en-US" as const, contextPhrases: [{ phrase: "Interview", boost: 3 }] };
    adapter.start(firstHandlers, options);
    const first = MockRecognition.instances[0]!;
    expect(first.startedWith).toEqual({ lang: "en-US", continuous: true, interimResults: true, maxAlternatives: 5 });
    expect(first.phrases).toEqual([expect.objectContaining({ phrase: "Interview", boost: 3 })]);
    expect(firstHandlers.onStart).toHaveBeenCalledOnce();

    adapter.start(handlers(), options);
    expect(MockRecognition.instances).toHaveLength(1);
    first.end();
    adapter.start(handlers(), options);
    expect(MockRecognition.instances).toHaveLength(1);
    expect(first.startedWith?.lang).toBe("en-US");
  });

  it("forwards all final alternatives with confidence exactly once", async () => {
    vi.useFakeTimers();
    installBrowserSpeech();
    const adapter = new BrowserRecognitionAdapter();
    const callbacks = handlers();
    adapter.start(callbacks, { locale: "en-US", contextPhrases: [] });
    const recognition = MockRecognition.instances[0]!;
    recognition.final([
      { transcript: "movimento vio", confidence: 0.9 },
      { transcript: "move interview", confidence: 0.7 },
      { transcript: "move interview to six", confidence: 0.5 },
    ]);
    recognition.final([{ transcript: "duplicate", confidence: 1 }]);
    recognition.end();
    expect(callbacks.onFinal).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(callbacks.onFinal).toHaveBeenCalledOnce();
    expect(callbacks.onFinal).toHaveBeenCalledWith([
      expect.objectContaining({ transcript: "movimento vio", confidence: 0.9 }),
      expect.objectContaining({ transcript: "move interview", confidence: 0.7 }),
      expect.objectContaining({ transcript: "move interview to six", confidence: 0.5 }),
    ], expect.objectContaining({ utteranceId: expect.stringMatching(/^speech-/), cycle: 1 }));
  });

  it("detaches stale callbacks when aborted", () => {
    installBrowserSpeech();
    const adapter = new BrowserRecognitionAdapter();
    const callbacks = handlers();
    adapter.start(callbacks, { locale: "en-US", contextPhrases: [] });
    const recognition = MockRecognition.instances[0]!;
    adapter.abort();
    expect(recognition.aborted).toBe(true);
    expect(recognition.onresult).toBeNull();
    expect(recognition.onerror).toBeNull();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
  });

  it("confirms forced release only after the native recognizer emits its terminal signal", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech();
      MockRecognition.abortDelayMs = 180;
      const adapter = new BrowserRecognitionAdapter();
      const callbacks = handlers();
      const options = { locale: "en-US" as const, contextPhrases: [] };
      adapter.start(callbacks, options);
      const native = MockRecognition.instances[0]!;
      let result: string | undefined;
      const release = adapter.release(500).then((value) => { result = value; return value; });
      await Promise.resolve();
      expect(native.aborted).toBe(true);
      expect(native.onresult).toBeNull();
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(179);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await expect(release).resolves.toBe("released");
      adapter.start(handlers(), options);
      expect(MockRecognition.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds a missing native terminal signal and still discards the stuck recognizer", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech();
      MockRecognition.suppressAbortEnd = true;
      const adapter = new BrowserRecognitionAdapter();
      const options = { locale: "en-US" as const, contextPhrases: [] };
      adapter.start(handlers(), options);
      const release = adapter.release(250);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(250);
      await expect(release).resolves.toBe("timed-out");
      MockRecognition.suppressAbortEnd = false;
      adapter.start(handlers(), options);
      expect(MockRecognition.instances).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards an audio-capture failure and starts a fresh native recognizer on explicit retry", async () => {
    vi.useFakeTimers();
    installBrowserSpeech();
    const adapter = new BrowserRecognitionAdapter();
    const firstHandlers = handlers();
    const options = { locale: "en-US" as const, contextPhrases: [] };
    adapter.start(firstHandlers, options);
    const failed = MockRecognition.instances[0]!;
    failed.error("audio-capture");
    expect(firstHandlers.onError).toHaveBeenCalledWith("microphone-unavailable");
    expect(failed.aborted).toBe(true);
    expect(failed.onresult).toBeNull();

    const retryHandlers = handlers();
    adapter.start(retryHandlers, options);
    expect(MockRecognition.instances).toHaveLength(2);
    const retry = MockRecognition.instances[1]!;
    failed.final([{ transcript: "stale capture", confidence: 1 }]);
    retry.final([{ transcript: "Capture Buy coffee", confidence: 1 }]);
    retry.final([{ transcript: "duplicate", confidence: 1 }]);
    retry.end();
    await vi.advanceTimersByTimeAsync(600);
    expect(retryHandlers.onStart).toHaveBeenCalledOnce();
    expect(retryHandlers.onFinal).toHaveBeenCalledOnce();
    expect(firstHandlers.onFinal).not.toHaveBeenCalled();
  });

  it.each([
    ["NotAllowedError", "permission-denied"],
    ["SecurityError", "permission-denied"],
    ["NotFoundError", "microphone-unavailable"],
    ["NotReadableError", "microphone-unavailable"],
    ["InvalidStateError", "recognition-busy"],
    ["AbortError", "aborted"],
    ["NetworkError", "network"],
    ["UnknownError", "start-failed"],
  ] as const)("classifies synchronous %s honestly and makes retry construct a clean recognizer", (name, expected) => {
    installBrowserSpeech();
    MockRecognition.startFailures = [new DOMException("start failed", name)];
    const adapter = new BrowserRecognitionAdapter();
    const failedHandlers = handlers();
    const options = { locale: "en-US" as const, contextPhrases: [] };
    adapter.start(failedHandlers, options);
    expect(failedHandlers.onError).toHaveBeenCalledWith(expected satisfies RecognitionError);
    expect(failedHandlers.onEnd).toHaveBeenCalledOnce();
    expect(MockRecognition.instances[0]?.aborted).toBe(true);

    const retryHandlers = handlers();
    adapter.start(retryHandlers, options);
    expect(MockRecognition.instances).toHaveLength(2);
    expect(retryHandlers.onStart).toHaveBeenCalledOnce();
  });

  it("waits for native end before retrying once without unsupported contextual phrases", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech(); MockRecognition.abortDelayMs = 180;
      const adapter = new BrowserRecognitionAdapter();
      const callbacks = handlers();
      adapter.start(callbacks, {
        locale: "en-US",
        contextPhrases: [{ phrase: "Interview", boost: 3 }],
      });
      const first = MockRecognition.instances[0]!;
      expect(first.phrases).toHaveLength(1);

      first.error("phrases-not-supported");
      expect(first.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(179);
      expect(MockRecognition.instances).toHaveLength(1);
      expect(first.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(callbacks.onError).not.toHaveBeenCalled();
      expect(callbacks.onEnd).not.toHaveBeenCalled();
      expect(MockRecognition.instances).toHaveLength(2);

      const fallback = MockRecognition.instances[1]!;
      expect(fallback.startedWith).toEqual({ lang: "en-US", continuous: true, interimResults: true, maxAlternatives: 5 });
      expect(fallback.phrases).toEqual([]);
      fallback.final([
        { transcript: "movimento vio", confidence: 0.9 },
        { transcript: "move interview to six", confidence: 0.5 },
      ]);
      await vi.advanceTimersByTimeAsync(600);
      expect(callbacks.onFinal).toHaveBeenCalledWith([
        expect.objectContaining({ transcript: "movimento vio", confidence: 0.9 }),
        expect.objectContaining({ transcript: "move interview to six", confidence: 0.5 }),
      ], expect.objectContaining({ utteranceId: expect.stringMatching(/^speech-/), cycle: 3 }));

      fallback.error("phrases-not-supported");
      expect(MockRecognition.instances).toHaveLength(2);
      expect(callbacks.onError).toHaveBeenCalledWith("unknown");
      expect(callbacks.onEnd).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("cancels a pending phrase fallback when an external release ends the Live session", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech(); MockRecognition.abortDelayMs = 180;
      const adapter = new BrowserRecognitionAdapter();
      const callbacks = handlers();
      const options = {
        locale: "en-US" as const,
        contextPhrases: [{ phrase: "Interview", boost: 3 }],
      };
      adapter.start(callbacks, options);
      const first = MockRecognition.instances[0]!;
      first.error("phrases-not-supported");

      // Stop/preemption reaches the same in-flight native release. It must
      // still invalidate the capability fallback attached to that promise.
      const externalRelease = adapter.release(500);
      await vi.advanceTimersByTimeAsync(180);
      await expect(externalRelease).resolves.toBe("released");
      await Promise.resolve();
      expect(MockRecognition.instances).toHaveLength(1);
      expect(callbacks.onStart).toHaveBeenCalledOnce();
      expect(callbacks.onFinal).not.toHaveBeenCalled();
      expect(callbacks.onEnd).not.toHaveBeenCalled();
      first.final([{ transcript: "Capture stale fallback", confidence: 1 }]);
      expect(callbacks.onFinal).not.toHaveBeenCalled();

      const freshCallbacks = handlers();
      adapter.start(freshCallbacks, options);
      expect(MockRecognition.instances).toHaveLength(2);
      expect(freshCallbacks.onStart).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("surfaces a bounded busy error when the phrase fallback never receives native end", async () => {
    vi.useFakeTimers();
    try {
      installBrowserSpeech(); MockRecognition.suppressAbortEnd = true;
      const adapter = new BrowserRecognitionAdapter(); const callbacks = handlers();
      adapter.start(callbacks, { locale: "en-US", contextPhrases: [{ phrase: "Interview", boost: 3 }] });
      MockRecognition.instances[0]!.error("phrases-not-supported");
      await vi.advanceTimersByTimeAsync(749);
      expect(callbacks.onError).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(callbacks.onError).toHaveBeenCalledWith("recognition-busy");
      expect(callbacks.onEnd).toHaveBeenCalledOnce();
      expect(MockRecognition.instances).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it.each([
    ["not-allowed", "permission-denied"],
    ["audio-capture", "microphone-unavailable"],
    ["no-speech", "no-speech"],
    ["network", "network"],
    ["aborted", "aborted"],
    ["language-not-supported", "language-not-supported"],
  ] as const)("maps %s to %s", (browserError, expected) => {
    installBrowserSpeech();
    const adapter = new BrowserRecognitionAdapter();
    const callbacks = handlers();
    adapter.start(callbacks, { locale: "en-US", contextPhrases: [] });
    MockRecognition.instances[0]!.error(browserError);
    expect(callbacks.onError).toHaveBeenCalledWith(expected satisfies RecognitionError);
  });
});
