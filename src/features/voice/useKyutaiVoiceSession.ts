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
import { getRuntimeMode } from "../../app/runtimeMode";
import { HostedVoiceClient } from "../../kernel/voice/hostedVoiceClient";
import { hostedMicrophoneBroker } from "../../kernel/voice/hostedMicrophoneBroker";
import { subscribeHostedSession, subscribeHostedLogout } from "../../kernel/hostedSessionClient";
import { createInactiveVoiceTransport, type VoiceTransport } from "../../kernel/voice/voiceTransport";
import { voiceDebug } from "../day-planner/voice/voiceDebug";
import { StreamingWake } from "../../kernel/voice/streamingWake";
import { echoPrefixLength } from "../../kernel/voice/speechEcho";

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
const WAKE_WORD_PATTERN = /^(?:hey\s+)?flow(?=$|[\s,.:;!?—–-])/i;
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
  onFinalTranscript: (transcript: string, correlation?: { commandId: string; captureEpoch: string }) => void;
  onSessionStopped?: (reason: string) => void;
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
  createTtsPlayer?: () => Pick<VoiceTtsPlayer, "beginUtterance" | "enqueueChunk" | "cancel" | "close"> & Partial<Pick<VoiceTtsPlayer, "finish" | "unlock">>;
  client?: VoiceTransport;
}

export interface KyutaiVoiceSession {
  state: VoiceSessionState;
  active: boolean;
  status: "stopped" | "connecting" | "active";
  reason?: string;
  expiresAt?: number;
  start: () => void;
  stop: (reason?: string) => void;
  captureEpoch?: string;
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
  const mode = useRef(getRuntimeMode()).current;
  const clientRef = useRef<VoiceTransport | null>(null);
  if (!clientRef.current) clientRef.current = options.client ?? (mode === "hosted" ? new HostedVoiceClient() : mode === "local" ? new VoiceCompanionClient() : createInactiveVoiceTransport());
  const [captureGeneration, setCaptureGeneration] = useState(0);
  const [status, setStatus] = useState<"stopped" | "connecting" | "active">("stopped");
  const active = status !== "stopped";
  const [reason, setReason] = useState<string>();
  const [expiresAt, setExpiresAt] = useState<number>();
  const activationRef = useRef(0);
  const activeRef = useRef(false);
  const captureEpochRef = useRef<string | undefined>(undefined);
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const micRef = useRef<VoiceMicCapture | null>(null);
  const pendingMicRef = useRef<AbortController | null>(null);
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
  const createTtsPlayer = options.createTtsPlayer ?? (() => new VoiceTtsPlayer({ maxQueuedSeconds: mode === "hosted" ? 1 : Infinity }));
  const lastFinalRef = useRef<{ text: string; at: number } | null>(null);
  const seenFinalIdsRef = useRef(new Set<string>());
  const activeUtteranceRef = useRef<string | undefined>(undefined);
  const authorityOptionsRef = useRef(options);
  authorityOptionsRef.current = options;
  const acquiredAuthorityRef = useRef<{ value: unknown } | null>(null);
  const justWokeThisTurnRef = useRef(false);
  const streamingWakeRef = useRef(new StreamingWake());
  const pcmChunkCountRef = useRef(0);
  const spokenRef = useRef("");
  const overlappedOutputRef = useRef(false);
  const echoTailRef = useRef<{ remaining: string; untilAudioMs: number; sessionId?: string; workerEpoch?: string } | null>(null);
  const echoContinuationRef = useRef(false);

  const dispatch = useCallback((event: VoiceSessionEvent) => {
    const prev = stateRef.current;
    const next = reduceVoiceSession(prev, event);
    stateRef.current = next;
    setState(next);
    voiceDebug("voice.state", { from: prev, to: next, event: event.type });
    onStateChangeRef.current?.(next);
  }, []);

  const stop = useCallback((message = "Voice stopped.") => {
    if (mode !== "hosted") { dispatch({ type: "sleep" }); return; }
    activationRef.current += 1; activeRef.current = false; captureEpochRef.current = undefined;
    clearTimeout(expiryTimerRef.current);
    activeUtteranceRef.current = undefined; acquiredAuthorityRef.current = null;
    pendingMicRef.current?.abort();
    ttsPlayerRef.current?.cancel(); micRef.current?.stop(); micRef.current = null;
    hostedMicrophoneBroker.revokeAll();
    clientRef.current!.stopSession(); clientRef.current!.disconnect();
    setAvailable(false); setStatus("stopped"); setReason(message); setExpiresAt(undefined);
    dispatch({ type: "sleep" }); authorityOptionsRef.current.onSessionStopped?.(message);
  }, [dispatch, mode]);

  const start = useCallback(() => {
    if (mode !== "hosted" || document.visibilityState === "hidden" || activeRef.current) return;
    const activation = ++activationRef.current; activeRef.current = true;
    setCaptureGeneration(activation);
    setStatus("connecting"); setReason(undefined);
    ttsPlayerRef.current ??= createTtsPlayer();
    const unlocked = ttsPlayerRef.current.unlock?.();
    void unlocked?.catch(() => { if (activationRef.current === activation) stop("Audio playback unavailable. Try Start again."); });
    dispatch({ type: "sleep" }); dispatch({ type: "wake" }); clientRef.current!.connect();
  // Player factory is selected at mount, like the existing transport.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, mode, stop]);

  useEffect(() => {
    if ((mode === "local" || activeRef.current) && options.dictationActive && available && stateRef.current === "SLEEPING") {
      dispatch({ type: "wake" });
      dispatch({ type: "companionReady" });
    }
  }, [options.dictationActive, available, dispatch, mode]);

  useEffect(() => {
    clientRef.current!.setInputMode(options.dictationActive ? "dictation" : "command");
  }, [options.dictationActive]);

  // Mic capture on/off follows isMicActive(state) exactly — the ONE place
  // that decides whether the microphone should be running, never a
  // separately-tracked boolean (Phase 5's explicit anti-pattern).
  const shouldCapture = isMicActive(state) && available && (mode === "local" || mode === "hosted" && active);
  useEffect(() => {
    // Also gated on `available`: SLEEPING now counts as mic-active (local
    // wake-word spotting), but capture must not even attempt to start
    // (and, critically, must not send `session.start` — the WebSocket
    // client silently drops it while disconnected, with nothing to retry
    // it later) before the companion has actually confirmed ready.
    if (shouldCapture && !micRef.current) {
      let cancelled = false;
      const pendingMic = new AbortController(); pendingMicRef.current = pendingMic;
      const activation = activationRef.current;
      if (mode === "hosted") clientRef.current!.startSession();
      micCaptureImpl((chunk) => {
        if (cancelled || mode === "hosted" && (!activeRef.current || activation !== activationRef.current)) return;
        pcmChunkCountRef.current += 1;
        if (pcmChunkCountRef.current === 1 || pcmChunkCountRef.current % 25 === 0) {
          voiceDebug("voice.micPcm", { chunks: pcmChunkCountRef.current, bytes: chunk.byteLength });
        }
        clientRef.current!.sendAudio(chunk);
      }, pendingMic.signal)
        .then((capture) => {
          if (cancelled || mode === "hosted" && (!activeRef.current || activation !== activationRef.current)) {
            capture.stop();
            return;
          }
          micRef.current = capture;
          if (mode === "hosted") setStatus("active");
          if (mode === "local") clientRef.current!.startSession();
        })
        .catch(() => {
          // No microphone / no Web Audio support in this browser — degrade
          // to ERROR (Phase 13's local-first failure modes: voice
          // unavailable, typed conversation remains usable) rather than an
          // unhandled rejection.
          if (!cancelled && mode === "hosted") stop("Microphone unavailable. Check permission and try Start again.");
          else if (!cancelled) dispatch({ type: "error", message: "microphone unavailable" });
        });
      return () => {
        cancelled = true;
        pendingMic.abort();
      };
    }
    if (!shouldCapture && micRef.current) {
      clientRef.current!.stopSession();
      micRef.current.stop();
      micRef.current = null;
    }
    return undefined;
  }, [shouldCapture, micCaptureImpl, dispatch, mode, stop, captureGeneration]);

  useEffect(() => {
    const client = clientRef.current!;
    const unsubscribe = client.on((event: VoiceCompanionEvent) => {
      if (mode !== "local" && (!activeRef.current || mode !== "hosted")) return;
      if (mode === "hosted" && event.captureEpoch && captureEpochRef.current && event.captureEpoch !== captureEpochRef.current) return;
      voiceDebug("voice.companionEvent", event.type === "tts.audio" ? { type: "tts.audio", bytes: event.data.byteLength } : event);
      switch (event.type) {
        case "ready":
          if (mode === "hosted") {
            if (!event.captureEpoch || !event.expiresAt) { stop("Invalid voice session."); break; }
            captureEpochRef.current = event.captureEpoch;
            setExpiresAt(event.expiresAt);
            clearTimeout(expiryTimerRef.current);
            expiryTimerRef.current = setTimeout(() => stop("Voice session expired. Start again to continue."), Math.max(0, event.expiresAt - Date.now()));
          }
          // Setting `available` here is what actually starts mic capture
          // for local wake-word spotting while SLEEPING (see the mic-capture
          // effect above) — no separate dispatch needed for that case.
          setAvailable(event.sttReady && event.ttsReady);
          if (stateRef.current === "ERROR") dispatch({ type: "recovered" });
          if (stateRef.current === "READY") dispatch({ type: "companionReady" });
          break;
        case "connectionClosed":
          if (mode === "hosted") { stop(event.reason || "Voice disconnected. Start again."); break; }
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
          if (mode === "hosted") { stop("Voice unavailable. Start again."); break; }
          setAvailable(false);
          dispatch({ type: "error", message: "voice companion unavailable" });
          break;
        case "speech.start":
          streamingWakeRef.current.reset();
          activeUtteranceRef.current = event.utteranceId;
          acquiredAuthorityRef.current = { value: authorityOptionsRef.current.getUtteranceAuthority?.() };
          overlappedOutputRef.current = stateRef.current === "SPEAKING";
          echoContinuationRef.current = Boolean(echoTailRef.current && event.audioMs !== undefined
            && event.audioMs <= echoTailRef.current.untilAudioMs
            && event.sessionId === echoTailRef.current.sessionId && event.workerEpoch === echoTailRef.current.workerEpoch);
          if (!echoContinuationRef.current) echoTailRef.current = null;
          if (stateRef.current === "SPEAKING") {
            // Barge-in: the user started talking while Flow was speaking.
            voiceDebug("voice.bargeInDetected", { sessionId: event.sessionId, utteranceId: event.utteranceId });
            ttsPlayerRef.current?.cancel();
            clientRef.current!.cancelSpeak();
            dispatch({ type: "userInterrupts" });
          }
          if (stateRef.current === "SLEEPING") justWokeThisTurnRef.current = false; // a fresh turn starts; re-arm wake-word spotting.
          dispatch({ type: "speechStart" });
          break;
        case "transcript.partial":
          if (event.utteranceId && activeUtteranceRef.current !== event.utteranceId) break;
          if (stateRef.current === "SLEEPING" && !justWokeThisTurnRef.current && streamingWakeRef.current.observe(event.text) === "WAKE_CONFIRMED") {
            // A lexical boundary in evolving partial history can establish the
            // wake before the command is complete. Only final grants dispatch.
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
          const previousEcho = echoTailRef.current;
          const continuationLength = echoContinuationRef.current && previousEcho ? echoPrefixLength(normalized, previousEcho.remaining) : 0;
          const continuedEcho = continuationLength > 0;
          const echo = continuedEcho || overlappedOutputRef.current && normalized && (normalized === spokenRef.current || normalized.length > 8 && spokenRef.current.includes(normalized));
          overlappedOutputRef.current = false;
          echoContinuationRef.current = false;
          echoTailRef.current = null;
          if (echo) {
            const original = continuedEcho ? previousEcho!.remaining : spokenRef.current;
            const remaining = original.slice(continuedEcho ? continuationLength : original.indexOf(normalized) + normalized.length).trim();
            if (remaining && event.audioMs !== undefined) echoTailRef.current = { remaining, untilAudioMs: event.audioMs + 2000,
              sessionId: event.sessionId, workerEpoch: event.workerEpoch };
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
            const authority = acquiredAuthorityRef.current?.value;
            voiceDebug("voice.finalAuthorityAccepted", { sessionId: event.sessionId, utteranceId: event.utteranceId,
              proposalRevision: authority && typeof authority === "object" && "revision" in authority && typeof authority.revision === "number" ? authority.revision : null,
              proposalId: authority && typeof authority === "object" && "id" in authority && typeof authority.id === "string" ? authority.id : null });
            const correlation = mode === "hosted" && event.sessionId && event.captureEpoch && event.utteranceId ? { commandId: "hosted-voice:" + event.sessionId + ":" + event.captureEpoch + ":" + event.utteranceId, captureEpoch: event.captureEpoch } : undefined;
            if (correlation) onFinalRef.current(text, correlation);
            else onFinalRef.current(text);
            if (dictationRef.current) dispatch({ type: "cancel" });
          }
          break;
        }
        case "tts.start":
          ttsPlayerRef.current?.beginUtterance();
          dispatch({ type: "speakStart" });
          break;
        case "tts.audio":
          if (mode === "local") { ttsPlayerRef.current?.enqueueChunk(event.data); break; }
          try { ttsPlayerRef.current?.enqueueChunk(event.data, () => {
            if (activeRef.current && event.generation !== undefined && event.sequence !== undefined) client.acknowledgePlayback?.(event.generation, event.sequence);
          }); } catch { if (mode === "hosted") stop("Audio playback failed. Start again."); }
          break;
        case "tts.done":
          if (ttsPlayerRef.current?.finish) {
            const activation = activationRef.current;
            try { ttsPlayerRef.current.finish(() => { if (mode === "local" || activeRef.current && activation === activationRef.current) dispatch({ type: "speakDone" }); }); }
            catch { if (mode === "hosted") stop("Incomplete speech audio. Start again."); }
          }
          else dispatch({ type: "speakDone" });
          break;
        case "tts.cancelled":
          dispatch({ type: "speakDone" });
          break;
        case "tts.error":
        case "stt.error":
          if (mode === "hosted") stop(event.message);
          else dispatch({ type: "error", message: event.message });
          break;
      }
    });

    if (mode === "local") { ttsPlayerRef.current = createTtsPlayer(); client.connect(); }

    return () => {
      activationRef.current += 1; activeRef.current = false; clearTimeout(expiryTimerRef.current);
      pendingMicRef.current?.abort();
      if (mode === "hosted") hostedMicrophoneBroker.revokeAll();
      unsubscribe();
      client.disconnect();
      ttsPlayerRef.current?.close();
      micRef.current?.stop();
      micRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- client/createTtsPlayer are captured once at mount by design (see clientRef/createTtsPlayer refs above).
  }, [dispatch, mode, stop]);

  useEffect(() => {
    if (mode !== "hosted") return;
    const hidden = () => { if (document.visibilityState === "hidden") stop("Voice stopped because this page was hidden."); };
    const pagehide = () => stop("Voice stopped because this page was closed.");
    const command = (event: Event) => { if ((event as CustomEvent).detail === "sleep") stop("Voice stopped."); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && activeRef.current) stop("Voice stopped."); };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", pagehide);
    window.addEventListener("flow-live-command",command); window.addEventListener("keydown",escape);
    const unsubscribe = subscribeHostedSession(session => { if (!session.authenticated && activeRef.current) stop("Cloud access ended. Sign in again."); });
    const unsubscribeLogout = subscribeHostedLogout(() => stop("Cloud access ended. Sign in again."));
    return () => { document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", pagehide); window.removeEventListener("flow-live-command",command); window.removeEventListener("keydown",escape); unsubscribe(); unsubscribeLogout(); };
  }, [mode, stop]);

  const wake = useCallback(() => { if (mode === "local") dispatch({ type: "wake" }); }, [dispatch, mode]);
  const sleep = useCallback(() => { if (mode === "hosted") stop(); else dispatch({ type: "sleep" }); }, [dispatch, mode, stop]);
  const cancel = useCallback(() => {
    activeUtteranceRef.current = undefined;
    acquiredAuthorityRef.current = null;
    ttsPlayerRef.current?.cancel();
    clientRef.current!.cancelSpeak();
    dispatch({ type: "cancel" });
  }, [dispatch]);
  const speak = useCallback((text: string) => {
    if (!text.trim() || mode !== "local" && !(mode === "hosted" && activeRef.current && captureEpochRef.current)) return;
    spokenRef.current = speechKey(text);
    echoTailRef.current = null;
    voiceDebug("voice.ttsRequested", { utteranceId: activeUtteranceRef.current });
    clientRef.current!.speak(text);
  }, [mode]);

  return { state, available, wake, sleep, cancel, speak, active, status, reason, expiresAt, start, stop, captureEpoch: captureEpochRef.current };
}
