import type { LanguageCase } from "./languageDatabase";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import type { SemanticExpectation } from "./semanticExpectation";
import type { CalendarAction } from "../day-planner/model";
import { initialEditorialReview } from "./initialEditorialReview";

/** Static assisted-editorial proposals from the separate language audit.
 * These rows are NOT admitted to the curated quota yet. Expectations were
 * frozen before execution; no expected value comes from parser output. */
function proposed(id: number, utterance: string, fixtureId: AcceptanceFixtureId, expected: LanguageCase["expected"], semantic: SemanticExpectation): LanguageCase {
  const context = acceptanceFixture(fixtureId).context;
  const review = initialEditorialReview.find((group) => group.ids.includes(id));
  if (!review) throw new Error(`Missing independent editorial metadata: ${id}`);
  return {
    id: `voice-rebuild-editorial-${String(id).padStart(3, "0")}`, utterance, fixtureId,
    context, expected: { route: context.route, ...expected }, semantic: { feedbackPhase: expected.resolution === "clarify" ? "clarification" : expected.resolution === "unsupported" ? "error" : "completed", ...semantic },
    source: "editorial_product", family: review.family,
    editorial: { origin: "product-editorial-review", languageFeature: review.languageFeature, reviewScope: `${context.route}:${expected.intent}` },
    provenance: { authoringMethod: "assisted-editorial", baseCaseId: `language-audit-proposal-${String(id).padStart(3, "0")}`, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", reviewNote: review.reviewNote },
  };
}

const renameRows: [number, string, string][] = [
  [1, "Rename it Fish and Chips — Mum's Birthday", "Fish and Chips — Mum's Birthday"],
  [3, "Change its title to Yes please", "Yes please"],
  [4, "Make the title Red Team Review", "Red Team Review"],
  [5, "The Shareholders meeting should be called Miguel and Sarah planning", "Miguel and Sarah planning"],
  [6, "Edit the eleven thirty meeting name and change it to dog walking", "dog walking"],
  [7, "Name this meeting Fucking finally", "Fucking finally"],
  [8, "Rename Shareholders as Q4 / Design + Research", "Q4 / Design + Research"],
  [9, "Call this one Buy milk for mum", "Buy milk for mum"],
  [10, "I want the eleven thirty meeting called Review with Zoë", "Review with Zoë"],
  [11, "Shareholders is now Investor Call", "Investor Call"],
  [12, "Make it say We can do this", "We can do this"],
  [13, 'Rename it "No, Actually Fine"', "No, Actually Fine"],
  [14, "Change the event name to Stop and Think", "Stop and Think"],
  [15, "Rename it Dog Walking — no, Make Believe", "Make Believe"],
  [16, "Call it Morning Walk — sorry, Evening Walk", "Evening Walk"],
  [24, "Rename it Buy milk and call mum", "Buy milk and call mum"],
  [25, 'Call it "Review and move it to three"', "Review and move it to three"],
  [26, 'Change its title to "Hello."', "Hello."],
  [27, "Rename it Sorry About Yesterday", "Sorry About Yesterday"],
  [28, "Make the name Important things", "Important things"],
  [29, "Change Shareholders to Dog Walking", "Dog Walking"],
  [30, "Edit the meeting at eleven thirty and call it Kitchen Table", "Kitchen Table"],
  [33, 'Rename it "Delete this meeting"', "Delete this meeting"],
  [37, "Change its title to Rain, wind and a little hope", "Rain, wind and a little hope"],
  [38, "Set the name to Café with Ana", "Café with Ana"],
  [39, "Call this Deep Work — portfolio", "Deep Work — portfolio"],
];

const calendarEdit = (id: number, utterance: string, eventChanges: NonNullable<SemanticExpectation["eventChanges"]>, actionTypes: CalendarAction["type"][]) => proposed(id, utterance, "calendar-reference", { intent: "calendar", resolution: "execute" }, {
  historyDelta: 1, noCreation: true, eventChanges,
  intent: { type: "calendar" }, calendarActionTypes: actionTypes,
  actions: [{ type: "calendar.request", selectedId: "E1" }],
});

export const proposedVoiceRebuildCases: LanguageCase[] = [
  ...renameRows.map(([id, utterance, title]) => calendarEdit(id, utterance, [{ id: "E1", patch: { title } }], ["update"])),
  calendarEdit(17, "Make this green — wait, blue", [{ id: "E1", patch: { color: "blue" } }], ["update"]),
  calendarEdit(18, "Move it to three — actually four", [{ id: "E1", patch: { start: 960, end: 990 } }], ["move"]),
  calendarEdit(21, 'Rename it "Fish and Chips" and move it to three — actually four', [{ id: "E1", patch: { title: "Fish and Chips", start: 960, end: 990 } }], ["update", "move"]),
  calendarEdit(22, "Move Shareholders to three and rename it Investor Preparation", [{ id: "E1", patch: { title: "Investor Preparation", start: 900, end: 930 } }], ["move", "update"]),
  calendarEdit(23, 'Rename Shareholders to "Dog Walking" and rename Deep Work to "Portfolio Review"', [{ id: "E1", patch: { title: "Dog Walking" } }, { id: "E2", patch: { title: "Portfolio Review" } }], ["update", "update"]),
  calendarEdit(34, "Put it at three, actually four", [{ id: "E1", patch: { start: 960, end: 990 } }], ["move"]),
  calendarEdit(35, "Make it thirty minutes — no, one hour", [{ id: "E1", patch: { end: 750 } }], ["resize"]),
  calendarEdit(36, "Rename it Dog Walking then make it green", [{ id: "E1", patch: { title: "Dog Walking", color: "green" } }], ["update", "update"]),
  calendarEdit(40, "Rename Shareholders to Investor Call and move that meeting after Deep Work", [{ id: "E1", patch: { title: "Investor Call", start: 900, end: 930 } }], ["update", "move"]),
  proposed(19, "Open calendar — sorry, journal", "empty-home", { intent: "navigate", resolution: "execute", route: "journal" }, { historyDelta: 0, noCreation: true, intent: { type: "navigate", route: "journal" }, actions: [] }),
  proposed(20, "Tomorrow — actually Friday", "empty-home", { intent: "temporal", resolution: "execute" }, { historyDelta: 0, noCreation: true, scope: { kind: "day", dateKey: "2026-09-11" }, intent: { type: "temporal", scope: { kind: "day", dateKey: "2026-09-11" } }, actions: [] }),
  proposed(31, "Rename the meeting to", "calendar-reference", { intent: "clarification", resolution: "clarify" }, { historyDelta: 0, noCreation: true, actions: [] }),
  proposed(32, "Change its title to Dog Walking", "empty-home", { intent: "clarification", resolution: "clarify" }, { historyDelta: 0, noCreation: true, actions: [] }),
  ...[
    [81, "I need to renew my passport before Senegal"],
    [82, "My goal is a quieter month"],
    [83, "Help me prepare to move house"],
    [84, "I was thinking about opening a journal someday"],
    [86, "Don't make an outcome from that"],
    [87, "We talked about deleting the appointment"],
    [88, "If I say go home, don't write it down"],
  ].map(([id, utterance]) => proposed(id as number, utterance as string, "empty-home", { intent: "unsupported", resolution: "unsupported" }, { historyDelta: 0, noCreation: true, actions: [] })),
];
