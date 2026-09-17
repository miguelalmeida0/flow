import { literalValue } from "../../../shared/command/literalValue";
import { outsideQuotedRanges } from "./sourceClauses";
import { parseClockExpression, parseDateExpression, parseDurationExpression } from "./temporal";
import { numberToken } from "./numbers";
import { normalizeTranscript } from "./normalize";

/** Locate a source value before normalization; this does not interpret or
 * execute a second request. The ordinary parser still owns all temporal slots. */
export function protectCreationValue(source: string, today: string) {
  let raw = source.trim();
  const dateFirst = raw.match(/^(tomorrow|today|(?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s+at\s+(.+?),?\s+(add|create|schedule|book)\s+(.+)$/i);
  if (dateFirst) raw = `${dateFirst[3]} ${dateFirst[4]!.replace(/[.!?]$/, "")} ${dateFirst[1]} at ${dateFirst[2]}`;
  const command = raw.match(/^(add|create|schedule|book|fit|block)\s+([\s\S]+)$/i);
  if (!command) return null;
  let head = `${command[1]} `, body = command[2]!;
  const named = body.match(/^([\s\S]+?\b(?:called|named)\s+)([\s\S]+)$/i);
  if (named) { head += named[1]; body = named[2]!; }
  else {
    const initialArticle = body.match(/^(?:an?|my|the)\s+/i);
    if (initialArticle) { head += initialArticle[0]; body = body.slice(initialArticle[0].length); }
    const duration = body.match(new RegExp(`^((?:half an hour|half hour|quarter (?:of an )?hour|${numberToken}\\s*-?\\s*(?:minutes?|hours?)(?:\\s+and\\s+${numberToken}\\s*minutes?)?))\\s+(?:(?:for|of)\\s+)?`, "i"));
    if (duration && parseDurationExpression(duration[1]!.toLowerCase()) !== null) { head += duration[0]; body = body.slice(duration[0].length); }
    const article = body.match(/^(?:an?|my|the)\s+/i);
    if (article) { head += article[0]; body = body.slice(article[0].length); }
  }
  if (/^["“'‘]/.test(body)) {
    let end = -1;
    for (let index = 1; index < body.length; index += 1) if (outsideQuotedRanges(body, index + 1)) { end = index; break; }
    if (end < 0) return null;
    return { head, value: literalValue(body.slice(0, end + 1)), suffix: body.slice(end + 1), literalCreation: true };
  }
  const boundary = [...body.matchAll(/\s+(at(?=\s|\d)|(?:on|for|from|before|after|between|tomorrow|today|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b)/gi)].find((match) => {
    if (!outsideQuotedRanges(body, match.index)) return false;
    const marker = match[1]!.toLowerCase(), tail = normalizeTranscript(body.slice(match.index + match[0].length));
    if (marker === "at" || marker === "from") return /^\d/.test(tail) || parseClockExpression(tail).status !== "missing";
    if (marker === "for" || marker === "on") return marker === "for" && (parseDurationExpression(tail) !== null || parseClockExpression(tail).status !== "missing") || /^(?:today|tomorrow|(?:next |this )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2})\b/.test(tail);
    if (/^(?:before|after|between)$/.test(marker)) return Boolean(tail);
    return Boolean(parseDateExpression(body.slice(match.index).toLowerCase(), today));
  });
  if (!boundary) return named ? { head, value: body.trim().replace(/[.!?]$/, ""), suffix: "", literalCreation: true } : null;
  const rawValue = body.slice(0, boundary.index).trim();
  const value = named ? rawValue : rawValue.replace(/\s+to (?:my|your|the) (?:schedule|calendar)$/i, "");
  // Lowercase generic nouns retain their existing display policy. Explicit
  // names and case-bearing values are literal source data, including iPhone.
  return value && (named || /\p{Lu}/u.test(value)) ? { head, value, suffix: body.slice(boundary.index), literalCreation: Boolean(named) } : null;
}
