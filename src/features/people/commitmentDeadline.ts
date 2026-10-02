import { dateKeyAfter, parseDateExpression } from "../day-planner/interpretation/temporal";

const day = "(?:today|tomorrow|(?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))";
type Boundary = "dateOnly" | "start" | "morning" | "afternoon" | "end" | "unresolved";
const endings: Array<[RegExp, Boundary]> = [
  [new RegExp(`\\s+(?:before|after) lunch on (${day})$`, "i"), "unresolved"],
  [new RegExp(`\\s+(?:before (?:the|our)|for our) (${day}) (?:check-in|meeting)$`, "i"), "unresolved"],
  [new RegExp(`\\s+(?:in time for|ready for) (${day})$`, "i"), "unresolved"],
  [new RegExp(`\\s+by the time (${day}) starts$`, "i"), "start"],
  [new RegExp(`\\s+by the end of (${day})$`, "i"), "end"],
  [new RegExp(`\\s+first thing on (${day})$`, "i"), "morning"],
  [new RegExp(`\\s+(?:by|before|on) (${day}) morning$`, "i"), "morning"],
  [new RegExp(`\\s+(?:by|before|on) (${day}) afternoon$`, "i"), "afternoon"],
  [new RegExp(`\\s+before (${day})$`, "i"), "start"],
  // A known relation with an unsupported qualifier must not fall through to
  // a terminal weekday and acquire the date-only default.
  [new RegExp(`\\s+(?:after|until|for) (${day})$`, "i"), "unresolved"],
  [new RegExp(`\\s+(?:by|before|after|on|until|for) (${day})\\s+.+$`, "i"), "unresolved"],
  [new RegExp(`\\s+(?:before|after|by|until|for)\\s+(?:(?:the|our|a)\\s+)?[a-z-]+(?:\\s+(?:on|of))?\\s+(${day})$`, "i"), "unresolved"],
  [new RegExp(`\\s+(?:(?:by|on|no later than)\\s+)?(${day})$`, "i"), "dateOnly"],
];

/** Deadline grammar shared by asserted and waiting-on obligations. Civil
 * boundaries follow the browser timezone; date-only keeps the existing 17Z
 * contract. Event-relative phrases have no safe upper bound until clarified. */
export function commitmentDeadline(source: string, today: string): { title: string; dueAt?: string; unresolvedDeadline?: string } {
  const text = source.trim().replace(/[.!?]$/, "");
  for (const [pattern, boundary] of endings) {
    const match = text.match(pattern);
    if (!match) continue;
    const target = parseDateExpression(match[1]!.toLowerCase(), today);
    const dateKey = target === "today" ? today : target === "tomorrow" ? dateKeyAfter(today, 1) : target?.dateKey;
    const title = text.slice(0, match.index).trim() + (/^\s+ready for /i.test(match[0]) ? " ready" : "");
    if (!dateKey || boundary === "unresolved") return { title, unresolvedDeadline: match[0].trim() };
    if (boundary === "dateOnly") return { title, dueAt: `${dateKey}T17:00:00.000Z` };
    const civil = new Date(`${dateKey}T00:00:00`);
    if (boundary === "morning") civil.setHours(9);
    if (boundary === "afternoon") civil.setHours(14);
    if (boundary === "end") civil.setHours(23, 59, 59, 999);
    return { title, dueAt: civil.toISOString() };
  }
  return { title: text };
}

export function commitmentObject(title: string) {
  return title.replace(/^have\s+(?:the\s+)?(.+?)\s+ready$/i, "$1")
    .replace(/\s+(?:would|will) be ready$/i, "")
    .replace(/^the\s+/i, "").replace(/^./, (letter) => letter.toUpperCase());
}
