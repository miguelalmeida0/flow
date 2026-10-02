import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import { leadingQuotedValue } from "../../shared/command/literalValue";
import { commitmentDeadline, commitmentObject } from "./commitmentDeadline";

export function genericRecipient(value: string) {
  return /^(?:(?:someone|somebody|anyone|anybody|nobody|no one|him|her|them)$|(?:a|an|my|our|the)(?:\s|$))/i.test(value);
}

/** Recipient and obligation are separate raw spans. Generic roles cannot
 * become contact names; words inside the obligation do not affect authority. */
export function assertedObligation(source: string, today: string): GlobalIntent | null {
  const outer = source.trim().match(/^i (owe|promised|told)\s+([\s\S]+)$/i);
  if (!outer) return null;
  const rest = outer[2]!, quoted = leadingQuotedValue(rest);
  if (!quoted && /^(?:no one|nobody)\b/i.test(rest)) return { type: "unsupported", title: "Nothing changed", detail: "That statement does not assert a promise to anyone." };
  const genericRole = rest.match(/^((?:a|an|my|our|the)\s+[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2}?)\s+((?:(?:a|an|the|my|our|your|their|his|her)\s+|(?:that\s+)?i(?:'d|’d| would| will|'ll|’ll)\s+|to expect\s+)[\s\S]+)$/iu);
  const simple = rest.match(/^([\p{L}][\p{L}'’-]*)\s+([\s\S]+)$/u);
  const recipient = quoted?.value ?? genericRole?.[1] ?? simple?.[1];
  let obligation = (quoted?.suffix.trim() ?? genericRole?.[2] ?? simple?.[2]);
  if (!recipient || !obligation) return null;
  if (outer[1]!.toLowerCase() === "told") {
    // A quote or report of words is not an asserted delivery. Only these
    // bounded positive forms grant authority to the named recipient.
    if (!/^(?:(?:that\s+)?i(?:'d|’d| would| will|'ll|’ll)\s+|to expect\s+|(?:the|a|an|my|our|your|their|his|her)\s+.+?\s+(?:would|will) be ready\b)/i.test(obligation)) return { type: "unsupported", title: "Nothing changed", detail: "No positive delivery was asserted." };
    obligation = obligation.replace(/^to expect\s+/i, "");
  }
  obligation = obligation.replace(/^(?:(?:that\s+)?i(?:'d|’d| would| will|'ll|’ll)\s+|to\s+)/i, "").trim();
  if (/^(?:not|never|no longer|i (?:would not|will not|wouldn't|wouldn’t|won't|won’t))\b/i.test(obligation)) return { type: "unsupported", title: "Nothing changed", detail: "No positive delivery was asserted." };
  const deadline = commitmentDeadline(obligation, today);
  const delivery = { ...deadline, direction: "i-owe" as const, status: "open" as const };
  if (!quoted && genericRecipient(recipient)) {
    if (deadline.unresolvedDeadline) return { type: "clarification", title: "Who is this promise with, and when is it due?", detail: "Name the person and an exact deadline. Nothing was created." };
    return { type: "clarification", title: "Who is this promise with?", detail: "Name the person. Nothing was created.", continuation: { type: "commitment-recipient", ...delivery, title: deadline.title.replace(/^./, (letter) => letter.toUpperCase()) } };
  }
  return { type: "commitment-create", person: recipient.replace(/^./, (letter) => letter.toUpperCase()), ...delivery, title: commitmentObject(deadline.title) };
}
