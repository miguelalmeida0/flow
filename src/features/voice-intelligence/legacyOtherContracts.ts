import frozen from "./legacyOtherContracts.json";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";
import type { AcceptanceFixtureId } from "./acceptanceFixtures";
import type { LifeRoute, TemporalScope } from "../../domain/life-model";

interface FrozenRow {
  id: string; line: number; text: string;
  before: SemanticExpectation["collections"];
  expected: {
    intent: NonNullable<LanguageCase["expected"]["intent"]>; resolution: LanguageCase["expected"]["resolution"]; route: LifeRoute;
    slots: object; actions: []; historyDelta: number; commitCount: number; noPending: boolean; noCreation: boolean;
    results?: { personIds: string[]; commitmentIds: string[] };
    contextAfter?: SemanticExpectation["contextAfter"];
    feedback: { phase: "completed"; title?: string; detail?: string };
    fullAfter: string | { temporal: { scope: TemporalScope } };
    runtimeRequests?: Array<{ event: "flow-live-command"; detail: "start" | "sleep" }>;
  };
}
interface Declaration {
  text: string; line: number; intent: LanguageCase["expected"]["intent"]; resolution: LanguageCase["expected"]["resolution"];
  route: LifeRoute; fixtureId: AcceptanceFixtureId; fixtureCollections: SemanticExpectation["collections"]; semantic: SemanticExpectation;
}

/** All identities, times, slots and result sets are frozen before execution.
 * No person is manufactured by consulting the interpreter under test. */
export const legacyOtherContracts = new Map<string, Declaration>();
for (const row of frozen.records as unknown as FrozenRow[]) {
  const expected = row.expected;
  legacyOtherContracts.set(row.id, {
    text: row.text, line: row.line, intent: expected.intent, resolution: expected.resolution, route: expected.route,
    fixtureId: "legacy-seed", fixtureCollections: row.before,
    semantic: {
      historyDelta: expected.historyDelta, commitCount: expected.commitCount, noPending: expected.noPending, noCreation: expected.noCreation,
      intent: { type: expected.intent, ...expected.slots } as SemanticExpectation["intent"], actions: expected.actions, feedbackPhase: expected.feedback.phase,
      ...(expected.feedback.title ? { feedback: { title: expected.feedback.title, detail: expected.feedback.detail } } : {}),
      ...(expected.results ? { resultEntityIds: [...expected.results.personIds, ...expected.results.commitmentIds] } : {}),
      ...(expected.contextAfter ? { contextAfter: expected.contextAfter } : {}),
      ...(typeof expected.fullAfter === "object" ? { scope: expected.fullAfter.temporal.scope } : {}),
      ...(expected.runtimeRequests ? { sessionRequests: expected.runtimeRequests.map(({ detail }) => detail) } : {}),
    },
  });
}
