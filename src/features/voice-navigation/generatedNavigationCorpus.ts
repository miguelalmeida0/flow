import { genericSurfaceNouns, navigationDestinations, navigationFrames } from "./navigationLexicon";
import type { NavigationTarget } from "./model";

export interface NavigationCorpusRow { utterance: string; target: NavigationTarget }

// Exact release contracts. The corpus tests keep these values synchronized
// with the generated production-router inputs that the release report cites.
export const NAVIGATION_POSITIVE_VARIANT_COUNT = 13_896;
export const NAVIGATION_COLLISION_NEGATIVE_COUNT = 216;

export function generatePositiveNavigationCorpus(): NavigationCorpusRow[] {
  const prefixes = ["", "please ", "actually ", "hey flow "];
  const determiners = ["", "the ", "my "];
  const suffixes = ["", " please", " for me", " now"];
  const rows: NavigationCorpusRow[] = [];
  for (const destination of navigationDestinations) {
    const aliases = destination.target.world === "today"
      ? destination.aliases.filter((alias) => !["today", "day", "my day"].includes(alias))
      : destination.aliases;
    for (const frame of navigationFrames.slice(0, 12)) {
      for (const prefix of prefixes) {
        for (const determiner of determiners) {
          for (const alias of aliases.slice(0, 4)) {
            for (const suffix of suffixes.slice(0, 2)) {
              rows.push({ utterance: `${prefix}${frame} ${determiner}${alias}${suffix}`.replace(/\s+/g, " ").trim(), target: destination.target });
            }
          }
        }
      }
    }
    for (const alias of aliases.filter((value) => !/^(?:what|who|when|where|why|how|do|does|did|will|should|can i)\b/.test(value))) rows.push({ utterance: alias, target: destination.target });
    for (const noun of genericSurfaceNouns.slice(0, 6)) rows.push({ utterance: `open the ${aliases[0]} ${noun}`, target: destination.target });
  }
  return [...new Map(rows.map((row) => [row.utterance, row])).values()];
}

const collisionSeeds = [
  "add focus time at three", "move my calendar meeting", "add an outcomes note at three",
  "show the meeting at two", "make tomorrow my focus day", "start a focus session for twenty minutes",
  "schedule Sarah for tomorrow", "open the two PM meeting", "delete the focus block",
  "rename the outcomes review", "protect my calendar event", "move my weather check",
  "block a weather review at four", "move my capture session", "cancel the plans meeting",
  "defer my commitments review", "complete the focus sprint", "add a people meeting at five",
  "make the calendar event red", "shorten the focus block", "schedule the roadmap Friday",
  "move the good to know workshop", "label the capture event client", "split the outcomes session",
] as const;

export function generateNegativeNavigationCorpus() {
  const transforms = [
    (value: string) => value,
    (value: string) => `please ${value}`,
    (value: string) => `actually ${value}`,
    (value: string) => `${value} please`,
    (value: string) => `${value}.`,
    (value: string) => value.toUpperCase(),
    (value: string) => `could you ${value}`,
    (value: string) => `uh ${value}`,
    (value: string) => `${value} for me`,
  ];
  return collisionSeeds.flatMap((seed) => transforms.map((transform) => transform(seed)));
}
