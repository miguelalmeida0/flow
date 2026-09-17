const actionVerb = "move|shift|push|reschedule|put|change|add|create|schedule|delete|cancel|protect|keep|keeping|leave|fix|unlock|unprotect|shorten|extend|make|mark|paint|color|rename|label|remove|fit|find|defer|give|split|divide|break|combine|merge|complete|finish|reopen|clear|reflow|rebalance|end|do not|without moving its time";
const boundary = new RegExp(`\\s+(?:and then|then|but)\\s+|\\s+(?:and|while)\\s+(?=(?:please\\s+)?(?:${actionVerb})\\b)`, "g");
const commaBoundary = new RegExp(`,(?=\\s*(?:and\\s+)?(?:please\\s+)?(?:${actionVerb})\\b)`, "g");

export function splitClauses(normalized: string) {
  return normalized
    .split(/;|\.(?:\s+|$)/)
    .flatMap((part) => part.split(commaBoundary))
    .flatMap((part) => part.split(boundary))
    .map((part) => part.trim()
      .replace(/^(?:(?:and|but|then|while|please|just)\s+)+/, "")
      .replace(/^keeping\b/, "keep")
      .replace(/,\s*$/, "")
      .trim())
    .filter(Boolean);
}
