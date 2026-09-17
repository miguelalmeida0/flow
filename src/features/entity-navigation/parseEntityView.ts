import { literalValue } from "../../shared/command/literalValue";
import { outsideQuotedRanges } from "../day-planner/interpretation/sourceClauses";
import type { LifeContext } from "../../domain/life-model";
import { freshReference } from "../../app/conversationContext";
import type { EntityViewIntent, EntityViewSelector } from "./entityView";
import { parseNavigationIntent } from "../voice-navigation/parseNavigationIntent";

function selector(value: string): EntityViewSelector {
  const text = value.trim().replace(/^(?:the|my)\s+/i, "");
  if (/^(?:this|that|selected|current)$/i.test(text)) return { contextual: true };
  const ordinals = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];
  const ordinal = ordinals.indexOf(text.toLowerCase());
  if (ordinal >= 0) return { ordinal: ordinal + 1 };
  if (/^\d+(?:st|nd|rd|th)?$/i.test(text)) return { ordinal: Number.parseInt(text, 10) };
  return { query: literalValue(text.replace(/^(?:called|named)\s+/i, "")) };
}

/** Only complete, explicitly addressed view commands. Literal edits with a
 * supplied value remain owned by their existing transaction grammar. */
export function parseEntityView(transcript: string, context?: LifeContext): EntityViewIntent | null {
  const text = transcript.trim().replace(/[.!?]+$/, "");
  const navigation = /^open\b/i.test(text) ? parseNavigationIntent(text) : null;
  if (navigation?.kind === "navigate" && navigation.recovery === "exact") return null;
  if (/^(?:edit|rename)$/i.test(text) && context) {
    const target = freshReference(context, /^edit$/i.test(text) ? ["capture", "plan-step"] : ["plan-step"]);
    if (target) return { type: "entity-view", kind: target.kind === "capture" ? "capture" : "step", operation: "edit", target: { id: target.id } };
  }
  if (/^cancel$/i.test(text) && context?.activeEditor && !context.pending) return { type: "editor-close" };
  // A supplied replacement value is a transaction, never an editor request.
  if (/^(?:edit|rename)\b/i.test(text) && [...text.matchAll(/\s(?:to|as|with)\s/gi)].some((match) => outsideQuotedRanges(text, match.index))) return null;
  if (/^(?:cancel|close|stop) (?:the )?(?:capture |step )?(?:edit|editor|editing)$/i.test(text)) return { type: "editor-close" };
  const capture = text.match(/^(select|open|inspect|edit)\s+(.+?)\s+(?:capture|captured note)$/i)
    ?? text.match(/^(select|open|inspect|edit)\s+(?:the |my )?capture\s+(?:called |named )?(.+)$/i);
  if (capture) return { type: "entity-view", kind: "capture", operation: capture[1]!.toLowerCase() === "edit" ? "edit" : "select", target: selector(capture[2]!) };
  const step = text.match(/^(select|open|inspect|rename|edit)\s+(.+?)\s+step( in Today)?$/i);
  if (step) return { type: "entity-view", kind: "step", operation: /^(?:rename|edit)$/i.test(step[1]!) ? "edit" : "select", target: selector(step[2]!), ...(step[3] ? { inToday: true } : {}) };
  const commitment = text.match(/^(?:select|open|inspect)\s+(.+?)\s+(?:commitment|promise)(?:\s+(?:with|to|from)\s+(.+))?$/i);
  if (commitment) {
    const target = selector(commitment[1]!);
    return { type: "entity-view", kind: "commitment", operation: "select", target: "query" in target && commitment[2] ? { ...target, person: literalValue(commitment[2]) } : target };
  }
  const recommendation = text.match(/^(select|open|inspect)\s+(.+?)\s+(?:Now )?recommendation$/i);
  return recommendation ? { type: "entity-view", kind: "recommendation", operation: /^select$/i.test(recommendation[1]!) ? "select" : "open", target: selector(recommendation[2]!) } : null;
}
