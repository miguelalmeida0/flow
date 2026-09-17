import type { LanguageCase } from "./languageDatabase";

/** New editorial records use the rich schema directly. The historical flat
 * seed migration must never erase their fixture, oracle or review provenance. */
export function reviewedLanguageAdmission(records: readonly LanguageCase[]): LanguageCase[] {
  return records.filter(({ provenance }) => provenance?.reviewStatus === "admitted").map((row) => {
    if (!row.fixtureId || !row.semantic || !row.provenance?.baseCaseId || !row.editorial
      || row.expected.resolution === "execute" && !row.semantic.feedbackPhase
      || /^(?:navigate|temporal)/.test(row.expected.intent ?? "") && !row.expected.route) {
      throw new Error(`Incomplete independent editorial admission: ${row.id}`);
    }
    return structuredClone(row);
  });
}
