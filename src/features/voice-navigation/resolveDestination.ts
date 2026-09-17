import { navigationDestinations } from "./navigationLexicon";
import type { NavigationTarget } from "./model";

export function destinationLabel(target: NavigationTarget) {
  return navigationDestinations.find((item) => item.target.world === target.world && item.target.view === target.view)?.label
    ?? target.world;
}

export function destinationPath(target: NavigationTarget, planId?: string) {
  if (target.world === "home") return "/";
  if (target.world === "people" && target.view === "commitments") return "/people?view=commitments";
  if (target.world === "outcomes" && planId) return `/outcomes/${planId}`;
  return `/${target.world}`;
}
