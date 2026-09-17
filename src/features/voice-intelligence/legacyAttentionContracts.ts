import frozen from "./legacyAttentionContracts.json";
import { acceptanceFixture } from "./acceptanceFixtures";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";
import type { LifeDocument, LifeRoute } from "../../domain/life-model";

interface Row {
  id: string; line: number; text: string; before: SemanticExpectation["collections"];
  ambient?: { fullAfter: { replace: { "instinctState.lastShownAt": Record<string, string> } }; revisionDelta: number };
  expected: {
    intent: NonNullable<LanguageCase["expected"]["intent"]>; resolution: LanguageCase["expected"]["resolution"]; route: LifeRoute;
    slots: object; actions: SemanticExpectation["actions"]; historyDelta: number; commitCount: number; noPending: boolean; noCreation: boolean;
    results?: object; feedbackPhase: "completed"; pendingActions?: SemanticExpectation["pendingActions"];
    nowWindow?: SemanticExpectation["queryWindow"];
    contextAfter?: Omit<NonNullable<SemanticExpectation["contextAfter"]>, "pendingIntent"> & { pendingIntent?: "absent" };
    fullAfter: string | { replace: { focus?: LifeDocument["focus"]; "instinctState.dismissedUntil"?: Record<string, string>; "instinctState.actedOnAt"?: Record<string, string> } };
  };
}
const before = acceptanceFixture("legacy-seed").snapshot.document;
export const legacyAttentionContracts = new Map<string, {
  text: string; line: number; intent: LanguageCase["expected"]["intent"]; resolution: LanguageCase["expected"]["resolution"]; route: LifeRoute;
  fixtureCollections: SemanticExpectation["collections"]; semantic: SemanticExpectation;
}>();
for (const row of frozen.records as unknown as Row[]) {
  const expected = row.expected, replace = typeof expected.fullAfter === "object" ? expected.fullAfter.replace : {};
  const ambient = row.ambient ? { ...structuredClone(before.instinctState), lastShownAt: row.ambient.fullAfter.replace["instinctState.lastShownAt"] } : undefined;
  const instinctState = ambient ? { ...ambient,
    ...(replace["instinctState.dismissedUntil"] ? { dismissedUntil: replace["instinctState.dismissedUntil"] } : {}),
    ...(replace["instinctState.actedOnAt"] ? { actedOnAt: replace["instinctState.actedOnAt"] } : {}),
  } : undefined;
  const { pendingIntent, ...contextAfter } = expected.contextAfter ?? {};
  legacyAttentionContracts.set(row.id, { text: row.text, line: row.line, intent: expected.intent, resolution: expected.resolution,
    route: expected.route, fixtureCollections: row.before,
    semantic: {
      historyDelta: expected.historyDelta, commitCount: expected.commitCount, noPending: expected.noPending, noCreation: expected.noCreation,
      intent: { type: expected.intent, ...expected.slots } as SemanticExpectation["intent"], actions: expected.actions, feedbackPhase: expected.feedbackPhase,
      ...(!expected.intent.startsWith("focus-request") && expected.results ? { queryResult: expected.results } : {}),
      ...(expected.nowWindow ? { queryWindow: expected.nowWindow } : {}),
      ...(contextAfter ? { contextAfter } : {}),
      ...(pendingIntent === "absent" ? { absentContextFields: ["pendingIntent"] } : {}),
      ...(expected.pendingActions ? { pendingActions: expected.pendingActions } : {}),
      ...(ambient ? { ambientExposure: ambient } : {}),
      documentState: { ...(instinctState ? { instinctState } : {}), ...(replace.focus ? { focus: replace.focus } : {}) },
    },
  });
}
