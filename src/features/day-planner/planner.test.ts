import { describe, expect, it } from "vitest";
import type { CalendarRequest, DayPlan } from "./model";
import { interpretTranscript } from "./parser";
import { executeRequest, validatePlan } from "./planner";
import { createInitialPlan } from "./seed";
import { resolveEventReference, applyDestinationChoice, matchTitleReference } from "./scheduling/resolution";
import { hasCollision, suggestAlternativeSlots } from "./scheduling/slots";
import { eventMobility, eventProtected } from "./eventDefaults";

const dateKey = "2026-09-02";

function execute(plan: DayPlan, transcript: string, selectedId?: string, confirmed = false) {
  const parsed = interpretTranscript(transcript, plan.dateKey);
  expect(parsed.status).toBe("ready");
  if (parsed.status !== "ready") throw new Error(parsed.detail);
  return executeRequest(plan, parsed.request, selectedId, confirmed);
}

describe("pure scheduling transaction", () => {
  it("resolves a 2 PM source after an anchored event was explicitly moved away from 4 PM", () => {
    const first = execute(createInitialPlan(dateKey), "Move interview to 5");
    expect(first.status).toBe("confirmation");
    if (first.status !== "confirmation") return;
    const confirmed = executeRequest(createInitialPlan(dateKey), first.request, undefined, first.authorizationKey);
    expect(confirmed.status).toBe("success");
    if (confirmed.status !== "success") return;
    expect(confirmed.plan.events.find((event) => event.id === "roadmap")?.start).toBe(14 * 60);

    const interpreted = interpretTranscript("Move the 2 PM to 4", dateKey);
    expect(interpreted).toMatchObject({
      status: "ready",
      request: {
        actions: [{
          type: "move",
          selector: { type: "source", at: 14 * 60 },
          destination: { type: "absolute", minutes: 16 * 60 },
        }],
      },
    });
    if (interpreted.status !== "ready") return;
    const action = interpreted.request.actions[0];
    expect(action).toEqual({
      type: "move",
      selector: { type: "source", at: 14 * 60 },
      destination: { type: "absolute", minutes: 16 * 60 },
    });
    if (action?.type !== "move") return;
    const resolved = resolveEventReference(confirmed.plan, action.selector, undefined);
    expect(resolved).toMatchObject({ status: "resolved", events: [{ id: "roadmap" }] });

    const second = execute(confirmed.plan, "Move the 2 PM to 4");
    expect(second.status).toBe("success");
    if (second.status !== "success") return;
    expect(second.plan.events.find((event) => event.id === "roadmap")?.start).toBe(16 * 60);
    expect(validatePlan(second.plan)).toBeNull();
  });

  it("executes the release acceptance commands against a realistic day", () => {
    const commands = [
      "Move my workout to 6", "Put the workout at six pm", "Reschedule deep work for 2:30",
      "Move email before lunch", "Add a 30 minute walk at 5", "Schedule a twenty minute break before the interview",
      "Block one hour for reading tomorrow morning", "Fit a 40 minute workout before dinner",
      "Fit one hour client debrief in the next free slot",
      "Make room for a 25 minute break between 3 and 5", "Find the next free 45 minute slot for study",
      "Make email 20 minutes", "Extend deep work by half an hour", "Make the workout one hour long",
      "Protect lunch", "Make lunch flexible", "I'm 35 minutes behind, keep dinner at 7",
      "I'm running half an hour late; save my afternoon", "I lost 45 minutes. Move low priority work to tomorrow",
      "I'm late. Give me 20 minutes to breathe before the interview", "Recover the day without moving lunch or dinner",
      "Push what can move and protect my fixed appointments", "Keep dinner where it is and make room for a break",
    ];
    for (const command of commands) {
      const result = execute(createInitialPlan(dateKey), command);
      expect(result.status, command).toBe("success");
      if (result.status === "success") expect(validatePlan(result.plan), command).toBeNull();
    }
  });

  it("moves, resizes, protects, and defers arbitrary events without changing IDs", () => {
    let plan = createInitialPlan(dateKey);
    const moved = execute(plan, "Move my workout to 6");
    expect(moved.status).toBe("success");
    if (moved.status !== "success") return;
    plan = moved.plan;
    expect(plan.events.find((event) => event.id === "workout")?.start).toBe(18 * 60);

    const resized = execute(plan, "Make email 20 minutes");
    expect(resized.status).toBe("success");
    if (resized.status !== "success") return;
    plan = resized.plan;
    expect(plan.events.find((event) => event.id === "email")?.end).toBe(680);

    const protectedResult = execute(plan, "Protect email");
    expect(protectedResult.status).toBe("success");
    if (protectedResult.status !== "success") return;
    plan = protectedResult.plan;
    expect(plan.events.find((event) => event.id === "email")?.kind).toBe("flexible");
    expect(eventProtected(plan.events.find((event) => event.id === "email")!)).toBe(true);

    const deferred = execute(plan, "Move the roadmap to tomorrow morning");
    expect(deferred.status).toBe("success");
    if (deferred.status !== "success") return;
    expect(deferred.plan.events.some((event) => event.id === "roadmap")).toBe(false);
    expect(deferred.plan.deferred.find((event) => event.id === "roadmap")?.dateKey).toBe("2026-09-03");
    expect(validatePlan(deferred.plan)).toBeNull();
  });

  it("defaults an unqualified defer to tomorrow without losing the event", () => {
    const initial = createInitialPlan(dateKey);
    const result = execute(initial, "Defer low priority work");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.deferred.find((event) => event.id === "roadmap")?.dateKey).toBe("2026-09-03");
    expect(result.plan.events).toHaveLength(initial.events.length - 1);
    expect(result.plan.events.length + result.plan.deferred.length).toBe(initial.events.length);
  });

  it("treats an already-satisfied request as a no-op without changing data", () => {
    const initial = createInitialPlan(dateKey);
    const result = execute(initial, "Move my workout to 5:30 pm");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan).toEqual(initial);
    expect(result.changes.changedIds).toEqual(new Set());
    expect(result.changes.anchoredIds).toEqual(new Set(["workout"]));
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("applies a compound recovery atomically", () => {
    const initial = createInitialPlan(dateKey);
    const result = execute(initial, "I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events.find((event) => event.id === "dinner")?.start).toBe(19 * 60);
    expect(result.plan.deferred.some((event) => event.id === "roadmap")).toBe(true);
    expect(result.plan.breathingRooms).toEqual(expect.arrayContaining([
      expect.objectContaining({ start: 15 * 60 + 40, end: 16 * 60, protected: true, source: "user" }),
    ]));
    expect(validatePlan(result.plan)).toBeNull();
    expect(new Set([...result.plan.events, ...result.plan.deferred].map((event) => event.id)).size).toBe(result.plan.events.length + result.plan.deferred.length);
  });

  it("reflows every flexible event and fits new work without loss", () => {
    const initial = createInitialPlan(dateKey);
    const result = execute(initial, "Move flexible work after 2, protect lunch, and fit 40 minutes of exercise before dinner");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events.filter((event) => event.kind === "flexible")).toHaveLength(5);
    for (const id of ["deep-work", "email", "roadmap", "workout"]) {
      expect(result.plan.events.some((event) => event.id === id)).toBe(true);
    }
    expect(validatePlan(result.plan)).toBeNull();
  });

  it("returns clarification for ambiguous matches without mutation", () => {
    const base = createInitialPlan(dateKey);
    const plan: DayPlan = { ...base, events: [
      ...base.events,
      { id: "product-meeting", title: "Product meeting", dateKey, start: 600, end: 630, kind: "flexible" as const, priority: "medium" as const },
      { id: "hiring-meeting", title: "Hiring meeting", dateKey, start: 1200, end: 1230, kind: "flexible" as const, priority: "medium" as const },
    ].filter((event) => event.id !== "deep-work" && event.id !== "dinner") };
    const result = execute(plan, "Move the meeting to 4");
    expect(result.status).toBe("clarification");
    if (result.status === "clarification") expect(result.clarification.choices).toHaveLength(2);
    expect(plan.events.find((event) => event.id === "product-meeting")?.start).toBe(600);
  });

  it("requires confirmation before deletion", () => {
    const initial = createInitialPlan(dateKey);
    const preview = execute(initial, "Cancel the dentist appointment");
    expect(preview.status).toBe("confirmation");
    expect(initial.events.some((event) => event.id === "dentist")).toBe(true);
    const applied = execute(initial, "Cancel the dentist appointment", undefined, true);
    expect(applied.status).toBe("success");
    if (applied.status === "success") expect(applied.plan.events.some((event) => event.id === "dentist")).toBe(false);
  });

  it("rejects an impossible compound request without partial mutation", () => {
    const initial = createInitialPlan(dateKey);
    const parsed = interpretTranscript("Protect email and fit a three hour workout before dinner", dateKey);
    expect(parsed.status).toBe("ready");
    if (parsed.status !== "ready") return;
    const result = executeRequest(initial, parsed.request);
    expect(result.status).toBe("conflict");
    expect(initial.events.find((event) => event.id === "email")?.kind).toBe("flexible");
  });

  it("validates duplicates, overlaps, bounds, and positive duration", () => {
    const base = createInitialPlan(dateKey);
    const duplicate: DayPlan = { ...base, events: [...base.events, { ...base.events[0]! }] };
    expect(validatePlan(duplicate)).toMatch(/unique/i);
    const overlap: DayPlan = { ...base, events: base.events.map((event) => event.id === "email" ? { ...event, start: 550, end: 580 } : event) };
    expect(validatePlan(overlap)).toMatch(/overlap/i);
    const invalid: DayPlan = { ...base, events: base.events.map((event) => event.id === "email" ? { ...event, end: event.start } : event) };
    expect(validatePlan(invalid)).toMatch(/positive/i);
  });

  it("does not depend on seed IDs during recovery", () => {
    const plan: DayPlan = {
      dateKey, deferred: [], events: [
        { id: "alpha", title: "Write proposal", dateKey, start: 540, end: 600, kind: "flexible", priority: "medium" },
        { id: "anchor", title: "Client call", dateKey, start: 660, end: 720, kind: "fixed", priority: "high" },
      ],
    };
    const request: CalendarRequest = { transcript: "late", normalized: "late", actions: [{ type: "recover", delayMinutes: 30 }], constraints: [] };
    const result = executeRequest(plan, request);
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.plan.events.find((event) => event.id === "alpha")?.start).toBe(570);
  });

  it("moves the explicitly named Interview to six and safely relocates flexible work", () => {
    const initial = createInitialPlan(dateKey);
    const review = execute(initial, "Move interview to six");
    expect(review.status).toBe("confirmation");
    expect(initial.events.find((event) => event.id === "interview")?.start).toBe(16 * 60);
    const result = execute(initial, "Move interview to six", undefined, true);
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events).toHaveLength(initial.events.length);
    expect(new Set(result.plan.events.map((event) => event.id)).size).toBe(initial.events.length);
    expect(result.plan.events.find((event) => event.id === "interview")).toMatchObject({ start: 18 * 60, end: 19 * 60, kind: "fixed" });
    expect(result.plan.events.find((event) => event.id === "workout")).toMatchObject({ start: 20 * 60, end: 21 * 60, kind: "flexible" });
    expect(result.plan.events.find((event) => event.id === "dinner")).toMatchObject({ start: 19 * 60, end: 20 * 60, kind: "protected" });
    expect(validatePlan(result.plan)).toBeNull();
    expect(initial.events.find((event) => event.id === "interview")?.start).toBe(16 * 60);
  });

  it("keeps an impossible make-room move atomic", () => {
    const initial: DayPlan = { dateKey, deferred: [], events: [
      { id: "morning", title: "Morning anchor", dateKey, start: 7 * 60, end: 16 * 60, kind: "protected", priority: "high" },
      { id: "interview", title: "Interview", dateKey, start: 16 * 60, end: 17 * 60, kind: "fixed", priority: "high" },
      { id: "anchor", title: "Evening anchor", dateKey, start: 17 * 60, end: 17 * 60 + 30, kind: "protected", priority: "high" },
      { id: "workout", title: "Workout", dateKey, start: 17 * 60 + 30, end: 19 * 60, kind: "flexible", priority: "medium" },
      { id: "dinner", title: "Dinner", dateKey, start: 19 * 60, end: 21 * 60, kind: "protected", priority: "high" },
    ] };
    const review = execute(initial, "Move interview to six");
    expect(review.status).toBe("confirmation");
    const result = execute(initial, "Move interview to six", undefined, true);
    expect(result.status).toBe("conflict");
    expect(initial.events.find((event) => event.id === "interview")?.start).toBe(16 * 60);
    expect(initial.events.find((event) => event.id === "workout")?.start).toBe(17 * 60 + 30);
    expect(validatePlan(initial)).toBeNull();
  });

  it("prefers exact source time and permits a sole bounded non-destructive neighbor", () => {
    const initial = createInitialPlan(dateKey);
    const plan: DayPlan = { ...initial, events: initial.events.map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event) };
    const exact = resolveEventReference(plan, { type: "source", at: 14 * 60 });
    expect(exact.status).toBe("resolved");
    if (exact.status === "resolved") expect(exact.events.map((event) => event.id)).toEqual(["roadmap"]);
    const nearby = resolveEventReference(plan, { type: "source", at: 13 * 60 + 45 });
    expect(nearby).toMatchObject({ status: "resolved", events: [{ id: "roadmap" }] });
    expect(resolveEventReference(plan, { type: "source", at: 13 * 60 + 45 }, undefined, undefined, false, true)).toMatchObject({ status: "clarification" });
  });

  it("clarifies duplicate exact-time source matches instead of guessing", () => {
    const initial = createInitialPlan(dateKey);
    const plan: DayPlan = { ...initial, events: initial.events.map((event) => event.id === "email" ? { ...event, start: 14 * 60, end: 14 * 60 + 45 } : event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event) };
    const result = resolveEventReference(plan, { type: "source", at: 14 * 60 });
    expect(result.status).toBe("clarification");
    if (result.status === "clarification") {
      expect(result.type).toBe("event");
      expect(result.choices.map((choice) => choice.id)).toEqual(["email", "roadmap"]);
    }
  });

  it("suggests three collision-free 15-minute slots by displacement with later tie preference", () => {
    const initial = createInitialPlan(dateKey);
    const target = initial.events.find((event) => event.id === "roadmap")!;
    const starts = suggestAlternativeSlots(initial.events, target);
    expect(starts).toEqual([14 * 60 + 15, 13 * 60 + 45, 14 * 60 + 30]);
    for (const start of starts) {
      const candidate = { ...target, start, end: start + (target.end - target.start) };
      expect(start % 15).toBe(0);
      expect(start).not.toBe(target.start);
      expect(hasCollision(candidate, initial.events.filter((event) => event.id !== target.id))).toBe(false);
    }
  });

  it("turns the screenshot utterance into a focused destination clarification without mutation", () => {
    const seed = createInitialPlan(dateKey);
    const initial: DayPlan = { ...seed, events: seed.events.map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event) };
    const before = structuredClone(initial);
    const result = execute(initial, "change my 2:00 p.m. meeting to another time");
    expect(result.status).toBe("clarification");
    if (result.status !== "clarification") return;
    expect(result.clarification.type).toBe("destination");
    expect(result.clarification.question).toBe("When should I move Planning — Q3 roadmap?");
    expect(result.clarification.choices).toHaveLength(3);
    expect(initial).toEqual(before);
  });

  it("applies a destination choice through the atomic engine and supports exact no-op handling", () => {
    const seed = createInitialPlan(dateKey);
    const initial: DayPlan = { ...seed, events: seed.events.map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event) };
    const parsed = interpretTranscript("change my 2:00 p.m. meeting to another time", dateKey);
    expect(parsed.status).toBe("ready");
    if (parsed.status !== "ready") return;
    const preview = executeRequest(initial, parsed.request);
    expect(preview.status).toBe("clarification");
    if (preview.status !== "clarification" || preview.clarification.type !== "destination") return;
    const choice = preview.clarification.choices[0]!;
    const chosen = applyDestinationChoice(parsed.request, preview.clarification.actionIndex, choice.destination);
    const applied = executeRequest(initial, chosen);
    expect(applied.status).toBe("success");
    if (applied.status !== "success") return;
    expect(applied.plan.events.find((event) => event.id === "roadmap")?.start).toBe(choice.destination.type === "absolute" ? choice.destination.minutes : -1);
    expect(applied.plan.events).toHaveLength(initial.events.length);
    expect(validatePlan(applied.plan)).toBeNull();

    const noOp = executeRequest(initial, applyDestinationChoice(parsed.request, preview.clarification.actionIndex, { type: "absolute", minutes: 14 * 60 }));
    expect(noOp.status).toBe("success");
    if (noOp.status === "success") expect(noOp.plan).toEqual(initial);
  });

  it("keeps an earlier compound action uncommitted until the destination is chosen", () => {
    const seed = createInitialPlan(dateKey);
    const initial: DayPlan = { ...seed, events: seed.events.map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event) };
    const parsed = interpretTranscript("Make lunch flexible and change my 2 pm meeting to another time", dateKey);
    expect(parsed.status).toBe("ready");
    if (parsed.status !== "ready") return;
    const preview = executeRequest(initial, parsed.request);
    expect(preview.status).toBe("clarification");
    expect(initial.events.find((event) => event.id === "lunch")?.kind).toBe("protected");
    if (preview.status !== "clarification" || preview.clarification.type !== "destination") return;
    const request = applyDestinationChoice(parsed.request, preview.clarification.actionIndex, preview.clarification.choices[0]!.destination);
    const applied = executeRequest(initial, request);
    expect(applied.status).toBe("success");
    if (applied.status !== "success") return;
    const releasedLunch = applied.plan.events.find((event) => event.id === "lunch")!;
    expect(releasedLunch.kind).toBe("protected");
    expect(eventProtected(releasedLunch)).toBe(false);
    expect(eventMobility(releasedLunch)).toBe("light");
    expect(validatePlan(applied.plan)).toBeNull();
  });

  it("turns a source-only reschedule into destination clarification", () => {
    const seed = createInitialPlan(dateKey);
    const plan: DayPlan = { ...seed, events: seed.events.map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event) };
    const before = structuredClone(plan);
    const result = execute(plan, "reschedule the meeting at 2 pm");
    expect(result.status).toBe("clarification");
    if (result.status === "clarification") {
      expect(result.clarification.type).toBe("destination");
      expect(result.clarification.question).toBe("When should I move Planning — Q3 roadmap?");
    }
    expect(plan).toEqual(before);
  });

  it("does not expand an unmatched bare generic noun to every event", () => {
    const initial = createInitialPlan(dateKey);
    const result = execute(initial, "change my meeting to another time");
    expect(result).toMatchObject({ status: "conflict", title: "Event not found" });
    expect(initial).toEqual(createInitialPlan(dateKey));
  });

  it("resolves one actual generic-noun title and clarifies multiple actual matches", () => {
    const seed = createInitialPlan(dateKey);
    const one: DayPlan = { ...seed, events: [
      ...seed.events,
      { id: "product-meeting", title: "Product meeting", dateKey, start: 1200, end: 1230, kind: "flexible", priority: "medium" },
    ] };
    const destination = execute(one, "change my meeting to another time");
    expect(destination.status).toBe("clarification");
    if (destination.status === "clarification") {
      expect(destination.clarification.type).toBe("destination");
      expect(destination.clarification.question).toBe("When should I move Product meeting?");
    }

    const many: DayPlan = { ...one, events: [
      ...one.events,
      { id: "hiring-meeting", title: "Hiring meeting", dateKey, start: 1230, end: 1260, kind: "flexible", priority: "medium" },
    ] };
    const ambiguous = execute(many, "change my meeting to another time");
    expect(ambiguous.status).toBe("clarification");
    if (ambiguous.status === "clarification") {
      expect(ambiguous.clarification.type).toBe("event");
      expect(ambiguous.clarification.choices.map((choice) => choice.id)).toEqual(["product-meeting", "hiring-meeting"]);
    }
  });

  it("resolves boundary generic nouns only after exact and full-query matching fail", () => {
    const initial = createInitialPlan(dateKey);
    const deepWork = initial.events.find((event) => event.id === "deep-work")!;
    const aliases = [
      "deep work meeting", "meeting deep work", "deep work appointment", "appointment deep work",
      "deep work task", "task deep work", "deep work event", "event deep work",
      "deep work block", "block deep work",
    ];
    for (const query of aliases) {
      expect(matchTitleReference(initial.events, query).map((event) => event.id), query).toEqual([deepWork.id]);
    }

    const exactTitlePlan: DayPlan = { ...initial, events: [
      ...initial.events,
      { id: "product-meeting", title: "Product meeting", dateKey, start: 600, end: 630, kind: "flexible", priority: "medium" },
      { id: "product-review", title: "Product review", dateKey, start: 630, end: 660, kind: "flexible", priority: "medium" },
      { id: "planning-block", title: "Planning block", dateKey, start: 1200, end: 1230, kind: "flexible", priority: "medium" },
      { id: "client-call", title: "Client call", dateKey, start: 1230, end: 1260, kind: "flexible", priority: "medium" },
      { id: "call", title: "Call", dateKey, start: 1260, end: 1290, kind: "flexible", priority: "medium" },
    ] };
    expect(matchTitleReference(exactTitlePlan.events, "product meeting").map((event) => event.id)).toEqual(["product-meeting"]);
    expect(matchTitleReference(exactTitlePlan.events, "dentist appointment").map((event) => event.id)).toEqual(["dentist"]);
    expect(matchTitleReference(exactTitlePlan.events, "planning block").map((event) => event.id)).toEqual(["planning-block"]);
    expect(matchTitleReference(exactTitlePlan.events, "client call").map((event) => event.id)).toEqual(["client-call"]);
    expect(matchTitleReference(exactTitlePlan.events, "call").map((event) => event.id)).toEqual(["call"]);
  });

  it("stops at contiguous phrase matches before unordered token matches in raw and alias tiers", () => {
    const seed = createInitialPlan(dateKey);
    const plan: DayPlan = { ...seed, events: [
      { id: "contiguous", title: "Deep work meeting prep", dateKey, start: 540, end: 600, kind: "flexible", priority: "medium" },
      { id: "unordered", title: "Meeting notes for deep work", dateKey, start: 600, end: 660, kind: "flexible", priority: "medium" },
    ] };
    expect(matchTitleReference(plan.events, "deep work meeting").map((event) => event.id)).toEqual(["contiguous"]);
    expect(matchTitleReference(plan.events, "deep work meeting event").map((event) => event.id)).toEqual(["contiguous"]);
    expect(matchTitleReference(plan.events, "deep meeting work").map((event) => event.id)).toEqual(["contiguous", "unordered"]);
  });

  it("moves the screenshot alias through one invariant-safe scheduling transaction", () => {
    const initial = createInitialPlan(dateKey);
    const before = structuredClone(initial);
    const result = execute(initial, "move my deep work meeting to 3:00 p.m.");
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.plan.events.find((event) => event.id === "deep-work")).toMatchObject({ start: 15 * 60, end: 16 * 60 });
    expect(result.plan.events.find((event) => event.id === "lunch")).toEqual(before.events.find((event) => event.id === "lunch"));
    expect(result.plan.events.find((event) => event.id === "interview")).toEqual(before.events.find((event) => event.id === "interview"));
    expect(result.plan.events.find((event) => event.id === "dinner")).toEqual(before.events.find((event) => event.id === "dinner"));
    expect(result.plan.events).toHaveLength(before.events.length);
    expect(new Set(result.plan.events.map((event) => event.id)).size).toBe(before.events.length);
    expect(validatePlan(result.plan)).toBeNull();
    expect(initial).toEqual(before);
  });

  it("clarifies multiple fallback cores and reports zero matches precisely", () => {
    const seed = createInitialPlan(dateKey);
    const plan: DayPlan = { ...seed, events: [
      ...seed.events.filter((event) => event.id !== "deep-work" && event.id !== "roadmap"),
      { id: "deep-a", title: "Deep work — alpha", dateKey, start: 540, end: 600, kind: "flexible", priority: "medium" },
      { id: "deep-b", title: "Deep work — beta", dateKey, start: 840, end: 900, kind: "flexible", priority: "medium" },
    ] };
    const ambiguous = execute(plan, "move deep work meeting to 3");
    expect(ambiguous.status).toBe("clarification");
    if (ambiguous.status === "clarification") {
      expect(ambiguous.clarification.type).toBe("event");
      expect(ambiguous.clarification.choices.map((choice) => choice.id)).toEqual(["deep-a", "deep-b"]);
    }
    const missing = execute(plan, "move quarterly meeting to 3");
    expect(missing).toMatchObject({ status: "conflict", title: "Event not found" });
  });

  it("uses a generic source noun only as a qualifier when an exact source time is present", () => {
    const initial = createInitialPlan(dateKey);
    const generic = resolveEventReference(initial, { type: "source", at: 9 * 60, query: "meeting" });
    expect(generic.status).toBe("resolved");
    if (generic.status === "resolved") expect(generic.events.map((event) => event.id)).toEqual(["deep-work"]);
    const descriptive = resolveEventReference(initial, { type: "source", at: 9 * 60, query: "deep work meeting" });
    expect(descriptive.status).toBe("resolved");
    if (descriptive.status === "resolved") expect(descriptive.events.map((event) => event.id)).toEqual(["deep-work"]);
  });

  it("applies title aliases consistently to protect, resize, and confirmed delete", () => {
    const initial = createInitialPlan(dateKey);
    const protectedResult = execute(initial, "protect deep work meeting");
    expect(protectedResult.status).toBe("success");
    if (protectedResult.status !== "success") return;
    const protectedDeepWork = protectedResult.plan.events.find((event) => event.id === "deep-work")!;
    expect(protectedDeepWork.kind).toBe("flexible");
    expect(eventProtected(protectedDeepWork)).toBe(true);

    const resized = execute(initial, "make deep work task 20 minutes");
    expect(resized.status).toBe("success");
    if (resized.status !== "success") return;
    expect(resized.plan.events.find((event) => event.id === "deep-work")).toMatchObject({ start: 540, end: 560 });

    const preview = execute(initial, "cancel deep work appointment");
    expect(preview.status).toBe("confirmation");
    const deleted = execute(initial, "cancel deep work appointment", undefined, true);
    expect(deleted.status).toBe("success");
    if (deleted.status === "success") expect(deleted.plan.events.some((event) => event.id === "deep-work")).toBe(false);
  });

  it("keeps alias-based compound requests atomic", () => {
    const initial = createInitialPlan(dateKey);
    const successful = execute(initial, "move deep work meeting to 3 and protect lunch");
    expect(successful.status).toBe("success");
    if (successful.status === "success") {
      expect(successful.plan.events.find((event) => event.id === "deep-work")?.start).toBe(15 * 60);
      expect(successful.plan.events.find((event) => event.id === "lunch")?.kind).toBe("protected");
      expect(validatePlan(successful.plan)).toBeNull();
    }

    const before = structuredClone(initial);
    const failed = execute(initial, "move deep work meeting to 3 and protect quarterly meeting");
    expect(failed).toMatchObject({ status: "conflict", title: "Event not found" });
    expect(initial).toEqual(before);
  });
});
