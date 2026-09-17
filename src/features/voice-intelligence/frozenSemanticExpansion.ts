import type { LifeDocument } from "../../domain/life-model";
import type { SemanticExpectation } from "./semanticExpectation";

type Collection = keyof NonNullable<SemanticExpectation["collections"]>;
export interface FrozenCollectionRecipe { collection: Collection; id: string; patch: Record<string, unknown>; updatedAt?: "fixtureClock" }

/** Test declaration expansion only. Its sole state input is the immutable
 * independently named BEFORE fixture, never interpreter/planner output. */
export function expandFrozenSemantic(input: SemanticExpectation, before: LifeDocument, at: string, recipes: FrozenCollectionRecipe[] = []): SemanticExpectation {
  const entities = [before.captures, before.plans, before.steps, before.people, before.commitments, before.links, before.studio.journalEntries, before.studio.memories, before.studio.atmospherePresets, before.studio.rituals, before.studio.mediaAssets].flat();
  const expand = (value: unknown): unknown => {
    if (value === "$AT") return at;
    if (value === "$UNDEFINED") return undefined;
    if (Array.isArray(value)) return value.map(expand);
    if (!value || typeof value !== "object") return value;
    if ("$entity" in value) {
      const matches = entities.filter(({ id }) => id === value.$entity);
      if (matches.length !== 1) throw new Error(`Frozen oracle has an undeclared or ambiguous entity: ${String(value.$entity)}`);
      const patch = "patch" in value ? expand(value.patch) as Record<string, unknown> : undefined;
      return { ...structuredClone(matches[0]), ...patch, ...(patch && Object.keys(patch).length ? { updatedAt: at } : {}) };
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item)]));
  };
  const result = expand(input) as SemanticExpectation;
  for (const recipe of recipes) {
    const collection = structuredClone(result.collections?.[recipe.collection] ?? before[recipe.collection]);
    const target = collection.find(({ id }) => id === recipe.id);
    if (!target) throw new Error(`Undeclared frozen ${recipe.collection}/${recipe.id}`);
    Object.assign(target, expand(recipe.patch), ...(recipe.updatedAt ? [{ updatedAt: at }] : []));
    result.collections = { ...result.collections, [recipe.collection]: collection };
  }
  return result;
}
