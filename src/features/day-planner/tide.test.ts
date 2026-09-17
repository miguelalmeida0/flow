import { describe, expect, it } from "vitest";
import { eventColor, eventImportance, eventMobility, eventProtected, eventStatus } from "./eventDefaults";
import { interpretTranscript } from "./parser";
import { createInitialPlan } from "./seed";
import { executeRequest } from "./scheduling/engine";
import { validatePlan } from "./scheduling/invariants";
import { buildTideProposal } from "./tide/buildTideProposal";
import { applyBoundaryChoice } from "./scheduling/resolution";
import { resolveEventReference } from "./scheduling/resolution";
import { classifyDensity } from "./tide/classifyDensity";
import { scoreSchedule } from "./tide/scoreSchedule";
import { buildDirectManipulationPreview } from "./directManipulationPreview";

const today = "2026-09-02";

function ready(utterance: string) {
  const parsed = interpretTranscript(utterance, today);
  expect(parsed.status, utterance).toBe("ready");
  if (parsed.status !== "ready") throw new Error(parsed.detail);
  return parsed.request;
}

function execute(utterance: string) {
  return executeRequest(createInitialPlan(today), ready(utterance));
}

describe("Flow Tide domain actions", () => {
  it("applies the signature request as one atomic invariant-safe transaction", () => {
    const request = ready("Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way.");
    expect(request.actions.map((action) => action.type)).toEqual(["update", "createBreathingRoom", "reflow"]);
    const result = executeRequest(createInitialPlan(today), request);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const roadmap = result.plan.events.find((event) => event.id === "roadmap")!;
    expect(eventImportance(roadmap)).toBe("important");
    expect(eventColor(roadmap)).toBe("red");
    expect(result.plan.breathingRooms).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: 13 * 60 + 40, end: 14 * 60, protected: true }),
    ]));
    expect(roadmap.bufferBeforeMinutes).toBe(20);
    expect(result.plan.events).toHaveLength(8);
    expect(new Set(result.plan.events.map((event) => event.id)).size).toBe(8);
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("keeps mobility and protection independent", () => {
    const request = ready("Make dinner light again");
    const result = executeRequest(createInitialPlan(today), request);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const dinner = result.plan.events.find((event) => event.id === "dinner")!;
    expect(eventMobility(dinner)).toBe("light");
    expect(eventProtected(dinner)).toBe(true);
  });

  it("composes a date and clock rather than losing the clock", () => {
    const result = execute("Add lunch with Ana tomorrow at one");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.deferred).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Lunch with ana", dateKey: "2026-09-03", start: 13 * 60 }),
    ]));
  });

  it("resolves source times by overlap when no event starts there", () => {
    const result = execute("Make the event covering 2:30 red");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(eventColor(result.plan.events.find((event) => event.id === "roadmap")!)).toBe("red");
  });

  it("renames, labels, recolors, changes importance, and changes mobility", () => {
    const request = ready("Rename roadmap to strategy review, make it critical and blue, add strategy and planning labels to it, and make it heavy");
    const result = executeRequest(createInitialPlan(today), request);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const event = result.plan.events.find((item) => item.id === "roadmap")!;
    expect(event).toMatchObject({ title: "strategy review", labels: ["strategy", "planning"] });
    expect(eventColor(event)).toBe("blue");
    expect(eventImportance(event)).toBe("critical");
    expect(eventMobility(event)).toBe("heavy");
  });

  it("splits with stable lineage and merges without losing duration", () => {
    const split = execute("Split deep work into two 30 minute sessions");
    expect(split.status).toBe("success");
    if (split.status !== "success") return;
    const parts = split.plan.events.filter((event) => event.linkedGroupId === "group-deep-work");
    expect(parts).toHaveLength(2);
    expect(parts[0]?.id).toBe("deep-work");
    expect(parts.reduce((minutes, event) => minutes + event.end - event.start, 0)).toBe(60);
    expect(validatePlan(split.plan)).toBeNull();

    const mergedRequest = ready("Combine email and roadmap");
    const review = executeRequest(createInitialPlan(today), mergedRequest);
    expect(review.status).toBe("confirmation");
    const merged = executeRequest(createInitialPlan(today), mergedRequest, undefined, true);
    expect(merged.status).toBe("success");
    if (merged.status !== "success") return;
    const combined = merged.plan.events.find((event) => event.id === "email")!;
    expect(combined.end - combined.start).toBe(105);
    expect(combined.mergedFromIds).toEqual(["email", "roadmap"]);
    expect(validatePlan(merged.plan)).toBeNull();
  });

  it("completes and reopens while preserving identity", () => {
    const complete = execute("Complete roadmap twenty minutes early");
    expect(complete.status).toBe("success");
    if (complete.status !== "success") return;
    expect(eventStatus(complete.plan.events.find((event) => event.id === "roadmap")!)).toBe("done");
    expect(complete.plan.events.find((event) => event.id === "roadmap")?.completedAtMinutes).toBe(14 * 60 + 40);
    expect(complete.plan.breathingRooms).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: 14 * 60 + 40, end: 15 * 60, source: "tide" }),
    ]));
    expect(complete.plan.breathingRooms?.[0]).not.toHaveProperty("linkedEventId");
    expect(validatePlan(complete.plan)).toBeNull();
    const reopened = executeRequest(complete.plan, ready("Reopen roadmap"));
    expect(reopened.status).toBe("success");
    if (reopened.status !== "success") return;
    expect(eventStatus(reopened.plan.events.find((event) => event.id === "roadmap")!)).toBe("planned");
    expect(reopened.plan.breathingRooms).toHaveLength(0);
  });

  it("offers and applies the closest safe boundary without mutating the failed attempt", () => {
    const plan = createInitialPlan(today);
    const before = structuredClone(plan);
    const result = executeRequest(plan, ready("End my day at six"));
    expect(result.status).toBe("clarification");
    if (result.status !== "clarification" || result.clarification.type !== "boundary") return;
    expect(result.clarification.choices).toEqual([
      expect.objectContaining({ endMinutes: 20 * 60, label: "8 PM — closest safe finish" }),
    ]);
    expect(plan).toEqual(before);

    const accepted = executeRequest(plan, applyBoundaryChoice(result.request, result.clarification.actionIndex, 20 * 60));
    expect(accepted.status).toBe("success");
    if (accepted.status !== "success") return;
    expect(accepted.plan.endBoundaryMinutes).toBe(20 * 60);
    expect(validatePlan(accepted.plan)).toBeNull();
  });

  it("marks what-if requests as previews without changing engine semantics", () => {
    const request = ready("What if I add a 30 minute walk at five?");
    expect(request.mode).toBe("preview");
    expect(request.actions.map((action) => action.type)).toEqual(["create"]);
  });

  it("rejects malformed split durations atomically", () => {
    const plan = createInitialPlan(today);
    const before = structuredClone(plan);
    const result = executeRequest(plan, {
      transcript: "split",
      normalized: "split",
      actions: [{ type: "split", selector: { type: "title", query: "deep work" }, durations: [0, 0, 0, 0, 0] }],
      constraints: [],
    });
    expect(result.status).toBe("conflict");
    expect(plan).toEqual(before);
  });

  it("recovers only upcoming work after the injected clock", () => {
    const plan = createInitialPlan(today);
    const emailBefore = plan.events.find((event) => event.id === "email")!;
    const result = executeRequest(plan, {
      transcript: "I am 30 minutes behind from now",
      normalized: "i am 30 minutes behind from now",
      actions: [{ type: "recover", delayMinutes: 30 }],
      constraints: [],
      nowMinutes: 13 * 60,
    });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events.find((event) => event.id === "email")).toEqual(emailBefore);
    expect(result.plan.events.find((event) => event.id === "roadmap")?.start).toBe(14 * 60 + 30);
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("blocks Tide when two immovable schedule objects overlap", () => {
    const plan = createInitialPlan(today);
    plan.breathingRooms = [{
      id: "blocked-room", dateKey: today, start: 12 * 60 + 45, end: 13 * 60,
      protected: true, source: "user", label: "Breathing Room",
    }];
    const proposal = buildTideProposal(plan);
    expect(proposal.risk).toBe("blocked");
    expect(proposal.reasons.join(" ")).toMatch(/overlaps anchored lunch/i);
    expect(proposal.plan).toBe(plan);
  });

  it("never relocates an independently anchored event whose legacy kind is flexible", () => {
    const anchored = execute("Anchor roadmap");
    expect(anchored.status).toBe("success");
    if (anchored.status !== "success") return;
    const roadmap = anchored.plan.events.find((event) => event.id === "roadmap")!;
    expect(roadmap).toMatchObject({ kind: "flexible", mobility: "anchored", protected: false });
    const before = structuredClone(anchored.plan);

    const collision = executeRequest(anchored.plan, {
      transcript: "Add a 20 minute sync at 2 PM",
      normalized: "add a 20 minute sync at 2 pm",
      actions: [{ type: "create", title: "Sync", durationMinutes: 20, destination: { type: "absolute", minutes: 14 * 60 } }],
      constraints: [],
    });

    expect(collision.status).toBe("conflict");
    expect(anchored.plan).toEqual(before);
  });

  it("represents safe Tide moves as generated calendar actions in transaction order", () => {
    const result = executeRequest(createInitialPlan(today), {
      transcript: "Open 20 minutes at 2 and reflow",
      normalized: "open 20 minutes at 2 and reflow",
      actions: [
        { type: "createBreathingRoom", durationMinutes: 20, destination: { type: "absolute", minutes: 14 * 60 }, protected: true },
        { type: "reflow", reason: "make-room" },
      ],
      constraints: [],
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.executedActions.slice(0, 2).map((action) => action.type)).toEqual(["createBreathingRoom", "reflow"]);
    expect(result.executedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "move", origin: "tide", selector: { type: "id", id: "roadmap" }, destination: { type: "absolute", minutes: 14 * 60 + 20 } }),
    ]));
    expect(result.plan.events.find((event) => event.id === "roadmap")?.start).toBe(14 * 60 + 20);
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("replays a Tide deferral through the same action transform", () => {
    const plan = {
      dateKey: today,
      breathingRooms: [],
      deferred: [],
      events: [
        { id: "anchor", title: "Working day", dateKey: today, start: 7 * 60, end: 20 * 60, kind: "fixed" as const, priority: "high" as const },
        { id: "wrap-up", title: "Wrap up", dateKey: today, start: 20 * 60, end: 21 * 60, kind: "flexible" as const, priority: "low" as const },
      ],
    };
    const result = executeRequest(plan, {
      transcript: "Finish at eight",
      normalized: "finish at eight",
      actions: [{ type: "setDayBoundary", endMinutes: 20 * 60 }, { type: "reflow", reason: "boundary" }],
      constraints: [],
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.executedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "defer", origin: "tide", selector: { type: "id", id: "wrap-up" }, atMinutes: 20 * 60 }),
    ]));
    expect(result.plan.events.map((event) => event.id)).toEqual(["anchor"]);
    expect(result.plan.deferred).toEqual([expect.objectContaining({ id: "wrap-up", dateKey: "2026-09-03", start: 20 * 60 })]);
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("runs the automatic Tide trigger after a confirmed deletion", () => {
    const result = executeRequest(createInitialPlan(today), ready("Delete roadmap"), undefined, true);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.summary).toContain("Tide checked the remaining day; no reflow was needed.");
    expect(result.executedActions).toEqual([expect.objectContaining({ type: "delete" })]);
    expect(result.plan.events.some((event) => event.id === "roadmap")).toBe(false);
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("creates a distinct event when another event has the same title", () => {
    const result = execute("Add a 30 minute workout at five");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const workouts = result.plan.events.filter((event) => event.title === "Workout");
    expect(workouts).toHaveLength(2);
    expect(new Set(workouts.map((event) => event.id))).toEqual(new Set(["workout", "workout-2"]));
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("keeps the single active event current and outside Tide movement", () => {
    const plan = createInitialPlan(today);
    plan.events = plan.events.map((event) => event.id === "deep-work" ? { ...event, status: "active" as const } : event);
    const current = resolveEventReference(plan, { type: "position", position: "current" }, undefined, 14 * 60 + 10);
    expect(current).toMatchObject({ status: "resolved", events: [expect.objectContaining({ id: "deep-work" })] });
    const proposal = buildTideProposal({ ...plan, endBoundaryMinutes: 20 * 60 });
    expect(proposal.anchoredIds).toContain("deep-work");
    expect(proposal.actions).not.toEqual(expect.arrayContaining([expect.objectContaining({ selector: { type: "id", id: "deep-work" } })]));
  });

  it("rejects unsafe Space-style starts and more than one active event in the shared engine", () => {
    const plan = createInitialPlan(today);
    const before = structuredClone(plan);
    const early = executeRequest(plan, {
      transcript: "Start dinner", normalized: "start dinner", constraints: [], nowMinutes: 9 * 60,
      actions: [{ type: "update", selector: { type: "id", id: "dinner" }, patch: { status: "active" } }],
    });
    expect(early).toMatchObject({ status: "conflict", title: "Dinner is not current" });
    expect(plan).toEqual(before);

    plan.events = plan.events.map((event) => event.id === "roadmap" ? { ...event, status: "active" as const } : event);
    const second = executeRequest(plan, {
      transcript: "Start lunch", normalized: "start lunch", constraints: [], nowMinutes: 12 * 60 + 40,
      actions: [{ type: "update", selector: { type: "id", id: "lunch" }, patch: { status: "active" } }],
    });
    expect(second).toMatchObject({ status: "conflict", title: "Planning — Q3 roadmap is already active" });
  });

  it("moves a linked Breathing Room atomically with its event and preserves exact geometry", () => {
    const room = execute("Give me 20 minutes before interview");
    expect(room.status).toBe("success");
    if (room.status !== "success") return;
    expect(room.plan.breathingRooms).toEqual([expect.objectContaining({ linkedEventId: "interview", relation: "before", start: 15 * 60 + 40, end: 16 * 60 })]);

    const request = ready("Move interview to six");
    const review = executeRequest(room.plan, request);
    expect(review.status).toBe("confirmation");
    const moved = executeRequest(room.plan, request, undefined, true);
    expect(moved.status).toBe("success");
    if (moved.status !== "success") return;
    expect(moved.plan.events.find((event) => event.id === "interview")).toMatchObject({ start: 18 * 60, bufferBeforeMinutes: 20 });
    expect(moved.plan.breathingRooms).toEqual([expect.objectContaining({ linkedEventId: "interview", relation: "before", start: 17 * 60 + 40, end: 18 * 60 })]);
    expect(validatePlan(moved.plan)).toBeNull();
  });

  it("removes linked rooms with confirmed delete and leaves no dangling metadata", () => {
    const room = execute("Give me 20 minutes before interview");
    if (room.status !== "success") throw new Error("room setup failed");
    const request = ready("Delete interview");
    const review = executeRequest(room.plan, request);
    expect(review).toMatchObject({ status: "confirmation", title: "Remove Interview?" });
    const removed = executeRequest(room.plan, request, undefined, true);
    expect(removed.status).toBe("success");
    if (removed.status !== "success") return;
    expect(removed.plan.breathingRooms).toHaveLength(0);
    expect(validatePlan(removed.plan)).toBeNull();
  });

  it("preserves linked-room ownership through split, merge, resize, and defer", () => {
    const beforeDeep = execute("Give me 20 minutes before deep work");
    if (beforeDeep.status !== "success") throw new Error("room setup failed");
    const splitRequest = ready("Split deep work into two 30 minute sessions");
    expect(executeRequest(beforeDeep.plan, splitRequest).status).toBe("confirmation");
    const split = executeRequest(beforeDeep.plan, splitRequest, undefined, true);
    expect(split.status).toBe("success");
    if (split.status !== "success") return;
    const parts = split.plan.events.filter((event) => event.linkedGroupId === "group-deep-work").sort((left, right) => left.start - right.start);
    expect(parts.map((event) => [event.id, event.bufferBeforeMinutes, event.bufferAfterMinutes])).toEqual([["deep-work", 20, 0], [expect.any(String), 0, 0]]);
    expect(split.plan.breathingRooms).toEqual([expect.objectContaining({ linkedEventId: "deep-work", relation: "before", end: parts[0]!.start })]);
    expect(validatePlan(split.plan)).toBeNull();

    const afterEmail = execute("Give me 15 minutes after email");
    if (afterEmail.status !== "success") throw new Error("room setup failed");
    const merged = executeRequest(afterEmail.plan, ready("Combine email and roadmap"), undefined, true);
    expect(merged.status).toBe("success");
    if (merged.status !== "success") return;
    const canonical = merged.plan.events.find((event) => event.id === "email")!;
    expect(canonical.bufferAfterMinutes).toBe(15);
    expect(merged.plan.breathingRooms).toEqual([expect.objectContaining({ linkedEventId: "email", relation: "after", start: canonical.end })]);
    expect(validatePlan(merged.plan)).toBeNull();

    const resized = executeRequest(afterEmail.plan, ready("Extend email by 10 minutes"));
    expect(resized.status).toBe("success");
    if (resized.status !== "success") return;
    const resizedEmail = resized.plan.events.find((event) => event.id === "email")!;
    expect(resized.plan.breathingRooms).toEqual([expect.objectContaining({ linkedEventId: "email", start: resizedEmail.end, end: resizedEmail.end + 15 })]);
    expect(validatePlan(resized.plan)).toBeNull();

    const beforeInterview = execute("Give me 20 minutes before interview");
    if (beforeInterview.status !== "success") throw new Error("room setup failed");
    const deferRequest = ready("Move interview to tomorrow");
    const deferred = executeRequest(beforeInterview.plan, deferRequest, undefined, true);
    expect(deferred.status).toBe("success");
    if (deferred.status !== "success") return;
    expect(deferred.plan.deferred.find((event) => event.id === "interview")).toMatchObject({ dateKey: "2026-09-03", bufferBeforeMinutes: 20 });
    expect(deferred.plan.breathingRooms).toEqual([expect.objectContaining({ dateKey: "2026-09-03", linkedEventId: "interview", relation: "before" })]);
    expect(validatePlan(deferred.plan)).toBeNull();
  });

  it("enumerates every destructive or anchored target before one compound confirmation", () => {
    const plan = createInitialPlan(today);
    const request = ready("Delete email and delete roadmap");
    const review = executeRequest(plan, request);
    expect(review).toMatchObject({ status: "confirmation", title: "Remove Review and respond to email, Planning — Q3 roadmap?" });
    if (review.status !== "confirmation") return;
    const confirmed = executeRequest(plan, request, undefined, review.authorizationKey);
    expect(confirmed.status).toBe("success");
    if (confirmed.status !== "success") return;
    expect(confirmed.plan.events.some((event) => ["email", "roadmap"].includes(event.id))).toBe(false);

    const protectedMoves = {
      transcript: "Move lunch to 2 and dinner to 8", normalized: "move lunch to 2 and dinner to 8", constraints: [],
      actions: [
        { type: "move" as const, selector: { type: "id" as const, id: "lunch" }, destination: { type: "absolute" as const, minutes: 14 * 60 } },
        { type: "move" as const, selector: { type: "id" as const, id: "dinner" }, destination: { type: "absolute" as const, minutes: 20 * 60 } },
      ],
    };
    const protectedReview = executeRequest(plan, protectedMoves);
    expect(protectedReview.status).toBe("confirmation");
    if (protectedReview.status === "confirmation") {
      expect(protectedReview.title).toContain("Lunch");
      expect(protectedReview.title).toContain("Dinner");
      expect(protectedReview.authorizationKey.split("|")).toHaveLength(2);
    }
  });

  it("excludes completed work from default live batches but keeps it addressable for reopen", () => {
    const donePlan = createInitialPlan(today);
    donePlan.events = donePlan.events.map((event) => event.id === "roadmap" ? { ...event, status: "done" as const } : event);
    const before = donePlan.events.find((event) => event.id === "roadmap")!;
    const result = executeRequest(donePlan, ready("Move all flexible work after lunch"));
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events.find((event) => event.id === "roadmap")).toEqual(expect.objectContaining({ start: before.start, end: before.end, status: "done" }));
    expect(resolveEventReference(result.plan, { type: "title", query: "roadmap" })).toMatchObject({ status: "resolved" });
  });

  it("validates bounded batch cardinality and flattens repeated merge ancestry", () => {
    const plan = createInitialPlan(today);
    plan.events.push(
      { id: "admin-a", title: "Admin inbox", labels: ["admin"], dateKey: today, start: 8 * 60 + 30, end: 8 * 60 + 45, kind: "flexible", priority: "low" },
      { id: "admin-b", title: "Admin notes", labels: ["admin"], dateKey: today, start: 10 * 60, end: 10 * 60 + 15, kind: "flexible", priority: "low" },
      { id: "admin-c", title: "Admin expenses", labels: ["admin"], dateKey: today, start: 10 * 60 + 15, end: 10 * 60 + 30, kind: "flexible", priority: "low" },
    );
    const batch = ready("Batch all three admin tasks");
    expect(batch.actions[0]).toMatchObject({ type: "merge", expectedCount: 3, selector: { type: "filter", cardinality: "many", query: "admin" } });
    const review = executeRequest(plan, batch);
    expect(review.status).toBe("confirmation");

    const first = executeRequest(createInitialPlan(today), ready("Combine email and roadmap"), undefined, true);
    expect(first.status).toBe("success");
    if (first.status !== "success") return;
    const second = executeRequest(first.plan, ready("Combine email and workout"), undefined, true);
    expect(second.status).toBe("success");
    if (second.status !== "success") return;
    expect(second.plan.events.find((event) => event.id === "email")?.mergedFromIds).toEqual(["email", "roadmap", "workout"]);
  });

  it("keeps merge anaphors bound to the surviving canonical event", () => {
    const request = ready("Combine email and roadmap, then make it red");
    const review = executeRequest(createInitialPlan(today), request);
    expect(review.status).toBe("confirmation");
    const result = executeRequest(createInitialPlan(today), request, undefined, true);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events.find((event) => event.id === "email")).toMatchObject({ color: "red", mergedFromIds: ["email", "roadmap"] });
  });

  it("classifies leading and trailing capacity as real open space", () => {
    expect(classifyDensity({ dateKey: today, events: [], deferred: [], breathingRooms: [] })).toBe("Open");
    expect(classifyDensity({ dateKey: today, events: [{ id: "one", title: "One", dateKey: today, start: 12 * 60, end: 13 * 60, kind: "flexible", priority: "low" }], deferred: [], breathingRooms: [] })).toBe("Open");
    const seed = createInitialPlan(today);
    expect(["Calm", "Open"]).toContain(classifyDensity(seed));
    expect(classifyDensity({ ...seed, endBoundaryMinutes: 18 * 60 })).toBe("Overloaded");
  });

  it("executes audited clocks, durations, titles, ranges, and contextual evening time", () => {
    const reading = execute("Block seventy five minutes for planning at ten");
    expect(reading).toMatchObject({ status: "success", plan: { events: expect.arrayContaining([expect.objectContaining({ title: "Planning", start: 600, end: 675 })]) } });

    const room = execute("Create breathing room from three to three thirty");
    expect(room).toMatchObject({ status: "success", plan: { breathingRooms: [expect.objectContaining({ start: 900, end: 930 })] } });

    const resized = execute("Make dinner ninety minutes");
    expect(resized).toMatchObject({ status: "success", plan: { events: expect.arrayContaining([expect.objectContaining({ id: "dinner", start: 1140, end: 1230 })]) } });

    const deferred = execute("Schedule review next Thursday at half past three");
    expect(deferred).toMatchObject({ status: "success", plan: { deferred: expect.arrayContaining([expect.objectContaining({ title: "Review", dateKey: "2026-09-03", start: 930, end: 960 })]) } });

    const evening = execute("Unprotect dinner, make it light, and move it to eight");
    expect(evening).toMatchObject({ status: "success", plan: { events: expect.arrayContaining([expect.objectContaining({ id: "dinner", protected: false, mobility: "light", start: 1200, end: 1260 })]) } });
  });

  it("scopes color and descriptive batches without treating category nouns as titles", () => {
    const plan = createInitialPlan(today);
    plan.events = plan.events.map((event) => event.id === "roadmap" || event.id === "email"
      ? { ...event, color: "red" as const }
      : event.id === "deep-work" ? { ...event, color: "yellow" as const } : event);
    const recolored = executeRequest(plan, ready("Make every red meeting neutral"));
    expect(recolored.status).toBe("success");
    if (recolored.status !== "success") return;
    expect(recolored.plan.events.filter((event) => ["roadmap", "email"].includes(event.id)).map(eventColor)).toEqual(["neutral", "neutral"]);
    expect(eventColor(recolored.plan.events.find((event) => event.id === "deep-work")!)).toBe("yellow");

    const deletion = executeRequest(plan, ready("Cancel every red meeting"));
    expect(deletion).toMatchObject({ status: "confirmation", title: expect.stringContaining("Review and respond to email") });
    if (deletion.status === "confirmation") expect(deletion.title).not.toContain("Deep work");

    const preview = executeRequest(plan, ready("What if all red meetings move Thursday"));
    expect(preview.status).toBe("success");
    if (preview.status !== "success") return;
    expect(preview.plan.deferred.map((event) => event.id).sort()).toEqual(["email", "roadmap"]);
    expect(preview.plan.events.some((event) => event.id === "deep-work")).toBe(true);
  });

  it("keeps shift scope, merge lists, and split ordinals exact and atomic", () => {
    const shifted = execute("Push everything after lunch back thirty minutes");
    expect(shifted.status).toBe("success");
    if (shifted.status !== "success") return;
    expect(shifted.plan.events.find((event) => event.id === "email")?.start).toBe(660);
    expect(shifted.plan.events.find((event) => event.id === "roadmap")?.start).toBe(870);

    const mergeRequest = ready("Combine email, roadmap, and workout");
    const merged = executeRequest(createInitialPlan(today), mergeRequest, undefined, true);
    expect(merged.status).toBe("success");
    if (merged.status !== "success") return;
    expect(merged.plan.events.find((event) => event.id === "email")?.mergedFromIds).toEqual(["email", "roadmap", "workout"]);

    const split = execute("Split deep work in half and put the second one after lunch");
    expect(split.status).toBe("success");
    if (split.status !== "success") return;
    const parts = split.plan.events.filter((event) => event.linkedGroupId === "group-deep-work").sort((left, right) => left.start - right.start);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({ start: 795, end: 825 });
    expect(validatePlan(split.plan)).toBeNull();
  });

  it("moves a single keyboard shift exactly and lets Tide make room", () => {
    const request = {
      transcript: "Move Planning — Q3 roadmap 15 minutes later",
      normalized: "move planning q3 roadmap 15 minutes later",
      actions: [{ type: "shift" as const, selector: { type: "id" as const, id: "roadmap" }, deltaMinutes: 15 }],
      constraints: [],
    };
    const shifted = executeRequest(createInitialPlan(today), request);
    expect(shifted.status).toBe("success");
    if (shifted.status !== "success") return;
    expect(shifted.plan.events.find((event) => event.id === "roadmap")).toMatchObject({ start: 855, end: 915 });
    expect(shifted.plan.events.find((event) => event.id === "workout")).toMatchObject({ start: 1050, end: 1110 });
    expect(validatePlan(shifted.plan)).toBeNull();
  });

  it("reopens only completed matches by source time and position", () => {
    const plan = createInitialPlan(today);
    plan.events = plan.events.map((event) => event.id === "roadmap" ? { ...event, status: "done" as const } : event);
    for (const utterance of ["Reopen the 2 PM meeting", "Reopen the last event"]) {
      const result = executeRequest(plan, ready(utterance));
      expect(result.status, utterance).toBe("success");
      if (result.status === "success") {
        expect(eventStatus(result.plan.events.find((event) => event.id === "roadmap")!)).toBe("planned");
        expect(eventStatus(result.plan.events.find((event) => event.id === "dinner")!)).toBe("planned");
      }
    }
  });

  it("binds anaphors to resolved targets even when the prior action was a no-op", () => {
    const cases = [
      ["Unprotect email, then make it red", "email"],
      ["Protect lunch, then make it red", "lunch"],
      ["Move roadmap to two, then make it red", "roadmap"],
    ] as const;
    for (const [utterance, targetId] of cases) {
      const result = executeRequest(createInitialPlan(today), ready(utterance), "lunch");
      expect(result.status, utterance).toBe("success");
      if (result.status === "success") {
        expect(eventColor(result.plan.events.find((event) => event.id === targetId)!)).toBe("red");
        expect(eventColor(result.plan.events.find((event) => event.id === "lunch")!)).toBe(targetId === "lunch" ? "red" : "neutral");
      }
    }
  });

  it("preserves odd split duration exactly and never previews protected movement", () => {
    const split = execute("Split email in half");
    expect(split.status).toBe("success");
    if (split.status === "success") {
      const parts = split.plan.events.filter((event) => event.linkedGroupId === "group-email");
      expect(parts.map((event) => event.end - event.start).sort((left, right) => right - left)).toEqual([23, 22]);
      expect(parts.reduce((total, event) => total + event.end - event.start, 0)).toBe(45);
    }
    const plan = createInitialPlan(today);
    const preview = buildDirectManipulationPreview(plan, [{ type: "move", selector: { type: "id", id: "lunch" }, destination: { type: "absolute", minutes: 800 } }], 600);
    expect(preview?.plan).toBe(plan);
    expect(preview?.plan.events.find((event) => event.id === "lunch")?.start).toBe(750);
  });

  it("keeps one explicitly sized split session before its relative anchor", () => {
    const result = execute("Split deep work into two 45-minute sessions and keep one before lunch");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    const parts = result.plan.events.filter((event) => event.linkedGroupId === "group-deep-work").sort((left, right) => left.start - right.start);
    expect(parts.map((event) => event.end - event.start)).toEqual([45, 45]);
    expect(parts[0]).toMatchObject({ id: "deep-work", start: 540, end: 585 });
    expect(parts.some((event) => event.end <= result.plan.events.find((event) => event.id === "lunch")!.start)).toBe(true);
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("ignores future-day rooms in today density and score geometry", () => {
    const plan = createInitialPlan(today);
    const futureRoom = { id: "tomorrow-room", dateKey: "2026-09-03", start: 420, end: 1260, protected: true, source: "user" as const };
    expect(classifyDensity({ ...plan, breathingRooms: [futureRoom] })).toBe(classifyDensity(plan));
    expect(scoreSchedule(plan, { ...plan, breathingRooms: [futureRoom] })).toEqual(scoreSchedule(plan, plan));
  });

  it("builds the same moving and deferring Tide proposal for repeated and reordered equivalent input", () => {
    const events = [
      { id: "anchor-a", title: "Opening anchor", dateKey: today, start: 420, end: 480, kind: "fixed" as const, priority: "high" as const, mobility: "anchored" as const, protected: true },
      { id: "move-me", title: "Flexible review", dateKey: today, start: 450, end: 510, kind: "flexible" as const, priority: "medium" as const, mobility: "light" as const, protected: false },
      { id: "defer-me", title: "Flexible admin", dateKey: today, start: 510, end: 570, kind: "flexible" as const, priority: "low" as const, mobility: "fluid" as const, protected: false },
      { id: "anchor-b", title: "Closing anchor", dateKey: today, start: 540, end: 600, kind: "fixed" as const, priority: "high" as const, mobility: "anchored" as const, protected: true },
    ];
    const plan = { dateKey: today, events, deferred: [], breathingRooms: [], endBoundaryMinutes: 600 };
    const reordered = { ...plan, events: [events[2]!, events[3]!, events[0]!, events[1]!] };
    const original = structuredClone(plan);
    const reorderedOriginal = structuredClone(reordered);

    const first = buildTideProposal(plan);
    const repeated = buildTideProposal(plan);
    const equivalent = buildTideProposal(reordered);

    expect(first.risk).toBe("safe");
    expect(first.movedIds).toEqual(["move-me"]);
    expect(first.deferredIds).toEqual(["defer-me"]);
    expect(first.actions).toEqual([
      { type: "move", selector: { type: "id", id: "move-me" }, destination: { type: "absolute", minutes: 480 }, origin: "tide" },
      { type: "defer", selector: { type: "id", id: "defer-me" }, date: { dateKey: "2026-09-03" }, atMinutes: 510, origin: "tide" },
    ]);
    expect(repeated.actions).toEqual(first.actions);
    expect(equivalent.actions).toEqual(first.actions);
    expect(repeated.plan).toEqual(first.plan);
    expect(equivalent.plan).toEqual(first.plan);
    expect(repeated.beforeScore).toEqual(first.beforeScore);
    expect(repeated.afterScore).toEqual(first.afterScore);
    expect(equivalent.beforeScore).toEqual(first.beforeScore);
    expect(equivalent.afterScore).toEqual(first.afterScore);
    expect(plan).toEqual(original);
    expect(reordered).toEqual(reorderedOriginal);
  });
});
