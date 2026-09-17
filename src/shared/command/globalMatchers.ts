import type { LifeRoute } from "../../domain/life-model";
import { normalizeTranscript } from "../../features/day-planner/interpretation/normalize";
import { parseNavigationIntent } from "../../features/voice-navigation/parseNavigationIntent";
import type { NavigationParseResult } from "../../features/voice-navigation/model";

export type SystemMatch =
  | { type: "history"; direction: "undo" | "redo" }
  | { type: "what-changed" }
  | { type: "session"; mode: "start" | "sleep" }
  | { type: "confirm" | "cancel" }
  | { type: "capture-mode" }
  | { type: "help" };

export function matchNavigationIntent(transcript: string): NavigationParseResult | { status: "back" } {
  const normalized = normalizeTranscript(transcript);
  if (normalized === "take me back") return parseNavigationIntent("home");
  if (/^(?:back|go back|previous space|return)$/.test(normalized)) return { status: "back" };
  return parseNavigationIntent(transcript);
}

export function matchNavigation(transcript: string) {
  const result = matchNavigationIntent(transcript);
  if (!result) return null;
  if ("status" in result) return "back";
  if (result.kind !== "navigate") return null;
  const world = result.target.world;
  if (world === "today") return "calendar";
  if (world === "capture") return "inbox";
  if (world === "outcomes") return "plans";
  return world satisfies LifeRoute;
}

export function matchSystem(transcript: string): SystemMatch | null {
  const normalized = normalizeTranscript(transcript);
  if (/^(?:undo|undo that|undo (?:the )?last (?:change|thing)|go back one change|take that back|reverse that|put it back|change it back|go back to how it was)$/.test(normalized)) return { type: "history", direction: "undo" };
  if (/^(?:redo|redo that|redo last change|do (?:it|that) again|reapply that|put the change back)$/.test(normalized)) return { type: "history", direction: "redo" };
  if (/^(?:what changed|what just changed|show last change)$/.test(normalized)) return { type: "what-changed" };
  if (/^(?:flow sleep|stop listening|pause listening|go to sleep|turn off flow live|stop flow live)$/.test(normalized)) return { type: "session", mode: "sleep" };
  if (normalized === "pause") return { type: "session", mode: "sleep" };
  if (/^(?:flow|hey flow|start flow live|flow live|start listening|resume listening|wake up flow|turn on flow live)$/.test(normalized)) return { type: "session", mode: "start" };
  if (/^(?:confirm|confirm removal|confirm deletion|yes|yes please|yes do it|do it|apply|proceed|go ahead|move anyway)$/.test(normalized)) return { type: "confirm" };
  if (/^(?:cancel|never mind|nevermind|cancel that|dismiss|no|no thanks|do not do that|keep (?:the )?event)$/.test(normalized)) return { type: "cancel" };
  if (/^(?:capture mode|start capture mode|capture the next thing)$/.test(normalized)) return { type: "capture-mode" };
  if (/^(?:help|what can i say|show commands|how does this work)$/.test(normalized)) return { type: "help" };
  return null;
}

export function isCanonicalMisroutedTranscript(transcript: string) {
  return Boolean(matchSystem(transcript) || matchNavigation(transcript));
}
