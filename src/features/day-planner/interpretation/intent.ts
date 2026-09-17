export type Intent =
  | "create" | "move" | "shift" | "resize" | "protect" | "unprotect"
  | "fit" | "recover" | "defer" | "delete" | "global" | "unknown";

export function parseIntent(clause: string): Intent {
  if (/^(?:undo|redo|reset|start over|what changed|confirm|apply|never mind|cancel that)$/.test(clause)) return "global";
  if (/\b(?:behind|running .*late|i am late|lost .*(?:minutes?|hours?)|recover the day|save (?:my )?afternoon|push what can move)\b/.test(clause)) return "recover";
  if (/^remove protection from\b/.test(clause)) return "unprotect";
  if (/^let\b.+\bmove again$/.test(clause)) return "unprotect";
  if (/^(?:delete|cancel|remove)\b/.test(clause)) return "delete";
  if (/^(?:unlock|unprotect|release)\b/.test(clause) || /^make\b.*\bflexible(?: again)?\b/.test(clause)) return "unprotect";
  if (/^change\b.*\b(?:flexible|movable)\b/.test(clause)) return "unprotect";
  if (/^change\b.*\b(?:fixed|protected|locked)\b/.test(clause)) return "protect";
  if (/^(?:protect|lock|fix)\b/.test(clause)) return "protect";
  if (/^(?:fit|make room|find .*free|give me)\b/.test(clause)) return "fit";
  if (/^make\s+an?\s+.+?\s+(?:block|event|appointment)\b/.test(clause) && /\bat\b/.test(clause)) return "create";
  if (/^add\b.*\b(?:minutes?|hours?)\s+to\b/.test(clause)
    || /^take\b.*\b(?:minutes?|hours?)\s+off\b/.test(clause)) return "resize";
  if (/^(?:shorten|extend|reduce|stretch|trim)\b/.test(clause)
    || /^give\b.*\b(?:another|more)\b.*\b(?:minutes?|hours?)\b/.test(clause)
    || /^make\b.*\b(?:minutes?|hours?|long)\b/.test(clause)) return "resize";
  if (/^change\b.*\b(?:minutes?|hours?|long)\b/.test(clause)) return "resize";
  if (/^(?:add|create|schedule|block|book)\b/.test(clause)) return "create";
  if (/^defer\b/.test(clause)) return "defer";
  // “Push the review back to six” names an absolute destination. It is a
  // move, not a relative shift; `back` alone only means shift when paired
  // with an amount such as “back 30 minutes”.
  if (/^(?:shift|push)\b.*\bback\s+to\b/.test(clause)) return "move";
  if (/^(?:shift|push)\b.*(?:\b(?:later|earlier|back)\b|\b(?:minutes?|hours?|half an hour)\b)/.test(clause)) return "shift";
  if (/^(?:move|shift|push|reschedule|put)\b/.test(clause)) return "move";
  if (/^change\b/.test(clause)) return "move";
  return "unknown";
}
