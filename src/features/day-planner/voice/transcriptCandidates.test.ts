import { describe, expect, it } from "vitest";
import type { DayPlan } from "../model";
import { createInitialPlan } from "../seed";
import {
  collectTranscriptCandidates,
  selectBestTranscriptCandidate,
  type ResultLike,
  type TranscriptCandidate,
} from "./transcriptCandidates";

const dateKey = "2026-09-02";
const initial = createInitialPlan(dateKey);
const atTwoPlan: DayPlan = {
  ...initial,
  events: initial.events.map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event),
};

interface RankingCase {
  name: string;
  candidates: TranscriptCandidate[];
  expected: string;
  plan?: DayPlan;
  selectedId?: string;
  pendingDestination?: boolean;
}

const cases: RankingCase[] = [
  { name: "recovers the full move from acoustic garbage", candidates: [
    { transcript: "movimento vio", confidence: 0.94 },
    { transcript: "move interview", confidence: 0.8 },
    { transcript: "move interview to six", confidence: 0.58 },
  ], expected: "move interview to six" },
  { name: "prefers a complete move", candidates: [{ transcript: "move dinner", confidence: 0.9 }, { transcript: "move dinner to seven", confidence: 0.5 }], expected: "move dinner to seven" },
  { name: "prefers a complete protect", candidates: [{ transcript: "protect", confidence: 0.9 }, { transcript: "protect dinner", confidence: 0.4 }], expected: "protect dinner" },
  { name: "recovers move from movement", candidates: [{ transcript: "movement interview", confidence: 0.95 }, { transcript: "move interview to 6", confidence: 0.4 }], expected: "move interview to 6" },
  { name: "prefers complete resize", candidates: [{ transcript: "make email", confidence: 0.9 }, { transcript: "make email twenty minutes", confidence: 0.5 }], expected: "make email twenty minutes" },
  { name: "prefers complete deletion by confidence", candidates: [{ transcript: "cancel", confidence: 0.2 }, { transcript: "cancel the dentist appointment", confidence: 0.8 }], expected: "cancel the dentist appointment" },
  { name: "prefers complete defer", candidates: [{ transcript: "move the roadmap", confidence: 0.3 }, { transcript: "move the roadmap to tomorrow", confidence: 0.2 }], expected: "move the roadmap to tomorrow" },
  { name: "understands push defer", candidates: [{ transcript: "push", confidence: 0.9 }, { transcript: "push low priority work to Friday", confidence: 0.3 }], expected: "push low priority work to Friday" },
  { name: "prefers relative destination", candidates: [{ transcript: "move deep work", confidence: 0.8 }, { transcript: "move deep work before lunch", confidence: 0.4 }], expected: "move deep work before lunch" },
  { name: "valid incomplete beats a missing reference", candidates: [{ transcript: "move unicorn to six", confidence: 0.99 }, { transcript: "move interview", confidence: 0.1 }], expected: "move interview" },
  { name: "known protected event beats missing event", candidates: [{ transcript: "protect unicorn", confidence: 0.99 }, { transcript: "protect lunch", confidence: 0.1 }], expected: "protect lunch" },
  { name: "recognizes delete", candidates: [{ transcript: "delete the dentist appointment", confidence: 0.3 }, { transcript: "delight the dentist", confidence: 0.9 }], expected: "delete the dentist appointment" },
  { name: "recognizes unprotect", candidates: [{ transcript: "make lunch flexible", confidence: 0.4 }, { transcript: "make lunch possible", confidence: 0.9 }], expected: "make lunch flexible" },
  { name: "recognizes word duration resize", candidates: [{ transcript: "make the workout one hour long", confidence: 0.3 }, { transcript: "make the workout", confidence: 0.8 }], expected: "make the workout one hour long" },
  { name: "recognizes shift amount", candidates: [{ transcript: "push email", confidence: 0.9 }, { transcript: "push email twenty minutes later", confidence: 0.4 }], expected: "push email twenty minutes later" },
  { name: "recognizes recovery", candidates: [{ transcript: "running half an hour late", confidence: 0.3 }, { transcript: "running vio", confidence: 0.9 }], expected: "running half an hour late" },
  { name: "confidence breaks complete global ties", candidates: [{ transcript: "undo", confidence: 0.4 }, { transcript: "redo", confidence: 0.7 }], expected: "redo" },
  { name: "browser order breaks exact ties", candidates: [{ transcript: "undo", confidence: 0.7 }, { transcript: "redo", confidence: 0.7 }], expected: "undo" },
  { name: "known confidence beats missing confidence", candidates: [{ transcript: "undo" }, { transcript: "redo", confidence: 0.1 }], expected: "redo" },
  { name: "does not use transcript length as a tie break", candidates: [{ transcript: "redo", confidence: 0.5 }, { transcript: "what changed", confidence: 0.5 }], expected: "redo" },
  { name: "resolves selected event", candidates: [{ transcript: "move this", confidence: 0.8 }, { transcript: "move this to six", confidence: 0.2 }], expected: "move this to six", selectedId: "workout" },
  { name: "supports focused ambiguity", candidates: [
    { transcript: "move meeting to four", confidence: 0.2 },
    { transcript: "movement at four", confidence: 0.9 },
  ], expected: "move meeting to four", plan: {
    ...initial,
    events: [...initial.events,
      { id: "one", title: "Product meeting", dateKey, start: 600, end: 630, kind: "flexible", priority: "medium" },
      { id: "two", title: "Hiring meeting", dateKey, start: 870, end: 900, kind: "flexible", priority: "medium" },
    ],
  } },
  { name: "prefers complete create", candidates: [{ transcript: "add a walk", confidence: 0.9 }, { transcript: "add a thirty minute walk at five", confidence: 0.2 }], expected: "add a thirty minute walk at five" },
  { name: "prefers fit with an anchor", candidates: [{ transcript: "make", confidence: 0.9 }, { transcript: "make room for a twenty minute break before the interview", confidence: 0.3 }], expected: "make room for a twenty minute break before the interview" },
  { name: "recognizes tomorrow morning", candidates: [{ transcript: "move roadmap to morning", confidence: 0.8 }, { transcript: "move roadmap to tomorrow morning", confidence: 0.3 }], expected: "move roadmap to tomorrow morning" },
  { name: "recognizes word clock", candidates: [{ transcript: "move interview to sit", confidence: 0.9 }, { transcript: "move interview to six o'clock", confidence: 0.2 }], expected: "move interview to six o'clock" },
  { name: "semantic validity beats confidence", candidates: [{ transcript: "movimento interview", confidence: 0.99 }, { transcript: "protect interview", confidence: 0.01 }], expected: "protect interview" },
  { name: "browser confidence resolves unsupported ties", candidates: [{ transcript: "make tomorrow calm", confidence: 0.2 }, { transcript: "make tomorrow less stressful", confidence: 0.7 }], expected: "make tomorrow less stressful" },
  { name: "supports a compound request", candidates: [{ transcript: "move flexible work", confidence: 0.8 }, { transcript: "move flexible work after two and protect lunch", confidence: 0.2 }], expected: "move flexible work after two and protect lunch" },
  { name: "prefers valid punctuation variant", candidates: [{ transcript: "move interview maybe", confidence: 0.7 }, { transcript: "Move interview to six.", confidence: 0.2 }], expected: "Move interview to six." },
  { name: "treats a supported destination clarification as complete semantics", candidates: [
    { transcript: "change my 2:00 p.m. meeting", confidence: 0.98 },
    { transcript: "change my 2:00 p.m. meeting to another time", confidence: 0.31 },
  ], expected: "change my 2:00 p.m. meeting to another time", plan: atTwoPlan },
  { name: "does not mistake the source clock for a move destination", candidates: [
    { transcript: "change my 2 pm meeting", confidence: 0.99 },
    { transcript: "change my 2 pm meeting to four", confidence: 0.2 },
  ], expected: "change my 2 pm meeting to four", plan: atTwoPlan },
  { name: "admits a bare clock only for a pending destination", candidates: [
    { transcript: "movimento vio", confidence: 0.98 },
    { transcript: "3 PM", confidence: 0.21 },
  ], expected: "3 PM", plan: atTwoPlan, pendingDestination: true },
  { name: "prefers an explicitly requested alternative over an omitted destination", candidates: [
    { transcript: "change my 2 pm meeting", confidence: 0.98 },
    { transcript: "change my 2 pm meeting to another time", confidence: 0.21 },
  ], expected: "change my 2 pm meeting to another time", plan: atTwoPlan },
  { name: "recovers the descriptive meeting alias from acoustic garbage", candidates: [
    { transcript: "movement my deep words", confidence: 0.98 },
    { transcript: "move my deep work meeting to 3:00 p.m.", confidence: 0.22 },
  ], expected: "move my deep work meeting to 3:00 p.m." },
  { name: "clarifiable fallback aliases outrank unsupported speech", candidates: [
    { transcript: "movement at three", confidence: 0.98 },
    { transcript: "move deep work meeting to three", confidence: 0.22 },
  ], expected: "move deep work meeting to three" },
  { name: "admits a precise missing-reference request instead of acoustic garbage", candidates: [
    { transcript: "movimento vio", confidence: 0.98 },
    { transcript: "move quarterly meeting to three", confidence: 0.22 },
  ], expected: "move quarterly meeting to three" },
  { name: "does not misread a dotted high-hour destination", candidates: [
    { transcript: "movement deep words at eight", confidence: 0.95 },
    { transcript: "move deep work meeting to 8:00 p.m.", confidence: 0.2 },
  ], expected: "move deep work meeting to 8:00 p.m." },
];

describe("voice transcript candidates", () => {
  it.each(cases)("ranks $name", ({ candidates, expected, plan = initial, selectedId, pendingDestination }) => {
    const selected = selectBestTranscriptCandidate(candidates, { plan, selectedId, pendingDestination });
    expect(selected?.candidate.transcript).toBe(expected);
  });

  it("keeps a bare clock at Tier 0 outside destination clarification", () => {
    const selected = selectBestTranscriptCandidate([{ transcript: "3 PM", confidence: 0.9 }], { plan: atTwoPlan });
    expect(selected?.semanticTier).toBe(0);
  });

  it("routes resolved aliases at Tier 3 and well-formed missing references at Tier 2", () => {
    const resolved = selectBestTranscriptCandidate([
      { transcript: "move my deep work meeting to 3:00 p.m.", confidence: 0.1 },
    ], { plan: initial });
    expect(resolved).toMatchObject({ semanticTier: 3, routeToPlanner: true });

    const missing = selectBestTranscriptCandidate([
      { transcript: "move quarterly meeting to three", confidence: 0.1 },
    ], { plan: initial });
    expect(missing).toMatchObject({ semanticTier: 2, routeToPlanner: true });
  });

  it("collects every final alternative and joins segmented transcripts with spaces", () => {
    const first = Object.assign([
      { transcript: "movement", confidence: 0.4 },
      { transcript: "move", confidence: 0.8 },
    ], { isFinal: true }) as unknown as ResultLike;
    const second = Object.assign([
      { transcript: "interview", confidence: 0.3 },
      { transcript: "interview to six", confidence: 0.9 },
    ], { isFinal: true }) as unknown as ResultLike;
    const interim = Object.assign([{ transcript: "ignored" }], { isFinal: false }) as unknown as ResultLike;
    const candidates = collectTranscriptCandidates([first, interim, second]);
    expect(candidates).toHaveLength(4);
    expect(candidates.map((candidate) => candidate.transcript)).toContain("move interview to six");
    expect(candidates.every((candidate) => !candidate.transcript.includes("ignored"))).toBe(true);
  });

  it("deduplicates normalized candidates", () => {
    const result = Object.assign([
      { transcript: "Move interview to six", confidence: 0.3 },
      { transcript: "move interview to six.", confidence: 0.8 },
    ], { isFinal: true }) as unknown as ResultLike;
    const candidates = collectTranscriptCandidates([result]);
    expect(candidates).toEqual([expect.objectContaining({
      transcript: "move interview to six.",
      confidence: 0.8,
      browserIndex: 1,
    })]);
    const selected = selectBestTranscriptCandidate(candidates, { plan: initial });
    expect(selected?.candidate.transcript).toBe("move interview to six.");
    expect(selected?.candidate.confidence).toBe(0.8);

    const tie = Object.assign([
      { transcript: "MOVE INTERVIEW TO SIX", confidence: 0.8 },
      { transcript: "move interview to six!", confidence: 0.8 },
    ], { isFinal: true }) as unknown as ResultLike;
    expect(collectTranscriptCandidates([tie])).toEqual([expect.objectContaining({
      transcript: "MOVE INTERVIEW TO SIX",
      confidence: 0.8,
      browserIndex: 0,
    })]);
  });

  it("keeps the sole valid low-confidence command across a five-by-five segmented beam", () => {
    const first = Object.assign([
      { transcript: "movimento vio", confidence: 0.99 },
      { transcript: "make tomorrow calm", confidence: 0.95 },
      { transcript: "shift unicorn", confidence: 0.9 },
      { transcript: "protect", confidence: 0.85 },
      { transcript: "move interview", confidence: 0.05 },
    ], { isFinal: true }) as unknown as ResultLike;
    const second = Object.assign([
      { transcript: "today", confidence: 0.99 },
      { transcript: "maybe", confidence: 0.95 },
      { transcript: "around", confidence: 0.9 },
      { transcript: "vio", confidence: 0.85 },
      { transcript: "to six", confidence: 0.05 },
    ], { isFinal: true }) as unknown as ResultLike;

    const candidates = collectTranscriptCandidates([first, second], 5);
    expect(candidates).toHaveLength(25);
    const selected = selectBestTranscriptCandidate(candidates, { plan: initial });
    expect(selected?.candidate.transcript).toBe("move interview to six");
    expect(selected?.semanticTier).toBe(3);
  });
});
