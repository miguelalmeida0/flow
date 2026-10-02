import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useKyutaiVoiceSession } from "./useKyutaiVoiceSession";
import type { VoiceCompanionClient, VoiceCompanionEvent, VoiceCompanionListener } from "../../kernel/voice/voiceCompanionClient";
import type { VoiceMicCapture } from "../../kernel/voice/voiceMicCapture";

class FakeClient {
  listeners = new Set<VoiceCompanionListener>();
  sent: { kind: string; text?: string }[] = [];
  connect = vi.fn();
  disconnect = vi.fn();
  sendAudio = vi.fn();
  startSession = vi.fn(() => this.sent.push({ kind: "start" }));
  setInputMode = vi.fn();
  stopSession = vi.fn(() => this.sent.push({ kind: "stop" }));
  speak = vi.fn((text: string) => this.sent.push({ kind: "speak", text }));
  cancelSpeak = vi.fn(() => this.sent.push({ kind: "cancel" }));
  on(listener: VoiceCompanionListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: VoiceCompanionEvent) {
    for (const l of this.listeners) l(event);
  }
}

function fakeMicCapture(): [ReturnType<typeof vi.fn>, () => Promise<VoiceMicCapture>] {
  const stop = vi.fn();
  const impl = vi.fn(async () => ({ stop }));
  return [stop, impl as unknown as () => Promise<VoiceMicCapture>];
}

function fakeTtsPlayer() {
  return { beginUtterance: vi.fn(), enqueueChunk: vi.fn(), cancel: vi.fn(), close: vi.fn() };
}

describe("useKyutaiVoiceSession", () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
  });

  it("wakes, starts mic capture once the companion confirms ready, and reports the final transcript verbatim", async () => {
    const [, micImpl] = fakeMicCapture();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: onFinal,
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    expect(result.current.state).toBe("SLEEPING");
    expect(client.connect).toHaveBeenCalled();

    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    expect(result.current.available).toBe(true);

    act(() => result.current.wake());
    expect(result.current.state).toBe("READY");

    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    expect(result.current.state).toBe("LISTENING");
    await act(async () => {
      await Promise.resolve();
    });
    expect(micImpl).toHaveBeenCalled();
    expect(client.startSession).toHaveBeenCalled();

    act(() => client.emit({ type: "speech.start" }));
    expect(result.current.state).toBe("USER_SPEAKING");
    act(() => client.emit({ type: "transcript.partial", text: "Move Dinner" }));
    expect(result.current.state).toBe("TRANSCRIBING");
    act(() => client.emit({ type: "transcript.final", text: "Move Dinner to Six" }));
    expect(result.current.state).toBe("UNDERSTANDING");
    // Verbatim, not lowercased — Phase 3's "no destructive normalization".
    expect(onFinal).toHaveBeenCalledWith("Move Dinner to Six");
  });

  it("detects the wake word locally through Kyutai's own transcript, without calling wake() explicitly (physical-test repair B)", async () => {
    const [, micImpl] = fakeMicCapture();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: onFinal,
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    expect(result.current.state).toBe("SLEEPING");
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    await act(async () => {
      await Promise.resolve();
    });
    // Mic capture must already be running while SLEEPING — that's the whole
    // point of local wake-word spotting.
    expect(micImpl).toHaveBeenCalled();

    act(() => client.emit({ type: "transcript.partial", text: "Flow" }));
    expect(result.current.state).toBe("SLEEPING"); // incomplete token may still become Flowers.
    act(() => client.emit({ type: "transcript.final", text: "Flow" }));
    expect(onFinal).not.toHaveBeenCalled(); // the bare wake word alone is not a command.
  });

  it("a bundled 'Flow, open calendar' wakes AND dispatches only the words after the wake word", async () => {
    const [, micImpl] = fakeMicCapture();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: onFinal,
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => client.emit({ type: "transcript.partial", text: "Flow, open" }));
    expect(result.current.state).toBe("TRANSCRIBING");
    act(() => client.emit({ type: "transcript.final", text: "Flow, open calendar" }));
    expect(onFinal).toHaveBeenCalledWith("open calendar");
  });

  it("does not false-trigger on 'flow' inside another word (workflow)", async () => {
    const [, micImpl] = fakeMicCapture();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: onFinal,
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => client.emit({ type: "transcript.partial", text: "check my workflow" }));
    expect(result.current.state).toBe("SLEEPING");
    act(() => client.emit({ type: "transcript.final", text: "check my workflow" }));
    expect(result.current.state).toBe("SLEEPING");
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("mic capture does not attempt to start (and session.start is never sent) before the companion confirms ready", () => {
    const [, micImpl] = fakeMicCapture();
    renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: vi.fn(),
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    // No "ready" event emitted yet — SLEEPING is mic-active in principle,
    // but must not attempt capture until `available` is actually true.
    expect(micImpl).not.toHaveBeenCalled();
    expect(client.startSession).not.toHaveBeenCalled();
  });

  it("speaking a response plays TTS and barge-in cancels it and starts a new turn", async () => {
    const [, micImpl] = fakeMicCapture();
    const ttsPlayer = fakeTtsPlayer();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: vi.fn(),
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: () => ttsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => result.current.wake());
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    // Drive to UNDERSTANDING then simulate the app calling speak().
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "What time is it" }));

    act(() => result.current.speak("It's four thirty."));
    expect(client.speak).toHaveBeenCalledWith("It's four thirty.");

    act(() => client.emit({ type: "tts.start" }));
    expect(ttsPlayer.beginUtterance).toHaveBeenCalled();

    const audioChunk = new ArrayBuffer(4);
    act(() => client.emit({ type: "tts.audio", data: audioChunk }));
    expect(ttsPlayer.enqueueChunk).toHaveBeenCalledWith(audioChunk);

    // Barge-in: user starts talking while Flow is speaking.
    act(() => client.emit({ type: "speech.start" }));
    expect(ttsPlayer.cancel).toHaveBeenCalled();
    expect(client.cancelSpeak).toHaveBeenCalled();
    expect(result.current.state).toBe("USER_SPEAKING");
  });

  it("cancel() stops speech and returns to LISTENING without invoking onFinalTranscript again", async () => {
    const [, micImpl] = fakeMicCapture();
    const ttsPlayer = fakeTtsPlayer();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: onFinal,
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: () => ttsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => result.current.wake());
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "Move dinner— actually never mind" }));
    expect(onFinal).toHaveBeenCalledTimes(1);

    act(() => result.current.cancel());
    expect(result.current.state).toBe("LISTENING");
    expect(ttsPlayer.cancel).toHaveBeenCalled();
    expect(client.cancelSpeak).toHaveBeenCalled();
    expect(onFinal).toHaveBeenCalledTimes(1); // not called again by cancel itself.
  });

  it("suppresses an immediate duplicate final transcript (Phase 17's duplicate-final requirement)", () => {
    const [, micImpl] = fakeMicCapture();
    const onFinal = vi.fn();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: onFinal,
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => result.current.wake());
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "Move dinner to six" }));
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "Move dinner to six" }));
    expect(onFinal).toHaveBeenCalledTimes(1);

    // A genuinely different utterance right after is NOT suppressed.
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "Move dinner to seven" }));
    expect(onFinal).toHaveBeenCalledTimes(2);
  });

  it("being evicted by another tab (code 4409) goes quietly back to SLEEPING, not ERROR (physical-test repair B: exclusive ownership)", () => {
    const [, micImpl] = fakeMicCapture();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: vi.fn(),
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => result.current.wake());
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    expect(result.current.state).toBe("LISTENING");

    act(() => client.emit({ type: "connectionClosed", code: 4409, reason: "superseded by a newer tab" }));
    expect(result.current.state).toBe("SLEEPING");
    expect(result.current.available).toBe(false);
  });

  it("a companion disconnect moves to ERROR and marks the session unavailable", () => {
    const [, micImpl] = fakeMicCapture();
    const { result } = renderHook(() =>
      useKyutaiVoiceSession({
        onFinalTranscript: vi.fn(),
        client: client as unknown as VoiceCompanionClient,
        micCaptureImpl: micImpl,
        createTtsPlayer: fakeTtsPlayer,
      }),
    );
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    expect(result.current.available).toBe(true);
    act(() => client.emit({ type: "connectionClosed", code: 1006, reason: "abnormal" }));
    expect(result.current.state).toBe("ERROR");
    expect(result.current.available).toBe(false);
  });

  it("rejects correlated assistant echo but admits independent spoken confirm during playback", () => {
    const [, micImpl] = fakeMicCapture();
    const onFinal = vi.fn();
    const player = fakeTtsPlayer();
    const { result } = renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: () => player }));
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "test" }));
    act(() => client.emit({ type: "transcript.partial", text: "Flow, delete entry" }));
    act(() => client.emit({ type: "transcript.final", text: "Flow, delete entry" }));
    act(() => result.current.speak("Confirm to delete this journal entry."));
    act(() => client.emit({ type: "tts.start" }));
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "Confirm to delete this journal entry." }));
    expect(onFinal).toHaveBeenCalledTimes(1);
    act(() => result.current.speak("Confirm to delete this journal entry."));
    act(() => client.emit({ type: "tts.start" }));
    act(() => client.emit({ type: "speech.start" }));
    act(() => client.emit({ type: "transcript.final", text: "Confirm" }));
    expect(onFinal).toHaveBeenLastCalledWith("Confirm");
    expect(onFinal).toHaveBeenCalledTimes(2);
    expect(player.cancel).toHaveBeenCalled();
  });

  it("cancellation rejects a late final instead of granting a new turn", () => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn();
    const { result } = renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "transcript.partial", text: "Flow, delete entry" }));
    act(() => result.current.cancel());
    act(() => client.emit({ type: "transcript.final", text: "delete entry" }));
    expect(onFinal).not.toHaveBeenCalled();
  });
  it.each([false, true])("bounds split assistant echo to its continuing PCM sequence (expired=%s)", expired => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn();
    const { result } = renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "transcript.partial", text: "Flow, delete entry" }));
    act(() => client.emit({ type: "transcript.final", text: "Flow, delete entry" }));
    act(() => result.current.speak("Delete this entry? The entry will be removed. Say confirm to continue."));
    act(() => client.emit({ type: "tts.start" }));
    const correlation = { sessionId: "session", workerEpoch: "worker" };
    act(() => client.emit({ type: "speech.start", ...correlation, audioMs: 1000 }));
    act(() => client.emit({ type: "transcript.final", ...correlation, audioMs: 2000, text: "Delete this entry?" }));
    act(() => client.emit({ type: "speech.start", ...correlation, audioMs: expired ? 5000 : 2080 }));
    act(() => client.emit({ type: "transcript.final", ...correlation, audioMs: expired ? 6000 : 3000, text: "The entry will be removed." }));
    expect(onFinal).toHaveBeenCalledTimes(expired ? 2 : 1);
    act(() => client.emit({ type: "speech.start", ...correlation, audioMs: 4000 }));
    act(() => client.emit({ type: "transcript.final", ...correlation, audioMs: 4500, text: "Confirm." }));
    expect(onFinal).toHaveBeenLastCalledWith("Confirm.");
  });
  it("does not wake for an incomplete Flow token that becomes Flowers", () => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn();
    const { result } = renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "transcript.partial", text: "Flow" }));
    act(() => client.emit({ type: "transcript.partial", text: "Flowers bloom" }));
    act(() => client.emit({ type: "transcript.final", text: "Flowers bloom in spring." }));
    expect(result.current.state).toBe("SLEEPING");
    expect(onFinal).not.toHaveBeenCalled();
  });
  it("accepts a punctuated streaming wake immediately but dispatches its final clause only once", () => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn();
    const { result } = renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "speech.start", utteranceId: "turn" }));
    for (const text of ["F", "Flo", "Flow"]) act(() => client.emit({ type: "transcript.partial", utteranceId: "turn", text }));
    expect(result.current.state).toBe("SLEEPING");
    act(() => client.emit({ type: "transcript.partial", utteranceId: "turn", text: "Flow," }));
    expect(result.current.state).toBe("TRANSCRIBING");
    expect(onFinal).not.toHaveBeenCalled();
    act(() => client.emit({ type: "transcript.final", utteranceId: "turn", text: "Flow, open calendar." }));
    act(() => client.emit({ type: "transcript.final", utteranceId: "turn", text: "Flow, open calendar." }));
    expect(onFinal).toHaveBeenCalledExactlyOnceWith("open calendar.");
  });
  it("rejects a cancelled utterance's late final while a newer utterance is speaking", () => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn();
    const { result } = renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "transcript.partial", text: "Flow, open calendar" }));
    act(() => client.emit({ type: "speech.start", utteranceId: "old" }));
    act(() => result.current.cancel());
    act(() => client.emit({ type: "speech.start", utteranceId: "new" }));
    act(() => client.emit({ type: "transcript.final", utteranceId: "old", text: "Flow, confirm" }));
    expect(onFinal).not.toHaveBeenCalled();
    act(() => client.emit({ type: "transcript.final", utteranceId: "new", text: "Flow, open calendar" }));
    expect(onFinal).toHaveBeenCalledExactlyOnceWith("open calendar");
  });
  it("binds spoken approval to the proposal present at speech start", () => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn(); const onChanged = vi.fn();
    let authority = { id: "proposal-a" };
    renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, getUtteranceAuthority: () => authority, onAuthorityChanged: onChanged, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "transcript.partial", text: "Flow, confirm" }));
    act(() => client.emit({ type: "speech.start", utteranceId: "a" }));
    authority = { id: "proposal-b" };
    act(() => client.emit({ type: "transcript.final", utteranceId: "a", text: "Flow, confirm" }));
    expect(onFinal).not.toHaveBeenCalled();
    expect(onChanged).toHaveBeenCalledOnce();
    act(() => client.emit({ type: "speech.start", utteranceId: "b" }));
    act(() => client.emit({ type: "transcript.final", utteranceId: "b", text: "Flow, confirm" }));
    expect(onFinal).toHaveBeenCalledExactlyOnceWith("confirm");
  });
  it("strips an optional wake envelope after reconnect has resumed listening", () => {
    const [, micImpl] = fakeMicCapture(); const onFinal = vi.fn();
    renderHook(() => useKyutaiVoiceSession({ onFinalTranscript: onFinal, client: client as unknown as VoiceCompanionClient, micCaptureImpl: micImpl, createTtsPlayer: fakeTtsPlayer }));
    act(() => client.emit({ type: "connectionClosed", code: 4000, reason: "test reconnect" }));
    act(() => client.emit({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    act(() => client.emit({ type: "speech.start", utteranceId: "reconnected" }));
    act(() => client.emit({ type: "transcript.final", utteranceId: "reconnected", text: "Flow, add new friend called Anita." }));
    expect(onFinal).toHaveBeenCalledExactlyOnceWith("add new friend called Anita.");
  });
});
