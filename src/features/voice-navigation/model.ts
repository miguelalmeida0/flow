export type WorldDestination =
  | "home"
  | "today"
  | "focus"
  | "weather-outfit"
  | "people"
  | "good-to-know"
  | "capture"
  | "outcomes"
  | "journal"
  | "atmosphere"
  | "memories";

export type NavigationTarget =
  | { world: WorldDestination; view?: never }
  | { world: "people"; view: "commitments" };

export interface NavigationCandidate {
  kind: "navigate";
  target: NavigationTarget;
  confidence: number;
  sourceText: string;
  normalizedText: string;
  recovery: "exact" | "fuzzy";
}

export interface NavigationClarification {
  kind: "clarify-navigation";
  question: string;
  choices: Array<{ id: string; label: string; target: NavigationTarget }>;
  sourceText: string;
}

export type NavigationParseResult = NavigationCandidate | NavigationClarification | null;
