import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { dateKeyAfter, parseDateExpression } from "../day-planner/interpretation/temporal";

const person = "([\\p{L}][\\p{L}'’-]*)";
const date = "((?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|tomorrow)";
function day(value: string, today: string) {
  const target = parseDateExpression(value.toLowerCase(), today);
  return target === "tomorrow" ? dateKeyAfter(today, 1) : target === "today" ? today : target?.dateKey;
}

export function commitmentQueryRoleFrame(source: string): Extract<GlobalIntent, { type: "people-query" }> | null {
  const text = normalizeTranscript(source).replace(/[.!?]$/, "");
  const query = text.match(new RegExp(`^which things am i waiting to receive from ${person}$`, "u"));
  return query ? { type: "people-query", mode: "waiting", person: query[1]! } : null;
}

/** An explicit outer edit/query supplies authority. Reported phrases alone
 * are not extracted as promises, and a future request to confirm is a preview. */
export function commitmentRoleFrame(source: string, today: string): GlobalIntent | null {
  const raw = source.trim().replace(/[.!?]$/, ""), text = normalizeTranscript(raw);
  // Actor, delivery verb and raw object are separate roles. In particular,
  // “send Miguel …” must not turn the verb into a person's name.
  const owed = raw.match(new RegExp(`^${person} owes me ([\\s\\S]+?)(?: (?:by|on) ${date})?$`, "iu"));
  const delivery = raw.match(new RegExp(`^add (?:a )?(?:promise|commitment) to (send|give|deliver|return) ${person} ((?:the|a|an|my|our|your|their|his|her) [\\s\\S]+?)(?: (?:by|on) ${date})?$`, "iu"));
  const possessive = raw.match(new RegExp(`^add (?:a )?(?:promise|commitment) to (return|deliver|bring) ${person}['’]s ([\\s\\S]+?)(?: (?:by|on) ${date})?$`, "iu"));
  if (owed || delivery || possessive) {
    const record = owed ?? delivery ?? possessive!;
    const recipient = owed ? record[1]! : record[2]!;
    const object = owed ? record[2]!.replace(/^the\s+/i, "") : `${record[1]} ${record[3]}`;
    const due = owed ? record[3] : record[4], dueDate = due ? day(due, today) : undefined;
    return { type: "commitment-create", person: recipient, title: object.replace(/^./, (letter) => letter.toUpperCase()), direction: owed ? "waiting-on" : "i-owe", status: "open", ...(dueDate ? { dueAt: `${dueDate}T17:00:00.000Z` } : {}) };
  }
  const reference = text.match(new RegExp(`^${person}'s (.+?) is still open; defer it until ${date}$`, "u"));
  if (reference) {
    const dateKey = day(reference[3]!, today);
    if (dateKey) return { type: "commitment-defer", person: reference[1]!, query: reference[2]!, dateKey, requiredStatus: "open" };
  }
  const complete = text.match(new RegExp(`^the (?:.+?) (?:is|are) back with ${person}; mark (.+?) (?:done|complete)$`, "u"));
  if (complete) return { type: "commitment-complete", person: complete[1]!, query: complete[2]! };
  const due = text.match(new RegExp(`^give (?:the )?(.+?) promise until ${date}; leave its preparation time alone$`));
  if (due) {
    const dateKey = day(due[2]!, today);
    if (dateKey) return { type: "commitment-due", query: due[1]!, dueAt: `${dateKey}T17:00:00.000Z` };
  }
  const defer = raw.match(new RegExp(`^set aside ${person}'s (.+?) until ${date} because ([\\s\\S]+)$`, "iu"));
  if (defer) {
    const dateKey = day(defer[3]!, today);
    if (dateKey) return { type: "commitment-defer", person: defer[1]!, query: defer[2]!, dateKey, reason: defer[4]! };
  }
  const preview = text.match(new RegExp(`^before deleting ${person}'s (.+?) promise, let me confirm that exact one$`, "u"));
  if (preview) return { type: "commitment-delete", person: preview[1]!, query: preview[2]! };
  const excludedComplete = text.match(new RegExp(`^mark (.+?) from ${person} complete, not ${person}'s (.+)$`, "u"));
  if (excludedComplete) return { type: "commitment-complete", query: excludedComplete[1]!, person: excludedComplete[2]!, excluded: { person: excludedComplete[3]!, query: excludedComplete[4]! } };
  const excludedDue = text.match(new RegExp(`^the (.+?) deadline needs to be ${date}, with no change to (.+)$`));
  if (excludedDue) {
    const dateKey = day(excludedDue[2]!, today);
    if (dateKey) return { type: "commitment-due", query: excludedDue[1]!, dueAt: `${dateKey}T17:00:00.000Z`, excluded: { query: excludedDue[3]! } };
  }
  return null;
}
