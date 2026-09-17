import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLifeDocument } from "../../domain/life-storage";
import { applyLifeTransaction } from "../../domain/life-transaction";
import type { RewardEvent, RewardFact } from "./reward-types";
import { deriveRewardFacts } from "./derive-reward-facts";
import { rewardLevelForEvent, rewardLevelForFact } from "./reward-level";
import { RewardDirector } from "./reward-director";
import { recipeForReward } from "./reward-recipes";
import { DEFAULT_REWARD_PREFERENCES } from "./reward-types";

const dateKey = "2026-09-04";
const event = (id: string, at: number, facts: RewardFact[]): RewardEvent => ({ type: "transaction-committed", id, at, source: "type", facts });

beforeEach(() => window.localStorage.clear());

describe("reward facts", () => {
  it("derives generated Tide effects from stable before/after identity, not feedback copy", () => {
    const before = createLifeDocument(dateKey);
    const after = structuredClone(before);
    const source = after.calendar.events.find(({ kind }) => kind === "flexible")!;
    const previous = before.calendar.events.find(({ id }) => id === source.id)!;
    source.start += 30; source.end += 30; source.color = "red"; source.protected = true; source.kind = "protected";
    after.calendars[dateKey] = structuredClone(after.calendar);
    expect(deriveRewardFacts(before, after, [])).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "event-moved", eventId: source.id, from: expect.objectContaining({ start: previous.start }), to: expect.objectContaining({ start: source.start }) }),
      { type: "event-styled", eventId: source.id, changed: ["color"] },
      { type: "time-protected", entityId: source.id, minutes: source.end - source.start },
    ]));
  });

  it("earns Level 3 focus only after meaningful elapsed completion", () => {
    const before = createLifeDocument(dateKey);
    const start = applyLifeTransaction(before, [{ type: "focus.start", session: { id: "focus-1", dateKey, startMinutes: 900, durationMinutes: 25, status: "active", startedAt: "2026-09-04T10:00:00.000Z" } }]);
    expect(start.status).toBe("success"); if (start.status !== "success") return;
    const early = applyLifeTransaction(start.document, [{ type: "focus.stop", completedAt: "2026-09-04T10:02:00.000Z" }]);
    expect(early.status).toBe("success"); if (early.status !== "success") return;
    expect(deriveRewardFacts(start.document, early.document, [])[0]).toMatchObject({ type: "focus-completed", meaningful: false, elapsedMinutes: 2 });
    const full = structuredClone(early.document); full.focus.lastCompleted = { ...full.focus.lastCompleted!, id: "focus-2", completedAt: "2026-09-04T10:22:00.000Z" };
    expect(rewardLevelForFact(deriveRewardFacts(start.document, full, [])[0]!)).toBe(3);
  });

  it("protects a newly reserved commitment in the real transaction engine", () => {
    const before = createLifeDocument(dateKey);
    const commitment = { id: "commitment-1", kind: "commitment" as const, personId: "person-1", title: "Proposal", direction: "i-owe" as const, status: "open" as const, createdAt: "2026-09-04T08:00:00.000Z", updatedAt: "2026-09-04T08:00:00.000Z" };
    const person = { id: "person-1", kind: "person" as const, name: "Maya", createdAt: commitment.createdAt, updatedAt: commitment.createdAt };
    const created = applyLifeTransaction(before, [{ type: "person.ensure", person }, { type: "commitment.create", commitment }]);
    expect(created.status).toBe("success"); if (created.status !== "success") return;
    const reserved = applyLifeTransaction(created.document, [{ type: "commitment.schedule", commitmentId: commitment.id, eventId: "event-proposal", dateKey, startMinutes: 900, durationMinutes: 30 }]);
    expect(reserved.status).toBe("success"); if (reserved.status !== "success") return;
    const reservation = reserved.document.calendar.events.find(({ id }) => id === "event-proposal");
    expect(reservation).toMatchObject({ protected: true, kind: "protected" });
    expect(deriveRewardFacts(created.document, reserved.document, [])[0]).toMatchObject({ type: "event-created", eventId: "event-proposal" });
    expect(deriveRewardFacts(created.document, reserved.document, [])).toContainEqual({ type: "commitment-protected", commitmentId: commitment.id, eventId: "event-proposal" });
  });
});

describe("reward director", () => {
  it("keeps a recovery as the primary compound fact and labels focus with actual elapsed time", () => {
    const recovery = event("compound", 1, [
      { type: "event-deferred", eventId: "later", destinationDateKey: "2026-09-05" },
      { type: "day-recovered", movedCount: 2, deferredCount: 1, reclaimedMinutes: 35 },
      { type: "event-styled", eventId: "meeting", changed: ["importance"] },
    ]);
    expect(recipeForReward(recovery, 3, DEFAULT_REWARD_PREFERENCES, false)).toMatchObject({ family: "tide", label: "35 minutes recovered" });
    const focus = event("focus", 2, [{ type: "focus-completed", focusId: "f", minutes: 25, elapsedMinutes: 21, meaningful: true }]);
    expect(recipeForReward(focus, 3, DEFAULT_REWARD_PREFERENCES, false).label).toBe("21 minutes protected");
  });

  it("deduplicates commits, cancels stale presentation, and settles without residue", () => {
    vi.useFakeTimers();
    let now = 1_000;
    const director = new RewardDirector(DEFAULT_REWARD_PREFERENCES, () => now);
    director.emit(event("tx-1", now, [{ type: "event-moved", eventId: "a", from: { dateKey, start: 600, end: 660 }, to: { dateKey, start: 660, end: 720 } }]));
    expect(director.getSnapshot()).toMatchObject({ active: true, animationCount: 1, transitionClones: 0 });
    director.emit(event("tx-1", now, [{ type: "event-moved", eventId: "a", from: { dateKey, start: 600, end: 660 }, to: { dateKey, start: 660, end: 720 } }]));
    expect(director.getSnapshot().suppressionReason).toBe("duplicate-transaction");
    now += 1_000;
    director.emit(event("tx-2", now, [{ type: "time-protected", entityId: "a", minutes: 60 }]));
    expect(director.getSnapshot().cancelledCount).toBe(1);
    vi.runAllTimers();
    expect(director.getSnapshot()).toMatchObject({ active: false, animationCount: 0, transitionClones: 0, activeMotionOwner: "none" });
    vi.useRealTimers();
  });

  it("suppresses hidden, uncertain, and repeated ceremonies while sound defaults off", () => {
    let now = 2_000;
    const director = new RewardDirector(DEFAULT_REWARD_PREFERENCES, () => now);
    director.emit({ type: "uncertain", id: "uncertain-1", at: now, reason: "clarification" });
    expect(director.getSnapshot().suppressionReason).toBe("level-zero");
    const ceremony = event("tx-win-1", now, [{ type: "commitment-kept", commitmentId: "c" }]);
    const plan = director.emit(ceremony);
    expect(plan).toMatchObject({ level: 3, recipe: { family: "anchor", mascot: "big-win" } });
    expect(plan?.recipe.sound).toBeUndefined();
    director.cancel(); now += 2_000;
    expect(director.emit(event("tx-win-2", now, [{ type: "commitment-kept", commitmentId: "c" }]))).toBeUndefined();
    expect(director.getSnapshot().suppressionReason).toBe("ceremony-cooldown");
  });
});

describe("30-case reward acceptance matrix", () => {
  const cases: Array<[string, RewardEvent, 0 | 1 | 2 | 3, string]> = [
    ["clarification", { type: "uncertain", id: "1", at: 1, reason: "clarification" }, 0, "none"],
    ["unsupported", { type: "uncertain", id: "2", at: 1, reason: "unsupported" }, 0, "none"],
    ["conflict", { type: "uncertain", id: "3", at: 1, reason: "conflict" }, 0, "none"],
    ["navigation", { type: "world-opened", id: "4", at: 1, from: "home", to: "today", source: "typed" }, 1, "tide"],
    ["browser back", { type: "world-opened", id: "5", at: 1, from: "today", to: "home", source: "browser-back" }, 0, "none"],
    ["time scope", { type: "time-scope-changed", id: "6", at: 1, from: { kind: "day", dateKey }, to: { kind: "day", dateKey: "2026-09-05" }, source: "typed" }, 1, "tide"],
    ["voice understood", { type: "voice-understood", id: "7", at: 1, intent: "move" }, 1, "bloom"],
    ["undo", { type: "history-restored", id: "8", at: 1, direction: "undo" }, 1, "neutral"],
    ["redo", { type: "history-restored", id: "9", at: 1, direction: "redo" }, 2, "neutral"],
    ["create", event("10", 1, [{ type: "event-created", eventId: "e" }]), 2, "bloom"],
    ["move", event("11", 1, [{ type: "event-moved", eventId: "e", from: { dateKey, start: 1, end: 2 }, to: { dateKey, start: 2, end: 3 } }]), 2, "tide"],
    ["resize", event("12", 1, [{ type: "event-resized", eventId: "e", previousMinutes: 20, nextMinutes: 30 }]), 2, "bloom"],
    ["style", event("13", 1, [{ type: "event-styled", eventId: "e", changed: ["color"] }]), 1, "bloom"],
    ["defer", event("14", 1, [{ type: "event-deferred", eventId: "e", destinationDateKey: "2026-09-05" }]), 2, "tide"],
    ["remove", event("15", 1, [{ type: "event-removed", eventId: "e" }]), 1, "bloom"],
    ["protect", event("16", 1, [{ type: "time-protected", entityId: "e", minutes: 30 }]), 2, "anchor"],
    ["release", event("17", 1, [{ type: "time-released", entityId: "e", minutes: 30 }]), 2, "anchor"],
    ["reclaim", event("18", 1, [{ type: "time-reclaimed", minutes: 30 }]), 2, "tide"],
    ["recover", event("19", 1, [{ type: "day-recovered", movedCount: 2, deferredCount: 1, reclaimedMinutes: 35 }]), 3, "tide"],
    ["room", event("20", 1, [{ type: "breathing-room-created", roomId: "r", minutes: 20 }]), 2, "bloom"],
    ["focus start", event("21", 1, [{ type: "focus-started", focusId: "f", minutes: 25 }]), 2, "bloom"],
    ["focus early", event("22", 1, [{ type: "focus-completed", focusId: "f", minutes: 25, elapsedMinutes: 2, meaningful: false }]), 2, "bloom"],
    ["focus complete", event("23", 1, [{ type: "focus-completed", focusId: "f", minutes: 25, elapsedMinutes: 24, meaningful: true }]), 3, "bloom"],
    ["capture", event("24", 1, [{ type: "capture-created", captureId: "c" }]), 1, "bloom"],
    ["route capture", event("25", 1, [{ type: "capture-routed", captureId: "c", destination: "outcome", destinationId: "o" }]), 2, "tide"],
    ["outcome", event("26", 1, [{ type: "outcome-created", outcomeId: "o" }]), 2, "bloom"],
    ["step", event("27", 1, [{ type: "outcome-advanced", outcomeId: "o", completedStepId: "s" }]), 2, "bloom"],
    ["outcome complete", event("28", 1, [{ type: "outcome-completed", outcomeId: "o" }]), 3, "bloom"],
    ["promise protected", event("29", 1, [{ type: "commitment-protected", commitmentId: "c", eventId: "e" }]), 2, "anchor"],
    ["promise kept", event("30", 1, [{ type: "commitment-kept", commitmentId: "c" }]), 3, "anchor"],
  ];
  it.each(cases)("%s", (_name, rewardEvent, level, family) => {
    expect(rewardLevelForEvent(rewardEvent)).toBe(level);
    expect(recipeForReward(rewardEvent, level, DEFAULT_REWARD_PREFERENCES, false).family).toBe(family);
  });
});
