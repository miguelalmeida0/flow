import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import { leadingQuotedValue } from "../../shared/command/literalValue";
import { dateKeyAfter, parseDateExpression } from "../day-planner/interpretation/temporal";

export function genericRecipient(value: string) {
  return /^(?:(?:someone|somebody|anyone|anybody|nobody|no one|him|her|them)$|(?:a|an|my|our|the)\s)/i.test(value);
}

/** Recipient and obligation are separate raw spans. Generic roles cannot
 * become contact names; words inside the obligation do not affect authority. */
export function assertedObligation(source: string, today: string): GlobalIntent | null {
  const outer = source.trim().match(/^i (?:owe|promised)\s+([\s\S]+)$/i);
  if (!outer) return null;
  const rest = outer[1]!, quoted = leadingQuotedValue(rest);
  if (!quoted && /^(?:no one|nobody)\b/i.test(rest)) return { type: "unsupported", title: "Nothing changed", detail: "That statement does not assert a promise to anyone." };
  const genericRole = rest.match(/^((?:a|an|my|our|the)\s+[\p{L}'’-]+(?:\s+[\p{L}'’-]+){0,2}?)\s+((?:a|an|the|my|our|your|their|his|her)\s+[\s\S]+)$/iu);
  const simple = rest.match(/^([\p{L}][\p{L}'’-]*)\s+([\s\S]+)$/u);
  const recipient = quoted?.value ?? genericRole?.[1] ?? simple?.[1];
  let obligation = (quoted?.suffix.trim() ?? genericRole?.[2] ?? simple?.[2])?.replace(/^(?:i(?:'d|’d| would| will|'ll|’ll)\s+|to\s+)/i, "").trim();
  if (!recipient || !obligation) return null;
  if (/^(?:not|never|no longer)\b/i.test(obligation)) return { type: "unsupported", title: "Nothing changed", detail: "No positive delivery was asserted." };
  const deadline = obligation.match(/\s+(?:by|on|no later than)\s+(tomorrow|(?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))[.!?]?$/i);
  const target = deadline ? parseDateExpression(deadline[1]!.toLowerCase(), today) : null;
  const dueDay = target === "tomorrow" ? dateKeyAfter(today, 1) : target === "today" ? today : target?.dateKey;
  if (deadline) obligation = obligation.slice(0, deadline.index);
  const title = obligation.replace(/[.!?]$/, "").replace(/^./, (letter) => letter.toUpperCase());
  const delivery = { title, direction: "i-owe" as const, status: "open" as const, ...(dueDay ? { dueAt: `${dueDay}T17:00:00.000Z` } : {}) };
  if (!quoted && genericRecipient(recipient)) return { type: "clarification", title: "Who is this promise with?", detail: "Name the person. Nothing was created.", continuation: { type: "commitment-recipient", ...delivery } };
  return { type: "commitment-create", person: recipient.replace(/^./, (letter) => letter.toUpperCase()), ...delivery };
}
