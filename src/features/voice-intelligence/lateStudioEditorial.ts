import batch from "./staticStudioEditorial.json";
import { acceptanceFixture, type AcceptanceFixtureId } from "./acceptanceFixtures";
import type { LifeDocument } from "../../domain/life-model";
import type { LanguageCase } from "./languageDatabase";
import type { SemanticExpectation } from "./semanticExpectation";

interface Row {
  id: string; utterance: string; sourceLine: number; fixtureId: AcceptanceFixtureId;
  expected: LanguageCase["expected"]; intent: SemanticExpectation["intent"]; actions: unknown[]; semantic?: Partial<SemanticExpectation>;
  newPreset?: unknown; documentPatch?: Record<string, unknown>; layerChanges?: SemanticExpectation["layerChanges"];
  collectionAppend?: { collection: string; record: unknown }; collectionPatch?: { collection: string; id: string; patch: Record<string, unknown>; unset?: string[] }[];
  noCreation: boolean; runtimeCommands?: SemanticExpectation["runtimeCommands"]; editorial: { family: string; languageFeature: string };
}

/** This test-only recipe expansion reads declared BEFORE + frozen literals.
 * Only explicit paths are replaced; it never reads the transaction result. */
function semanticFor(row: Row, before: LifeDocument, at: string): SemanticExpectation {
  const constants: Record<string, unknown> = { ...batch.declarations, AT: at, AT_SLUG: at.toLowerCase().replace(/[^a-z0-9]+/g, "-"), ROW_NEW_PRESET: row.newPreset };
  const expand = (value: unknown): unknown => {
    if (value === "$UNDEFINED") return undefined;
    if (typeof value === "string") {
      if (value.startsWith("$") && value.slice(1) in constants) return expand(constants[value.slice(1)]);
      return value.replaceAll("$AT_SLUG", String(constants.AT_SLUG));
    }
    if (Array.isArray(value)) return value.map(expand);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
    return value;
  };
  const declared = structuredClone(before);
  const atPath = (path: string) => {
    const keys = path.split("."), key = keys.pop()!;
    if (keys[0] !== "studio" || keys.some((part) => ["__proto__", "constructor", "prototype"].includes(part))) throw new Error(`Invalid Studio recipe path ${path}`);
    let parent = declared as unknown as Record<string, unknown>;
    for (const part of keys) { if (!parent[part] || typeof parent[part] !== "object") throw new Error(`Undeclared parent ${path}`); parent = parent[part] as Record<string, unknown>; }
    return { parent, key };
  };
  for (const [path, value] of Object.entries(row.documentPatch ?? {})) { const { parent, key } = atPath(path); parent[key] = expand(value); }
  for (const patch of row.collectionPatch ?? []) {
    // Root's pre-execution supersession: save-identical is H0, not a touch.
    if (row.id === "repository-draft-0275") continue;
    const { parent, key } = atPath(patch.collection);
    const target = (parent[key] as { id: string }[]).find(({ id }) => id === patch.id);
    if (!target) throw new Error(`Undeclared collection target ${patch.id}`);
    Object.assign(target, expand(patch.patch));
    for (const field of patch.unset ?? []) delete (target as Record<string, unknown>)[field];
  }
  if (row.collectionAppend) { const { parent, key } = atPath(row.collectionAppend.collection); (parent[key] as unknown[]).push(expand(row.collectionAppend.record)); }
  const { workspace, activeAtmosphere, journalEntries, memories, mediaAssets, atmospherePresets, rituals } = declared.studio;
  return { historyDelta: 1, feedbackPhase: "completed", noPending: true, ...row.semantic, ...(row.id === "repository-draft-0275" ? { historyDelta: 0 } : {}), intent: row.intent, actions: expand(row.actions) as SemanticExpectation["actions"], runtimeCommands: row.runtimeCommands, noCreation: row.noCreation,
    studioCollections: { journalEntries, memories, mediaAssets, atmospherePresets, rituals }, studioState: { workspace, activeAtmosphere }, layerChanges: row.layerChanges };
}

export const pendingLateStudioCases: LanguageCase[] = (batch.cases as unknown as Row[]).map((row) => {
  const fixture = acceptanceFixture(row.fixtureId), context = fixture.context;
  return { id: row.id, utterance: row.utterance, fixtureId: row.fixtureId, context, expected: { ...row.expected, resolution: "execute" }, semantic: semanticFor(row, fixture.snapshot.document, new Date(context.nowMs!).toISOString()), source: "editorial_product", family: row.editorial.family,
    editorial: { origin: "product-editorial-review", languageFeature: row.editorial.languageFeature, reviewScope: `${context.route}:${row.expected.intent}` },
    provenance: { authoringMethod: "repository-test-extraction", baseCaseId: row.id, transformations: [], reviewStatus: "pending", contractVersion: "2026-09-08", sourceLocation: { ...batch.source, line: row.sourceLine }, reviewNote: "FROZEN-I-J-STUDIO-SECOND-REVIEW.md; later root no-op supersession for0275 preserves timestamp. Metadata playback requests are not native media evidence. Pending admission." } };
});
