import { parseClockExpression } from "./temporal";

const hour = "(?:\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ](?:one|two|three))?)";
const spokenMinutes = "(?:ten|fifteen|twenty(?:[- ]five)?|thirty|forty(?:[- ]five)?|fifty(?:[- ]five)?)";
const clock = `(?:noon|midnight|(?:half past|quarter (?:to|past)) ${hour}|${hour}(?::\\d{2}| ${spokenMinutes})?)(?:\\s*(?:am|pm|oclock))?`;

/** Creation slots carry source spans: removing a time cannot accidentally
 * remove a location, a Room 8 title, or a 30-minute duration. */
export function createTemporalSpans(clause: string): { error: string } | { minutes: number; titleSource: string } | undefined {
  const spans: Array<{ start: number; end: number; text: string }> = [];
  for (const match of clause.matchAll(new RegExp(`\\b(?:at|for)\\s+(${clock})(?=\\s|$)`, "g"))) {
    // "for 30 minutes" is a duration, never the start-time slot.
    if (/^\s*(?:minutes?|hours?)\b/.test(clause.slice(match.index + match[0].length))) continue;
    spans.push({ start: match.index, end: match.index + match[0].length, text: match[1]! });
  }
  const front = clause.match(new RegExp(`^(?:(?:book|add|create|schedule)\\s+(?:an?\\s+)?)?(${clock})(?=\\s+(?:meeting|appointment|event|call)\\b|\\s+.+$)`));
  if (front && /\b(?:am|pm|oclock)\b|\d:\d/.test(front[1]!)) {
    const start = front[0].length - front[1]!.length;
    spans.push({ start, end: front[0].length, text: front[1]! });
  }
  // A visible numeric clock cannot disappear into the day-part fallback.
  // Literal titles are already opaque tokens at this boundary.
  for (const explicit of clause.matchAll(/\b(at|for)\s*(\d\S*(?:\s+[ap](?:\.?m\.?)?(?=\s|$))?)/g)) {
    if (explicit[1] === "for" && /^\s*(?:minutes?|hours?)\b/.test(clause.slice(explicit.index + explicit[0].length))) continue;
    const covered = spans.some(({ start, end }) => start === explicit.index && end >= explicit.index + explicit[0].length);
    if (!covered) return { error: "What is the complete start time? I could not resolve the clock you named. Nothing changed." };
  }
  if (!spans.length) return undefined;
  const times = spans.map(({ text }) => parseClockExpression(text));
  if (times.some(({ status }) => status === "invalid")) return { error: "That time is outside a valid 24-hour clock." };
  const minutes = times.flatMap((value) => value.status === "found" ? [value.minutes] : []);
  // A second, explicitly alternative clock must not be silently ignored.
  if (new RegExp(`\\bor\\s+${clock}`).test(clause) || new Set(minutes).size > 1) return { error: "Which start time should I use? Choose one of the times you named." };
  if (!minutes.length) return undefined;
  let titleSource = clause;
  for (const span of spans.sort((a, b) => b.start - a.start)) titleSource = titleSource.slice(0, span.start) + titleSource.slice(span.end);
  titleSource = titleSource.replace(/\b(?:today|this morning|this afternoon|this evening)\b/g, " ");
  const named = titleSource.match(/\b(?:called|named|(?:meeting|appointment|event)\s+calls)\s+(.+)$/);
  if (named) titleSource = named[1]!;
  return { minutes: minutes[0]!, titleSource: titleSource.replace(/\s+/g, " ").trim() };
}

export function isClockFirstCreation(clause: string) {
  return new RegExp(`^${clock}\\s+.+$`).test(clause) && /^(?:\d+(?::\d{2})?\s*(?:am|pm)|[a-z -]+\s+(?:am|pm))\b/.test(clause);
}
