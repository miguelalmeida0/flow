/**
 * The ONE authoritative voice session state machine (see FINAL REPORT
 * Phase 5's "one owner, not scattered booleans"). Pure and framework-free
 * on purpose — no DOM, no WebSocket, no React — so every transition is a
 * plain function call a test can assert on directly, and the browser-side
 * client/hook (voiceCompanionClient.ts, useKyutaiVoiceSession.ts) is the
 * ONLY thing that ever calls `reduceVoiceSession`; nothing else is allowed
 * to invent its own `isListening`/`isSpeaking`/`pendingMic` boolean.
 *
 * States (exactly the set FINAL REPORT Phase 5 names):
 *   SLEEPING      — before the wake word; nothing is being captured.
 *   READY         — companion + models confirmed healthy, wake word heard,
 *                   about to start capturing (a brief acknowledgment beat).
 *   LISTENING     — actively capturing microphone audio, no speech detected yet.
 *   USER_SPEAKING — VAD/STT reports speech.start; the user is talking now.
 *   TRANSCRIBING  — partial transcripts are arriving for the current utterance.
 *   UNDERSTANDING — a final transcript was produced; the conversation
 *                   coordinator (semantic frame + grounding) is running.
 *   CHECKING      — the complex-path verifier round is running (see
 *                   verifier.ts) — a visibly distinct state so the UI never
 *                   looks frozen during the extra round.
 *   CLARIFYING    — the model (or verifier) asked a genuine question; still
 *                   listening for the answer WITHOUT requiring a new wake word.
 *   PROPOSING     — a plan needs confirmation before it executes.
 *   ACTING        — a kernel mutation is in flight.
 *   SPEAKING      — TTS audio is playing.
 *   INTERRUPTED   — the user started talking while Flow was speaking;
 *                   TTS is being cancelled, about to fall into USER_SPEAKING.
 *   ERROR         — a fatal local failure (companion/model/mic); recoverable.
 */

export type VoiceSessionState =
  | "SLEEPING"
  | "READY"
  | "LISTENING"
  | "USER_SPEAKING"
  | "TRANSCRIBING"
  | "UNDERSTANDING"
  | "CHECKING"
  | "CLARIFYING"
  | "PROPOSING"
  | "ACTING"
  | "SPEAKING"
  | "INTERRUPTED"
  | "ERROR";

export type VoiceSessionEvent =
  | { type: "wake" } // user said "Flow" — only meaningful from SLEEPING.
  | { type: "companionReady" } // READY -> LISTENING: capture can actually start.
  | { type: "speechStart" } // STT/VAD: user began talking.
  | { type: "transcriptPartial" } // a partial transcript arrived.
  | { type: "transcriptFinal" } // speech.end + a real final transcript.
  | { type: "verificationStarted" } // complex-path second model pass began.
  | { type: "clarify" } // the model/verifier needs a question answered.
  | { type: "propose" } // a plan needs confirmation.
  | { type: "act" } // a kernel mutation is executing.
  | { type: "answered" } // a plain answer/explanation is ready to speak.
  | { type: "speakStart" } // TTS audio begins playing.
  | { type: "speakDone" } // TTS finished playing normally.
  | { type: "userInterrupts" } // barge-in: user starts talking while SPEAKING.
  | { type: "cancel" } // explicit cancel ("never mind"/Escape) — back to listening, no mutation.
  | { type: "sleep" } // explicit sleep/mute or inactivity timeout.
  | { type: "error"; message: string } // a fatal local failure.
  | { type: "recovered" }; // companion/model reconnect succeeded.

/**
 * A pure reducer: (state, event) -> next state. Any (state, event) pair not
 * present in the table below is an ILLEGAL transition and is a deliberate
 * NO-OP (returns the same state unchanged) rather than throwing — a stray
 * or late event (e.g. a superseded turn's "transcriptFinal" arriving after
 * the user already said "never mind") must never corrupt session state.
 * `error` and `sleep` are the two exceptions: they are legal from every
 * state, since a fatal failure or an explicit sleep can happen at any time.
 */
export function reduceVoiceSession(state: VoiceSessionState, event: VoiceSessionEvent): VoiceSessionState {
  if (event.type === "sleep") return "SLEEPING";
  if (event.type === "error") return "ERROR";
  // The companion's own "tts.start" is the one server-confirmed signal that
  // audio has actually begun playing — legal from every state that can
  // plausibly precede speech (everything mid-conversation), so the hook
  // doesn't need a separate synthetic "answered" event for every possible
  // path into SPEAKING (a plain answer, a spoken clarification, a spoken
  // proposal, a spoken action confirmation all arrive the same way: the
  // companion starts streaming audio).
  if (event.type === "speakStart" && state !== "SLEEPING" && state !== "READY" && state !== "ERROR") return "SPEAKING";

  switch (state) {
    case "SLEEPING":
      if (event.type === "wake") return "READY";
      return state;

    case "READY":
      if (event.type === "companionReady") return "LISTENING";
      return state;

    case "LISTENING":
      if (event.type === "speechStart") return "USER_SPEAKING";
      if (event.type === "transcriptPartial") return "TRANSCRIBING";
      return state;

    case "USER_SPEAKING":
      if (event.type === "transcriptPartial") return "TRANSCRIBING";
      if (event.type === "transcriptFinal") return "UNDERSTANDING";
      if (event.type === "cancel") return "LISTENING";
      return state;

    case "TRANSCRIBING":
      if (event.type === "transcriptPartial") return "TRANSCRIBING";
      if (event.type === "transcriptFinal") return "UNDERSTANDING";
      if (event.type === "cancel") return "LISTENING";
      return state;

    case "UNDERSTANDING":
      if (event.type === "speechStart") return "USER_SPEAKING";
      if (event.type === "verificationStarted") return "CHECKING";
      if (event.type === "clarify") return "CLARIFYING";
      if (event.type === "propose") return "PROPOSING";
      if (event.type === "act") return "ACTING";
      if (event.type === "answered") return "SPEAKING";
      if (event.type === "cancel") return "LISTENING";
      return state;

    case "CHECKING":
      if (event.type === "speechStart") return "USER_SPEAKING";
      if (event.type === "clarify") return "CLARIFYING";
      if (event.type === "propose") return "PROPOSING";
      if (event.type === "act") return "ACTING";
      if (event.type === "answered") return "SPEAKING";
      if (event.type === "cancel") return "LISTENING";
      return state;

    case "CLARIFYING":
      // Answering a clarification is just another utterance — it re-enters
      // exactly like any turn, WITHOUT a new wake word (Phase 6's "wake
      // once" contract: SLEEPING is never re-entered here).
      if (event.type === "speechStart") return "USER_SPEAKING";
      if (event.type === "cancel") return "LISTENING";
      return state;

    case "PROPOSING":
      if (event.type === "act") return "ACTING";
      if (event.type === "speechStart") return "USER_SPEAKING"; // a spoken confirmation/rejection is itself a new turn.
      if (event.type === "cancel") return "LISTENING";
      return state;

    case "ACTING":
      if (event.type === "answered") return "SPEAKING"; // (speakStart is handled by the global rule above.)
      return state;

    case "SPEAKING":
      if (event.type === "userInterrupts") return "INTERRUPTED";
      if (event.type === "speakDone") return "LISTENING";
      return state;

    case "INTERRUPTED":
      if (event.type === "speechStart") return "USER_SPEAKING";
      return state;

    case "ERROR":
      if (event.type === "recovered") return "READY";
      return state;

    default:
      return state;
  }
}

export const INITIAL_VOICE_SESSION_STATE: VoiceSessionState = "SLEEPING";

/** Whether the microphone should be actively capturing in this state — the
 * single source of truth the browser client checks instead of a scattered
 * `isListening` boolean (Phase 5's explicit anti-pattern). Deliberately
 * includes SPEAKING: barge-in requires the mic to stay live while Flow
 * talks, never disabled outright (see Phase 11 — that would break barge-in).
 *
 * ALSO includes SLEEPING (see FINAL REPORT's physical-test repair "B"): the
 * wake word itself must be spotted through Kyutai's own local pipeline, not
 * Chrome's built-in SpeechRecognition, which is a CLOUD service (sends
 * audio to Google) Flow has no gain/sensitivity control over — the
 * documented cause of the "must scream to wake" symptom. While SLEEPING,
 * useKyutaiVoiceSession streams audio and inspects transcripts for the
 * wake word locally, dispatching `wake`+`companionReady` itself once
 * spotted, without executing anything else heard before that point. */
export function isMicActive(state: VoiceSessionState): boolean {
  return state !== "READY" && state !== "ERROR";
}

/** Whether TTS audio is expected to be playing/queued in this state. */
export function isSpeaking(state: VoiceSessionState): boolean {
  return state === "SPEAKING" || state === "INTERRUPTED";
}
