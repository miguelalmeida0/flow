import { annotatedLiteralValue, leadingQuotedValue, literalAnnotationValue, literalValue } from "../../../shared/command/literalValue";
import type { JournalEditingIntent } from "./journalCapabilities";

/** Argument roles around literal spans; no normalized value reconstruction. */
export function journalRoleFrame(raw: string): JournalEditingIntent | null {
  const paragraph = raw.match(/^use this as the new paragraph:\s*([\s\S]+)$/i);
  const sentence = raw.match(/^the last (sentence|paragraph) should read\s+([\s\S]+)$/i);
  const append = raw.match(/^append (?:a )?paragraph (?:saying|that says)\s+([\s\S]+)$/i);
  if (paragraph || sentence || append) {
    const value = annotatedLiteralValue(paragraph?.[1] ?? sentence?.[2] ?? append![1]!);
    return value === null ? null : { type: "journal-text-edit", unit: sentence?.[1]?.toLowerCase() === "sentence" ? "sentence" : "paragraph", operation: append ? "append" : "replace", ...(paragraph ? { target: "selection" as const } : {}), value };
  }
  const initialQuote = leadingQuotedValue(raw);
  if (initialQuote && /^is what i want (?:this|the|my) journal called[.!?]?$/i.test(initialQuote.suffix.trim())) return { type: "journal-rename", title: initialQuote.value };
  const title = raw.match(/^use\s+([\s\S]+)$/i);
  const quotedTitle = title && leadingQuotedValue(title[1]!);
  const role = quotedTitle?.suffix.match(/^\s+as the journal title([\s\S]*)$/i);
  if (quotedTitle && role) {
    const value = literalAnnotationValue({ value: quotedTitle.value, suffix: role[1]! });
    return value === null ? null : { type: "journal-rename", title: value };
  }
  if (/^remove the final (?:sentence|paragraph) from this entry,? not the entry itself[.!?]?$/i.test(raw)) return { type: "journal-text-edit", unit: /final sentence/i.test(raw) ? "sentence" : "paragraph", operation: "remove" };
  const tag = raw.match(/^add (.+?) to the journal tags only if it isn't already there[.!?]?$/i);
  if (tag) return { type: "journal-tags", operation: "add", tags: [literalValue(tag[1]!)] };
  const removeTag = raw.match(/^keep the (.+?) tag,? but remove (.+?) from this entry[.!?]?$/i);
  if (removeTag) return { type: "journal-tags", operation: "remove", tags: [literalValue(removeTag[2]!)], preserveTags: [literalValue(removeTag[1]!)] };
  return null;
}
