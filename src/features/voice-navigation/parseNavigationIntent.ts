import { navigationDestinations } from "./navigationLexicon";
import { isMutationShapedNavigationCollision, normalizeNavigation } from "./normalizeNavigation";
import { navigationSimilarity } from "./scoreNavigationCandidate";
import type { NavigationParseResult } from "./model";

export function parseNavigationIntent(sourceText: string): NavigationParseResult {
  const normalized = normalizeNavigation(sourceText);
  if (!normalized.destinationText) return null;
  if (!normalized.framed && /^(?:what|who|when|where|why|how|do|does|did|will|should|can i)\b/.test(normalized.normalizedText)) return null;

  const alternatives = normalized.framed ? normalized.destinationText.split(/\s+or\s+/) : [];
  if (alternatives.length >= 2 && alternatives.length <= 3) {
    const destinations = alternatives.map((part) => navigationDestinations.find((destination) => destination.aliases.some((alias) => normalizeNavigation(`open ${alias}`).destinationText === normalizeNavigation(`open ${part}`).destinationText)));
    if (destinations.every((destination) => destination !== undefined)) return {
      kind: "clarify-navigation", sourceText, question: "Which place should I open?",
      choices: [...new Map(destinations.map((destination) => [destination!.id, destination!])).values()].map((destination) => ({ id: destination.id, label: destination.label, target: destination.target })),
    };
  }

  const exact = navigationDestinations.filter((destination) => destination.aliases.some((alias) => {
    if (normalized.framed) {
      const cleanedAlias = normalizeNavigation(`open ${alias}`).destinationText;
      return normalized.destinationText === cleanedAlias;
    }
    return normalized.destinationText === alias;
  }));
  if (exact.length === 1) return {
    kind: "navigate", target: exact[0]!.target, confidence: normalized.framed ? 1 : 0.96,
    sourceText, normalizedText: normalized.normalizedText, recovery: "exact",
  };
  if (exact.length > 1) return {
    kind: "clarify-navigation", sourceText,
    question: "Which place should I open?",
    choices: exact.slice(0, 3).map((item) => ({ id: item.id, label: item.label, target: item.target })),
  };
  if (isMutationShapedNavigationCollision(normalized.normalizedText)) return null;
  if (!normalized.framed) return null;

  const scored = navigationDestinations.map((destination) => ({
    destination,
    score: Math.max(...[...destination.aliases, ...(destination.safeFolds ?? [])]
      .map((alias) => navigationSimilarity(normalized.destinationText, normalizeNavigation(`open ${alias}`).destinationText))),
  })).sort((left, right) => right.score - left.score);
  const best = scored[0];
  const runnerUp = scored[1];
  if (!best || best.score < 0.84) return null;
  if (runnerUp && best.score - runnerUp.score < 0.15) return {
    kind: "clarify-navigation", sourceText,
    question: `I heard “${sourceText.trim()}”. Which place did you mean?`,
    choices: scored.slice(0, 3).map(({ destination }) => ({ id: destination.id, label: destination.label, target: destination.target })),
  };
  return {
    kind: "navigate", target: best.destination.target, confidence: best.score,
    sourceText, normalizedText: normalized.normalizedText, recovery: "fuzzy",
  };
}
