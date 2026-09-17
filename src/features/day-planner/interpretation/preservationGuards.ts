import type { CalendarConstraint, CalendarPreservedField } from "../model";
import { parseDurationExpression } from "./temporal";

const properties: Record<string, CalendarPreservedField[]> = {
  title: ["title"], name: ["title"], start: ["start"], length: ["duration"], duration: ["duration"],
  time: ["start", "end", "dateKey"], scheduling: ["start", "end", "dateKey"], schedule: ["start", "end", "dateKey"],
};

/** These clauses constrain the draft; they never become a fuzzy event title,
 * a permanent protection update, or permission to drop an unknown suffix. */
export function parsePreservationGuard(clause: string): CalendarConstraint | null {
  const quantified = clause.match(/^(?:keep|leave) the (.+?)[ -](minutes?|hours?) (?:length|duration) (?:alone|unchanged)$/);
  if (quantified) {
    const minutes = parseDurationExpression(`${quantified[1]} ${quantified[2]}`);
    if (minutes) return { type: "preserve", selector: { type: "anaphor" }, fields: ["duration"], expectedDurationMinutes: minutes };
  }
  const match = clause.match(/^(?:keep|leave) (?:its|the) (title|name|start|length|duration|time|scheduling|schedule) (?:unchanged|alone|where it is|as it is)$/)
    ?? clause.match(/^keep its (title|name|start|length|duration|time)$/)
    ?? clause.match(/^the (name|title) is fine$/);
  if (match) return { type: "preserve", selector: /^(?:keep|leave) the (?:scheduling|schedule) /.test(clause) ? { type: "all" } : { type: "anaphor" }, fields: [...properties[match[1]!]!] };
  if (/^(?:without moving its time|do not reschedule it)$/.test(clause)) return { type: "preserve", selector: { type: "anaphor" }, fields: [...properties.time!] };
  return null;
}
