import { describe, it, expect } from "vitest";
import { reduceVoiceSession, isMicActive, isSpeaking, INITIAL_VOICE_SESSION_STATE, type VoiceSessionState } from "./voiceSessionMachine";

describe("reduceVoiceSession", () => {
  it("starts SLEEPING and wakes into READY, then LISTENING once the companion confirms", () => {
    expect(INITIAL_VOICE_SESSION_STATE).toBe("SLEEPING");
    const ready = reduceVoiceSession("SLEEPING", { type: "wake" });
    expect(ready).toBe("READY");
    expect(reduceVoiceSession(ready, { type: "companionReady" })).toBe("LISTENING");
  });

  it("runs a full simple-turn arc without ever re-entering SLEEPING", () => {
    let s: VoiceSessionState = "LISTENING";
    s = reduceVoiceSession(s, { type: "speechStart" });
    expect(s).toBe("USER_SPEAKING");
    s = reduceVoiceSession(s, { type: "transcriptPartial" });
    expect(s).toBe("TRANSCRIBING");
    s = reduceVoiceSession(s, { type: "transcriptFinal" });
    expect(s).toBe("UNDERSTANDING");
    s = reduceVoiceSession(s, { type: "answered" });
    expect(s).toBe("SPEAKING");
    s = reduceVoiceSession(s, { type: "speakDone" });
    expect(s).toBe("LISTENING"); // back to listening, no wake word required.
  });

  it("SPEAKING -> user begins talking -> INTERRUPTED -> USER_SPEAKING (the exact example from the brief)", () => {
    let s: VoiceSessionState = "SPEAKING";
    s = reduceVoiceSession(s, { type: "userInterrupts" });
    expect(s).toBe("INTERRUPTED");
    s = reduceVoiceSession(s, { type: "speechStart" });
    expect(s).toBe("USER_SPEAKING");
  });

  it("UNDERSTANDING -> user says 'never mind' -> cancel pending turn -> LISTENING (the exact example from the brief)", () => {
    expect(reduceVoiceSession("UNDERSTANDING", { type: "cancel" })).toBe("LISTENING");
  });

  it("ERROR -> companion reconnect succeeds -> READY (the exact example from the brief)", () => {
    expect(reduceVoiceSession("ERROR", { type: "recovered" })).toBe("READY");
  });

  it("answering a spoken clarification re-enters the turn without a new wake word", () => {
    expect(reduceVoiceSession("CLARIFYING", { type: "speechStart" })).toBe("USER_SPEAKING");
  });

  it("a complex turn visibly passes through CHECKING before resolving", () => {
    let s: VoiceSessionState = "UNDERSTANDING";
    s = reduceVoiceSession(s, { type: "verificationStarted" });
    expect(s).toBe("CHECKING");
    expect(reduceVoiceSession(s, { type: "clarify" })).toBe("CLARIFYING");
    expect(reduceVoiceSession(s, { type: "propose" })).toBe("PROPOSING");
    expect(reduceVoiceSession(s, { type: "act" })).toBe("ACTING");
  });

  it("error and sleep are legal from every state, and never anything else jumps to them implicitly", () => {
    const allStates: VoiceSessionState[] = [
      "SLEEPING", "READY", "LISTENING", "USER_SPEAKING", "TRANSCRIBING", "UNDERSTANDING",
      "CHECKING", "CLARIFYING", "PROPOSING", "ACTING", "SPEAKING", "INTERRUPTED", "ERROR",
    ];
    for (const s of allStates) {
      expect(reduceVoiceSession(s, { type: "error", message: "boom" })).toBe("ERROR");
      expect(reduceVoiceSession(s, { type: "sleep" })).toBe("SLEEPING");
    }
  });

  it("rejects illegal transitions as no-ops instead of corrupting state", () => {
    // A wake event while already SPEAKING does nothing — already awake.
    expect(reduceVoiceSession("SPEAKING", { type: "wake" })).toBe("SPEAKING");
    // A late/superseded transcriptFinal arriving in LISTENING (no turn in
    // flight) is dropped, not treated as a new understanding cycle.
    expect(reduceVoiceSession("LISTENING", { type: "transcriptFinal" })).toBe("LISTENING");
    // ERROR only leaves via `recovered` (or the universal sleep/error) —
    // a stray speechStart does nothing.
    expect(reduceVoiceSession("ERROR", { type: "speechStart" })).toBe("ERROR");
    // SLEEPING ignores everything except wake/error/sleep.
    expect(reduceVoiceSession("SLEEPING", { type: "speechStart" })).toBe("SLEEPING");
    expect(reduceVoiceSession("SLEEPING", { type: "transcriptFinal" })).toBe("SLEEPING");
    // ACTING only resolves via answered/speakStart — a stray clarify is dropped
    // (the plan is already committed to executing).
    expect(reduceVoiceSession("ACTING", { type: "clarify" })).toBe("ACTING");
  });

  it("cancel from every mid-turn state returns to LISTENING without executing anything", () => {
    for (const s of ["USER_SPEAKING", "TRANSCRIBING", "UNDERSTANDING", "CHECKING", "CLARIFYING", "PROPOSING"] as VoiceSessionState[]) {
      expect(reduceVoiceSession(s, { type: "cancel" })).toBe("LISTENING");
    }
  });
});

describe("isMicActive", () => {
  it("is false only while READY or ERROR", () => {
    expect(isMicActive("READY")).toBe(false);
    expect(isMicActive("ERROR")).toBe(false);
  });

  it("is true while SLEEPING — local wake-word spotting needs the mic live (see physical-test repair B)", () => {
    expect(isMicActive("SLEEPING")).toBe(true);
  });

  it("stays true while SPEAKING so barge-in can work — never disabled to interrupt", () => {
    expect(isMicActive("SPEAKING")).toBe(true);
    expect(isMicActive("INTERRUPTED")).toBe(true);
  });

  it("is true for every other mid-conversation state", () => {
    for (const s of ["LISTENING", "USER_SPEAKING", "TRANSCRIBING", "UNDERSTANDING", "CHECKING", "CLARIFYING", "PROPOSING", "ACTING"] as VoiceSessionState[]) {
      expect(isMicActive(s)).toBe(true);
    }
  });
});

describe("isSpeaking", () => {
  it("is true only for SPEAKING and INTERRUPTED", () => {
    expect(isSpeaking("SPEAKING")).toBe(true);
    expect(isSpeaking("INTERRUPTED")).toBe(true);
    expect(isSpeaking("LISTENING")).toBe(false);
    expect(isSpeaking("ACTING")).toBe(false);
  });
});
