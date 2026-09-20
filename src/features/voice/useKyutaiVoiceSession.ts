/**
 * React hook wiring the local voice companion (Kyutai STT, Kokoro TTS —
 * see FINAL REPORT's fallback decision) to Flow's ONE authoritative voice
 * state machine (src/kernel/voice/voiceSessionMachine.ts). This hook owns
 * connection lifecycle, microphone capture, TTS playback, and barge-in; it
 * does NOT know anything about the kernel, the conversation coordinator,
 * or the application's feedback UI — the caller (FlowEnvironmentProvider)
 * supplies `onFinalTranscript` and calls `speak()` with whatever text the
 * REAL conversational-intelligence path produced. This mirrors
 * useFlowLiveSession.ts's existing shape (callbacks in, imperative
 * controls out) instead of importing app-level environment types into
 * kernel-adjacent code.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceCompanionClient, EVICTED_BY_ANOTHER_TAB_CODE, type VoiceCompanionEvent } from "../../kernel/voice/voiceCompanionClient";
import { reduceVoiceSession, isMicActive, INITIAL_VOICE_SESSION_STATE, type VoiceSessionState, type VoiceSessionEvent } from "../../kernel/voice/voiceSessionMachine";
import { startMicCapture, VoiceTtsPlayer, type VoiceMicCapture } from "../../kernel/voice/voiceMicCapture";
import { voiceDebug } from "../day-planner/voice/voiceDebug";

// A late-duplicate final transcript (the companion re-sending the same
// text, e.g. after a retry) within this window is dropped rather than
// re-dispatched — the kernel's own idempotency store (src/kernel/idempotency.ts)
// already prevents a duplicate MUTATION, but without this, a duplicate
// transcript would still trigger a second, wasted round through the
// conversation coordinator (Phase 17's "duplicate final transcript
// suppression").
const DUPLICATE_FINAL_WINDOW_MS = 4_000;

// Local wake-word spotting (see FINAL REPORT's physical-test repair "B" —
// wake detection previously ran through Chrome's built-in SpeechRecognition,
// a CLOUD service Flow has no gain/sensitivity control over, which is the
// documented cause of needing to shout to wake Flow). Matched as a whole
// word so "flow" inside another word ("workflow") never false-triggers.
// Case-insensitive, matches the literal wake word only — not a phrase list —
// to stay predictable and testable.
const WAKE_WORD_PATTERN = /^(?:hey\s+)?flow\b/i;
const speechKey = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

function extractAfterWakeWord(text: string): string {
  const match = WAKE_WORD_PATTERN.exec(text);
  if (!match) return "";
  return text.slice(match.index + match[0].length).replace(/^[\s,.:;!?-]+/, "").trim();
}

export interface KyutaiVoiceSessionOptions {
  /** Explicit recording grants dictation authority without a wake phrase. */
  dictationActive?: boolean;
  /** Called with the exact final transcript, verbatim (no lowercasing —
   * see Phase 3's "no automatic destructive normalization"). The caller is
   * responsible for feeding it into the real conversation coordinator. */
  onFinalTranscript: (transcript: string) => void;
  /** Immutable proposal identity at speech acquisition, checked again at final. */
  getUtteranceAuthority?: () => unknown;
  onAuthorityChanged?: () => void;
  /** Called on every partial transcript update for live UI feedback. */
  onPartialTranscript?: (transcript: string) => void;
  /** Called when the state machine transitions, for UI derivation. */
  onStateChange?: (state: VoiceSessionState) => void;
  /** Injectable for tests — defaults to the real browser implementation. */
  micCaptureImpl?: typeof startMicCapture;
  /** Injectable for tests — defaults to the real Web Audio player. */
  createTtsPlayer?: () => Pick<VoiceTtsPlayer, "beginUtterance" | "enqueueChunk" | "cancel" | "close"> & Partial<Pick<VoiceTtsPlayer, "finish">>;
  client?: VoiceCompanionClient;
}

export interface KyutaiVoiceSession {
  state: VoiceSessionState;
  /** True once the companion's `ready` event confirms both models loaded. */
  available: boolean;
  /** Say "Flow" — begins a session (SLEEPING -> READY -> LISTENING). */
  wake: () => void;
  /** Explicit sleep/mute — stops capture, returns to SLEEPING. */
  sleep: () => void;
  /** "never mind"/Escape — cancels the current turn without executing
   * anything, and stops any in-progress speech. */
  cancel: () => void;
  /** Speak the given text through the local TTS — call this with whatever
   * text the real conversational-intelligence layer produced. */
  speak: (text: string) => void;
}

export function useKyutaiVoiceSession(options: KyutaiVoiceSessionOptions): KyutaiVoiceSession {
  const { onFinalTranscript, onPartialTranscript, onStateChange } = options;
  const [state, setState] = useState<VoiceSessionState>(INITIAL_VOICE_SESSION_STATE);
  const [available, setAvailable] = useState(false);
  const stateRef = useRef(state);
  const clientRef = useRef<VoiceCompanionClient>(options.client ?? new VoiceCompanionClient());
  const micRef = useRef<VoiceMicCapture | null>(null);
  const ttsPlayerRef = useRef<ReturnType<NonNullable<KyutaiVoiceSessionOptions["createTtsPlayer"]>> | null>(null);
  const onFinalRef = useRef(onFinalTranscript);
  const dictationRef = useRef(options.dictationActive);
  dictationRef.current = options.dictationActive;
  onFinalRef.current = onFinalTranscript;
  const onPartialRef = useRef(onPartialTranscript);
  onPartialRef.current = onPartialTranscript;
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const micCaptureImpl = options.micCaptureImpl ?? startMicCapture;
  const createTtsPlayer = options.createTtsPlayer ?? (() => new VoiceTtsPlayer());
  const lastFinalRef = useRef<{ text: string; at: number } | null>(null);
  const seenFinalIdsRef = useRef(new Set<string>());
  const activeUtteranceRef = useRef<string | undefined>(undefined);
  const authorityOptionsRef = useRef(options);
  authorityOptionsRef.current = options;
  const acquiredAuthorityRef = useRef<{ value: unknown } | null>(null);
  const justWokeThisTurnRef = useRef(false);
  const pcmChunkCountRef = useRef(0);
  const spokenRef = useRef("");
  const overlappedOutputRef = useRef(false);

  const dispatch = useCallback((event: VoiceSessionEvent) => {
    const prev = stateRef.current;
    const next = reduceVoiceSession(prev, event);
    stateRef.current = next;
    setState(next);
    voiceDebug("voice.state", { from: prev, to: next, event: event.type });
    onStateChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (options.dictationActive && available && stateRef.current === "SLEEPING") {
      dispatch({ type: "wake" });
      dispatch({ type: "companionReady" });
    }
  }, [options.dictationActive, available, dispatch]);

  // Mic capture on/off follows isMicActive(state) exactly — the ONE place
  // that decides whether the microphone should be running, never a
  // separately-tracked boolean (Phase 5's explicit anti-pattern).
  const shouldCapture = isMicActive(state) && available;
  useEffect(() => {
    // Also gated on `available`: SLEEPING now counts as mic-active (local
    // wake-word spotting), but capture must not even attempt to start
    // (and, critically, must not send `session.start` — the WebSocket
    // client silently drops it while disconnected, with nothing to retry
    // it later) before the companion has actually confirmed ready.
    if (shouldCapture && !micRef.current) {
      let cancelled = false;
      micCaptureImpl((chunk) => {
        pcmChunkCountRef.current += 1;
        if (pcmChunkCountRef.current === 1 || pcmChunkCountRef.current % 25 === 0) {
          voiceDebug("voice.micPcm", { chunks: pcmChunkCountRef.current, bytes: chunk.byteLength });
        }
        clientRef.current.sendAudio(chunk);
      })
        .then((capture) => {
          if (cancelled) {
            capture.stop();
            return;
          }
          micRef.current = capture;
          clientRef.current.startSession();
        })
        .catch(() => {
          // No microphone / no Web Audio support in this browser — degrade
          // to ERROR (Phase 13's local-first failure modes: voice
          // unavailable, typed conversation remains usable) rather than an
          // unhandled rejection.
          if (!cancelled) dispatch({ type: "error", message: "microphone unavailable" });
        });
      return () => {
        cancelled = true;
      };
    }
    if (!shouldCapture && micRef.current) {
      clientRef.current.stopSession();
      micRef.current.stop();
      micRef.current = null;
    }
    return undefined;
  }, [shouldCapture, micCaptureImpl, dispatch]);

  useEffect(() => {
    const client = clientRef.current;
    const unsubscribe = client.on((event: VoiceCompanionEvent) => {
      voiceDebug("voice.companionEvent", event.type === "tts.audio" ? { type: "tts.audio", bytes: event.data.byteLength } : event);
      switch (event.type) {
        case "ready":
          // Setting `available` here is what actually starts mic capture
          // for local wake-word spotting while SLEEPING (see the mic-capture
          // effect above) — no separate dispatch needed for that case.
          setAvailable(event.sttReady && event.ttsReady);
          if (stateRef.current === "ERROR") dispatch({ type: "recovered" });
          if (stateRef.current === "READY") dispatch({ type: "companionReady" });
          break;
        case "connectionClosed":
          setAvailable(false);
          if (event.code === EVICTED_BY_ANOTHER_TAB_CODE) {
            // Another tab now exclusively owns the voice companion (see
            // physical-test repair B) — this is correct, intentional
            // behavior, not a failure: go quietly back to SLEEPING rather
            // than showing an error state for something the user didn't
            // do wrong. This tab needs a reload to reclaim ownership.
            voiceDebug("voice.evictedByAnotherTab", {});
            dispatch({ type: "sleep" });
            break;
          }
          dispatch({ type: "error", message: "voice companion unavailable" });
          break;
        case "connectionError":
          setAvailable(false);
          dispatch({ type: "error", message: "voice companion unavailable" });
          break;
        case "speech.start":
          activeUtteranceRef.current = event.utteranceId;
          acquiredAuthorityRef.current = { value: authorityOptionsRef.current.getUtteranceAuthority?.() };
          overlappedOutputRef.current = stateRef.current === "SPEAKING";
          if (stateRef.current === "SPEAKING") {
            // Barge-in: the user started talking while Flow was speaking.
            ttsPlayerRef.current?.cancel();
            clientRef.current.cancelSpeak();
            dispatch({ type: "userInterrupts" });
          }
          if (stateRef.current === "SLEEPING") justWokeThisTurnRef.current = false; // a fresh turn starts; re-arm wake-word spotting.
          dispatch({ type: "speechStart" });
          break;
        case "transcript.partial":
          if (stateRef.current === "SLEEPING" && !justWokeThisTurnRef.current && WAKE_WORD_PATTERN.test(event.text.trim()) && extractAfterWakeWord(event.text.trim()).length > 1) {
            // A partial "Flow" can still become "Flowers". Wait for a
            // following clause; a bare wake is accepted only when finalized.
            justWokeThisTurnRef.current = true;
            voiceDebug("voice.localWakeDetected", { text: event.text });
            dispatch({ type: "wake" });
            dispatch({ type: "companionReady" }); // Kyutai is already connected/ready — no round trip to wait for.
          }
          onPartialRef.current?.(event.text);
          dispatch({ type: "transcriptPartial" });
          break;
        case "transcript.final": {
          if (event.utteranceId && activeUtteranceRef.current !== event.utteranceId) {
            voiceDebug("voice.finalIgnored", { reason: "superseded utterance", utteranceId: event.utteranceId });
            break;
          }
          if (event.utteranceId && seenFinalIdsRef.current.has(event.utteranceId)) break;
          if (event.utteranceId) {
            seenFinalIdsRef.current.add(event.utteranceId);
            if (seenFinalIdsRef.current.size > 128) seenFinalIdsRef.current.delete(seenFinalIdsRef.current.values().next().value!);
          }
          if (stateRef.current === "SLEEPING" && WAKE_WORD_PATTERN.test(event.text.trim())) {
            justWokeThisTurnRef.current = true;
            voiceDebug("voice.localWakeDetected", { text: event.text });
            dispatch({ type: "wake" });
            dispatch({ type: "companionReady" });
            dispatch({ type: "speechStart" });
          }
          if (stateRef.current !== "USER_SPEAKING" && stateRef.current !== "TRANSCRIBING") {
            voiceDebug("voice.finalIgnored", { state: stateRef.current, reason: "no active utterance" });
            break;
          }
          const normalized = speechKey(event.text);
          const echo = overlappedOutputRef.current && normalized && (normalized === spokenRef.current || normalized.length > 8 && spokenRef.current.includes(normalized));
          overlappedOutputRef.current = false;
          if (echo) {
            voiceDebug("voice.selfEchoRejected", { text: event.text });
            dispatch({ type: "cancel" });
            break;
          }
          if (acquiredAuthorityRef.current && !Object.is(acquiredAuthorityRef.current.value, authorityOptionsRef.current.getUtteranceAuthority?.())) {
            voiceDebug("voice.finalIgnored", { reason: "proposal changed during speech", utteranceId: event.utteranceId });
            dispatch({ type: "cancel" });
            authorityOptionsRef.current.onAuthorityChanged?.();
            break;
          }
          const wasJustWoken = justWokeThisTurnRef.current;
          justWokeThisTurnRef.current = false;
          if (wasJustWoken && !WAKE_WORD_PATTERN.test(event.text.trim())) {
            dispatch({ type: "sleep" });
            break;
          }
          dispatch({ type: "transcriptFinal" });
          // If this exact turn is the one that just woke Flow, only the
          // words AFTER "Flow" are real command content (mirrors the
          // legacy wake-envelope's own bundled "Flow, open calendar"
          // handling) — the bare wake word alone must not be dispatched as
          // an empty/garbage utterance.
          // A reconnect can leave the conversation already listening. The
          // optional wake envelope is still not part of the command then.
          const text = (WAKE_WORD_PATTERN.test(event.text.trim()) ? extractAfterWakeWord(event.text) : event.text).trim();
          if (!text) dispatch({ type: "cancel" });
          const now = Date.now();
          const last = lastFinalRef.current;
          const isDuplicate = !event.utteranceId && Boolean(last) && last!.text === text && now - last!.at < DUPLICATE_FINAL_WINDOW_MS;
          if (text && !isDuplicate) {
            lastFinalRef.current = { text, at: now };
            onFinalRef.current(text);
            if (dictationRef.current) dispatch({ type: "cancel" });
          }
          break;
        }
        case "tts.start":
          ttsPlayerRef.current?.beginUtterance();
          dispatch({ type: "speakStart" });
          break;
        case "tts.audio":
          ttsPlayerRef.current?.enqueueChunk(event.data);
          break;
        case "tts.done":
          if (ttsPlayerRef.current?.finish) ttsPlayerRef.current.finish(() => dispatch({ type: "speakDone" }));
          else dispatch({ type: "speakDone" });
          break;
        case "tts.cancelled":
          dispatch({ type: "speakDone" });
          break;
        case "tts.error":
        case "stt.error":
          dispatch({ type: "error", message: event.message });
          break;
      }
    });

    ttsPlayerRef.current = createTtsPlayer();
    client.connect();

    return () => {
      unsubscribe();
      client.disconnect();
      ttsPlayerRef.current?.close();
      micRef.current?.stop();
      micRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- client/createTtsPlayer are captured once at mount by design (see clientRef/createTtsPlayer refs above).
  }, [dispatch]);

  const wake = useCallback(() => dispatch({ type: "wake" }), [dispatch]);
  const sleep = useCallback(() => dispatch({ type: "sleep" }), [dispatch]);
  const cancel = useCallback(() => {
    activeUtteranceRef.current = undefined;
    acquiredAuthorityRef.current = null;
    ttsPlayerRef.current?.cancel();
    clientRef.current.cancelSpeak();
    dispatch({ type: "cancel" });
  }, [dispatch]);
  const speak = useCallback((text: string) => {
    if (!text.trim()) return;
    spokenRef.current = speechKey(text);
    clientRef.current.speak(text);
  }, []);

  return { state, available, wake, sleep, cancel, speak };
}
