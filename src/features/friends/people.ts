import type { Person } from "../../domain/life-model";

export const personLabel = (person: Person) => person.displayName?.trim() || person.name;
export const personKey = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
export function personInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}
/** Exact labels and aliases take precedence; a first name may produce multiple choices. No fuzzy identity mutation. */
export function resolvePeople(people: readonly Person[], query: string): Person[] {
  const key = personKey(query.replace(/^the\s+/i, ""));
  const active = people.filter((person) => !person.archived);
  const exact = active.filter((person) => [person.name, personLabel(person), ...(person.aliases ?? [])].some((value) => personKey(value) === key));
  if (exact.length && key.includes(" ")) return exact;
  return active.filter((person) => exact.some(({ id }) => id === person.id) || personKey(personLabel(person).split(/\s+/)[0] ?? "") === key);
}
export function canonicalPerson(person: Person): Person {
  return { ...person, displayName: person.displayName?.trim() || person.name, aliases: [...new Set((person.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))], avatar: person.avatar ?? { initials: personInitials(person.name), tone: "tide" }, preferredChannel: person.preferredChannel ?? "flow-local" };
}
