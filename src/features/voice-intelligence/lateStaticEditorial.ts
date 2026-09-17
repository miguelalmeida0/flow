import representative from "./staticRepresentativeEditorialB.json";
import supplement from "./staticSupplementEditorial.json";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import { frozenCreation } from "./frozenCreationRecipes";
import type { LifeContext } from "../../domain/life-model";
import type { CalendarAction, CalendarEvent } from "../day-planner/model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";

interface Source { file: string; line: number; sha256: string }
interface Editorial { family: string; languageFeature: string }
function pending(row: { id: string; utterance: string }, fixtureId: AcceptanceFixtureId, context: LifeContext, expected: LanguageCase["expected"], semantic: SemanticExpectation, editorial: Editorial, source: Source): LanguageCase {
  return { ...row, fixtureId, context, expected, semantic, source: "editorial_product", family: editorial.family,
    editorial: { origin: "product-editorial-review", languageFeature: editorial.languageFeature, reviewScope: `${context.route}:${expected.intent}` },
    provenance: { authoringMethod: "repository-test-extraction", baseCaseId: row.id, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", sourceLocation: source, reviewNote: "Root reviewed independent complete BEFORE recipes. Pending execution/editorial admission; not native or physical evidence." } };
}

interface CalendarRow {
  id: string; utterance: string; source: { key: keyof typeof representative.sourceFiles; line: number }; family: string; feature: string;
  calendarActions: CalendarAction[]; semantic?: Partial<SemanticExpectation>; newEvent?: Pick<CalendarEvent, "id" | "title" | "dateKey" | "start" | "end">;
  eventChanges?: SemanticExpectation["eventChanges"]; datedEventChanges?: SemanticExpectation["datedEventChanges"];
  noCreation: boolean; pendingRequestConfirmed?: string;
}
export const pendingRichCalendarCases = (representative.cases as unknown as CalendarRow[]).map((row) => {
  const request = { actions: row.calendarActions, constraints: [] };
  const semantic: SemanticExpectation = { historyDelta: 1, feedbackPhase: "completed", intent: { type: "calendar", request }, actions: [{ type: "calendar.request", request }], calendarActionTypes: row.calendarActions.map(({ type }) => type), noCreation: row.noCreation, eventChanges: row.eventChanges, datedEventChanges: row.datedEventChanges, ...row.semantic,
    ...(row.newEvent ? { calendarInsertions: [{ ...representative.caseDefaults.newEventDefaults, ...row.newEvent } as CalendarEvent] } : {}),
    ...(row.pendingRequestConfirmed ? { pendingActions: [{ type: "calendar.request", request, confirmed: row.pendingRequestConfirmed }] } : { noPending: true }) };
  return pending(row, "calendar-representative", acceptanceFixture("calendar-representative").context, { intent: "calendar", resolution: "execute", route: "calendar" }, semantic, { family: row.family, languageFeature: row.feature }, { ...representative.sourceFiles[row.source.key], line: row.source.line });
});

interface SupplementRow {
  id: string; utterance: string; fixtureId?: AcceptanceFixtureId; contextOverrides?: Partial<LifeContext>;
  expected?: Partial<LanguageCase["expected"]>; semantic?: Partial<SemanticExpectation>; editorial: Editorial;
  sourceOccurrences: { sourceFile: string; sourceLine: number }[];
  viewportContract?: { direction: "up" | "down" | "top" | "bottom"; fraction: number };
  oracleRecipe?: "capture"; captureId?: string; intentTitle?: string; displayTitle?: string;
}
export const pendingSupplementCases = (supplement.cases as unknown as SupplementRow[]).map((row) => {
  const fixtureId = row.fixtureId ?? "empty-home";
  const fixture = acceptanceFixture(fixtureId), context = { ...fixture.context, ...row.contextOverrides };
  const creation = row.oracleRecipe ? frozenCreation({ oracleRecipe: "capture", utterance: row.utterance, newId: row.captureId!, intentTitle: row.intentTitle, storedTitle: row.displayTitle }, fixture.snapshot.document, new Date(context.nowMs!).toISOString()) : undefined;
  const expected: LanguageCase["expected"] = creation?.expected ?? { resolution: "execute", route: "home", ...row.expected };
  const semantic: SemanticExpectation = creation?.semantic ?? { historyDelta: 0, feedbackPhase: "completed", noPending: true, noCreation: true, actions: [], ...row.semantic };
  if (row.viewportContract) {
    // Independently specified common viewport; the production scroll sink is
    // exercised against this DOM geometry, not mocked as successful.
    const { direction, fraction } = row.viewportContract;
    semantic.viewport = { height: 720, scrollHeight: 2400, beforeTop: 400, afterTop: direction === "top" ? 0 : direction === "bottom" ? 1680 : 400 + 720 * fraction * (direction === "up" ? -1 : 1) };
  }
  const occurrence = row.sourceOccurrences[0]!;
  const source = Object.values(supplement.sourceFiles).find(({ file }) => file === occurrence.sourceFile);
  if (!source) throw new Error(`Missing immutable source for ${row.id}`);
  // Remove archive's numeric bookkeeping prefix, never invent a feature per ID.
  const editorial = { ...row.editorial, languageFeature: row.editorial.languageFeature.replace(/^\d+-/, "") };
  return pending(row, fixtureId, context, expected, semantic, editorial, { ...source, line: occurrence.sourceLine });
});
