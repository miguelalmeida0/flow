import { leadingQuotedValue } from "../../../shared/command/literalValue";

/** A quoted saved name is one reference. Unquoted “the X sound” has a
 * determiner and media descriptor around that reference, not inside it. */
export function atmospherePlaybackQuery(source: string, normalized: string): string | undefined {
  const raw = source.trim().match(/^(?:play|start|put on|use)\s+(?:my\s+)?(["“'‘][\s\S]+)$/i)?.[1];
  const quoted = raw && leadingQuotedValue(raw);
  if (quoted && /^(?:\s+(?:atmosphere|sound))?[.!?]?\s*$/i.test(quoted.suffix)) return quoted.value.toLowerCase();
  const namedSound = normalized.match(/^(?:play|start|put on|use) (?:the|my) (.+?) sound$/);
  return namedSound?.[1] ?? normalized.match(/^(?:play|start|put on|use) (?:my )?(.+?)(?: atmosphere)?$/)?.[1];
}
