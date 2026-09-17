import { genericSurfaceNouns, navigationDestinations } from "./navigationLexicon";

function surface(value: string) {
  return value.replace(/^(?:(?:my|the|our)\s+)+/, "").replace(new RegExp(`\\s+(?:${genericSurfaceNouns.join("|")})$`), "").trim();
}
function knownSurface(value: string) {
  const name = surface(value);
  return navigationDestinations.some(({ aliases }) => aliases.some((alias) => surface(alias) === name));
}
function calendarView(value: string) {
  const text = value.replace(/^the\s+/, "");
  const week = text.match(/^(this|current|next) week(?:'s calendar)?$/);
  if (week) return `calendar ${week[1] === "current" ? "this" : week[1]} week`;
  const appointments = text.match(/^(today|tomorrow)'s (?:appointments|calendar|schedule)$/);
  return appointments ? `calendar ${appointments[1]}` : undefined;
}
function destination(value: string) { return surface(value) === "captures" ? "capture" : calendarView(value) ?? (knownSurface(value) ? value : undefined); }

/** Full navigation-only frames. The remainder must be a bounded destination,
 * not an inner command extracted from prose. Preservation clauses are valid
 * here because navigation never changes the preserved business document. */
export function navigationRoleFrame(normalized: string): string | undefined {
  const leave = normalized.match(/^(?:leave the schedule untouched and|keep every appointment,\s*just)\s+(?:show(?: me)?|open)\s+(.+)$/);
  const view = normalized.match(/^let me view\s+(.+?)\s+without rebuilding my day$/);
  const only = normalized.match(/^(?:take me to|show(?: me)?)\s+(.+?)\s+and nothing else$/);
  const keepJournal = normalized.match(/^(?:show|open)\s+(.+?)\s+while leaving (?:this|the) journal entry open$/);
  const noCreation = normalized.match(/^i want\s+(.+?),\s*not (?:a new (?:calendar item|entry|memory|outcome)|a blank entry)$/)
    ?? normalized.match(/^it's\s+(.+?)\s+i want,\s*not (?:a blank entry|a new (?:entry|memory|outcome))$/);
  const simple = leave ?? view ?? only ?? keepJournal ?? noCreation;
  if (simple) { const target = destination(simple[1]!); return target ? `open ${target}` : undefined; }
  const transition = normalized.match(/^take me out of\s+(.+?)\s+and back to\s+(.+)$/)
    ?? normalized.match(/^switch from\s+(.+?)\s+to\s+(.+?)(?:;\s*do not add (?:a|an) (?:plan|outcome|entry|memory|calendar item))?$/);
  if (transition && knownSurface(transition[1]!)) {
    const target = destination(transition[2]!); return target ? `open ${target}` : undefined;
  }
  return undefined;
}
