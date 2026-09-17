import type { LifeContext } from "../../domain/life-model";
import { literalValue } from "../../shared/command/literalValue";
import type { CommitmentLens, CommitmentViewIntent } from "./commitmentView";

function searchValue(value: string) {
  // The pointer descriptor uses JSON string framing so quotes/backslashes are
  // round-trippable. Ordinary unquoted speech remains exact source text.
  if (value.startsWith('"') && value.endsWith('"')) {
    try { const parsed: unknown = JSON.parse(value); if (typeof parsed === "string") return parsed; } catch { /* Ordinary quote-delimited language, not JSON. */ }
  }
  return literalValue(value);
}
function lensFor(value: string): CommitmentLens | undefined {
  const word = value.toLowerCase().replaceAll("-", " ").replace(/\s+/g, " ");
  if (/^(?:all|open)$/.test(word)) return "all";
  if (/^(?:i owe|owed by me)$/.test(word)) return "i-owe";
  if (/^(?:waiting on|waiting for)$/.test(word)) return "waiting-on";
  if (word === "next conversation") return "next-conversation";
  if (/^(?:completed|finished|done)$/.test(word)) return "completed";
  return undefined;
}

/** Explicit view operations, not inferred promises or status mutations. */
export function parseCommitmentView(source: string, context: LifeContext): CommitmentViewIntent | null {
  const raw = source.trim(), text = raw.replace(/[.!?]$/, "");
  const inView = context.route === "people" && context.peopleView === "commitments";
  const search = raw.match(/^(?:search|filter)\s+(?:my |the )?commitments?\s+(?:for|by)\s+([\s\S]+)$/i);
  if (search) return { type: "commitment-view", patch: { search: searchValue(search[1]!) } };
  if (/^(?:clear|reset) (?:the |my )?commitment search$/i.test(text) || inView && /^clear (?:the |my )?search(?:,? not the commitments)?$/i.test(text)) return { type: "commitment-view", patch: { search: "" } };
  const filter = text.match(/^(?:show|display) (?:me )?(?:only )?(?:my |the )?(.+?) (?:commitments|promises)(?: instead of (?:open|completed) ones)?$/i)
    ?? text.match(/^filter (?:my |the )?commitments to (?:the |things )?(.+)$/i);
  const after = text.match(/^(?:show|display) (?:me )?(?:my |the )?commitments (?:that are |where i am |where i'm )?(.+)$/i);
  const lens = lensFor(filter?.[1] ?? after?.[1] ?? (inView ? text : ""));
  return lens ? { type: "commitment-view", patch: { lens } } : null;
}
