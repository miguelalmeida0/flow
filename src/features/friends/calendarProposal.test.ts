import { describe, expect, it } from "vitest";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import { bookingRequest, proposeCalendarMessage, refineCalendarProposal } from "./calendarProposal";
import { canonicalPerson } from "./people";
import { bindCalendarParticipants } from "./calendarParticipants";
import { interpretTranscript } from "../day-planner/parser";
import { resolveEventReference } from "../day-planner/scheduling/resolution";
import { applyLifeTransaction } from "../../domain/life-transaction";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";

const now = () => new Date("2026-09-12T10:00:00Z");
const john = canonicalPerson({ id: "john", kind: "person", name: "John", createdAt: now().toISOString(), updatedAt: now().toISOString() });
function fixture() { const document = createFreshLifeSnapshot("2026-09-12").document; document.people = [john]; return document; }
describe("shared Calendar and person proposals", () => {
  it("proposes an affirmative booking, while negatives and quoted message controls have no calendar authority", () => {
    expect(bookingRequest("I booked a meeting Thursday at ten", john, "2026-09-12")?.actions[0]).toMatchObject({ type: "create", participantIds: ["john"], destination: { type: "absolute", minutes: 600, date: { dateKey: "2026-09-17" } } });
    for (const body of ["I have not booked a meeting Thursday at ten", "I can come, actually cancel lunch", 'He said "I booked a meeting Thursday at ten"']) expect(bookingRequest(body, john, "2026-09-12")).toBeUndefined();
  });
  it("asks about an occupied exact time without shifting a blocker and refines to Friday", () => {
    const document = fixture(); document.calendars["2026-09-17"] = { dateKey: "2026-09-17", events: [{ id: "fixed", title: "Dentist", dateKey: "2026-09-17", start: 600, end: 660, kind: "fixed", priority: "high" }], deferred: [] };
    const before = structuredClone(document);
    const request = bookingRequest("I booked a meeting Thursday at ten", john, "2026-09-12")!;
    const proposal = proposeCalendarMessage(document, request, "2026-09-12", now);
    expect(proposal.question).toContain("Dentist"); expect(proposal.choices.length).toBeLessThanOrEqual(3); expect(document).toEqual(before);
    const next = refineCalendarProposal(proposal, "Friday", "2026-09-12")!;
    const revised = proposeCalendarMessage(document, next, "2026-09-12", now);
    expect(revised.question).toBeUndefined(); expect(revised.event).toMatchObject({ dateKey: "2026-09-18", start: 600, participantIds: ["john"] });
  });
  it("keeps participant identity conjunctive with clock and title", () => {
    const plan = { dateKey: "2026-09-17", deferred: [], events: [{ id: "john-one", title: "Review", dateKey: "2026-09-17", start: 600, end: 660, kind: "flexible" as const, priority: "medium" as const, participantIds: ["john"] }, { id: "other", title: "Review", dateKey: "2026-09-17", start: 720, end: 780, kind: "flexible" as const, priority: "medium" as const, participantIds: ["sarah"] }] };
    expect(resolveEventReference(plan, { type: "source", at: 720, query: "Review", participantIds: ["john"] }).status).toBe("missing");
    expect(resolveEventReference(plan, { type: "title", query: "Review", participantIds: ["john"] })).toMatchObject({ status: "resolved", events: [{ id: "john-one" }] });
  });
  it("binds a known participant before the global Calendar candidate is grounded", () => {
    const plan = { dateKey: "2026-09-17", deferred: [], events: [{ id: "john-review", title: "Review", dateKey: "2026-09-17", start: 600, end: 660, kind: "flexible" as const, priority: "medium" as const, participantIds: ["john"] }] };
    const intent = resolveGlobalCommand("Move my meeting with John to Friday at ten", { route: "today" }, "2026-09-17", [], 1020, plan, [john]).intent;
    expect(intent.type).toBe("calendar");
    if (intent.type === "calendar") expect(intent.request.actions[0]).toMatchObject({ type: "move", selector: { participantIds: ["john"] } });
  });
  it("creates participant metadata through the existing transaction without changing another day", () => {
    const document = fixture(); const before = structuredClone(document.calendar);
    const parsed = interpretTranscript("Schedule coffee with John Thursday at ten", "2026-09-12");
    expect(parsed.status).toBe("ready"); if (parsed.status !== "ready") return;
    const bound = bindCalendarParticipants(parsed.request, document.people); expect("request" in bound).toBe(true); if (!("request" in bound)) return;
    const result = applyLifeTransaction(document, [{ type: "calendar.request", request: bound.request }], now);
    expect(result.status).toBe("success"); if (result.status !== "success") return;
    expect(result.document.calendar).toEqual(before); expect(result.document.calendars["2026-09-17"]?.events[0]?.participantIds).toEqual(["john"]);
  });
});
