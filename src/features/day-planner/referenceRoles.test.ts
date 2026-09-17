import { expect, it } from "vitest";
import { interpretTranscript } from "./interpretation/interpreter";
import { resolveEventReference } from "./scheduling/resolution";
import { acceptanceFixture } from "../voice-intelligence/acceptanceFixtures";

it.each(["session", "over"])("resolves an exact title ending in %s before a grammatical boundary fallback", (suffix) => {
  const plan = acceptanceFixture("calendar-reference").snapshot.document.calendar;
  plan.events[0]!.title = "Planning"; plan.events[1]!.title = `Planning ${suffix}`;
  const request = interpretTranscript(`Move Planning ${suffix} to four`, plan.dateKey);
  expect(request.status).toBe("ready");
  if (request.status !== "ready") return;
  const action = request.request.actions[0]!;
  expect(action.type).toBe("move");
  if (!("selector" in action)) return;
  expect(resolveEventReference(plan, action.selector)).toMatchObject({ status: "resolved", events: [{ id: "E2" }] });
});

it.each(["session", "over"])("uses the bounded %s fallback only when the full title is absent", (suffix) => {
  const plan = acceptanceFixture("calendar-near").snapshot.document.calendar;
  plan.events[0]!.title = "Planning";
  const request = interpretTranscript(`Move Planning ${suffix} to four`, plan.dateKey);
  expect(request.status).toBe("ready");
  if (request.status !== "ready") return;
  const action = request.request.actions[0]!;
  if (!("selector" in action)) throw new Error("Expected target-bearing move");
  expect(resolveEventReference(plan, action.selector)).toMatchObject({ status: "resolved", events: [{ id: "E1" }] });
});

it.each(["session", "over"])("clarifies competing %s fallback matches instead of selecting one", (suffix) => {
  const plan = acceptanceFixture("calendar-reference").snapshot.document.calendar;
  plan.events[0]!.title = "Planning north"; plan.events[1]!.title = "Planning south";
  const request = interpretTranscript(`Move Planning ${suffix} to four`, plan.dateKey);
  if (request.status !== "ready") throw new Error("Expected parsed move");
  const action = request.request.actions[0]!;
  if (!("selector" in action)) throw new Error("Expected target-bearing move");
  expect(resolveEventReference(plan, action.selector)).toMatchObject({ status: "clarification", choices: [{ id: "E1" }, { id: "E2" }] });
});
