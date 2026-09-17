/** Exact authored names outrank partial matches. Ambiguity remains visible;
 * this returns candidates and never picks a first fuzzy result. */
export function namedEntities<T extends { title: string }>(entities: readonly T[], query: string): T[] {
  const normalized = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
  const key = normalized(query);
  const exact = entities.filter(({ title }) => normalized(title) === key);
  return exact.length ? exact : entities.filter(({ title }) => normalized(title).includes(key));
}
