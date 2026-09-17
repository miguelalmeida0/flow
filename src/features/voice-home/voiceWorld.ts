import type { LifeContext, LifeDocument, WorldDestination } from "../../domain/life-model";
import type { CalendarAction, EventSelector, TransactionSource } from "../day-planner/model";
import { resolveEventReference } from "../day-planner/scheduling/resolution";
import type { GlobalIntent, GlobalIntentResolution } from "../../shared/command/globalInterpreter";
import type { VoiceTargetMotionStage } from "../../shared/motion/voiceMotionHandshake";

export type VoiceWorldPhase =
  | "waiting-for-wake"
  | "wake-detected"
  | "preparing"
  | "listening"
  | "targeting"
  | "executing"
  | "success"
  | "clarifying"
  | "error"
  | "idle-session";

export type HomeEntrancePhase = "wake-armed" | "wake-reward" | "preparing" | "active";
export type ConfidenceTier = "high" | "contextual" | "clarify" | "unsupported";
export type VoiceTargetDirection = "left" | "center" | "right";

export interface VoiceWorldSnapshot {
  entrance: HomeEntrancePhase;
  phase: VoiceWorldPhase;
  sequence: number;
  domain?: WorldDestination;
  targetId?: string;
  actionId?: string;
  transcript?: string;
  source?: TransactionSource;
  confidenceTier: ConfidenceTier;
  targetDirection?: VoiceTargetDirection;
  targetMotionStage?: VoiceTargetMotionStage;
  acknowledgedAt?: number;
}

export interface VoiceCommandProjection {
  domain?: WorldDestination;
  targetId?: string;
  actionId: string;
  transcript: string;
  source: TransactionSource;
  confidenceTier: ConfidenceTier;
  targetDirection?: VoiceTargetDirection;
}

function directionForDomain(domain: WorldDestination | undefined): VoiceTargetDirection | undefined {
  if (domain === "today" || domain === "journal") return "left";
  if (domain === "atmosphere" || domain === "memories") return "right";
  if (domain) return "center";
  return undefined;
}

function destinationForRoute(route: string): WorldDestination | undefined {
  if (route === "calendar" || route === "now") return "today";
  if (route === "inbox") return "capture";
  if (route === "plans") return "outcomes";
  if (["home", "today", "focus", "weather-outfit", "people", "good-to-know", "capture", "outcomes", "journal", "atmosphere", "memories"].includes(route)) {
    return route as WorldDestination;
  }
  return undefined;
}

function domainForIntent(intent: GlobalIntent, context: LifeContext, selectedDomain?: string): WorldDestination | undefined {
  if (intent.type === "studio-compound") {
    // Project the canonical steps, never reparse the transcript. Secondary
    // atmosphere work must not replace the requested primary world.
    const primary = [...intent.steps].reverse().find((step) => step.type === "navigate"
      || step.type === "journal-create" || step.type === "memory-create"
      || (step.type === "workspace" && step.operation === "primary"));
    const projected = primary ?? intent.steps[0];
    return projected ? domainForIntent(projected, context, selectedDomain) : destinationForRoute(context.route);
  }
  if (intent.type === "navigate") {
    if (intent.route === "back") return destinationForRoute(context.previousWorld ?? context.previousRoute ?? context.route);
    return destinationForRoute(intent.target?.world ?? intent.route);
  }
  if (intent.type === "navigate-temporal" || intent.type === "temporal" || intent.type === "calendar" || intent.type === "calendar-inspect") return "today";
  if (intent.type === "navigate-plan" || intent.type.startsWith("plan-") || intent.type.startsWith("step-")) return "outcomes";
  if (intent.type.startsWith("capture-")) return "capture";
  if (intent.type.startsWith("commitment-") || intent.type === "people-query" || intent.type === "person-query") return "people";
  if (intent.type.startsWith("journal-")) return "journal";
  if (intent.type.startsWith("atmosphere-")) return "atmosphere";
  if (intent.type.startsWith("memory-")) return "memories";
  if (intent.type === "workspace") return intent.surface ?? destinationForRoute(context.route);
  if (intent.type.startsWith("focus-")) return "focus";
  if (["weather-query", "outfit-query", "umbrella-query", "daylight-query"].includes(intent.type)) return "weather-outfit";
  if (intent.type.startsWith("instinct-") || intent.type === "query-now" || intent.type === "why-now") return intent.type === "query-now" ? "home" : "good-to-know";
  if (selectedDomain === "calendar" || selectedDomain === "temporal") return "today";
  if (selectedDomain === "journal") return "journal";
  if (selectedDomain === "atmosphere") return "atmosphere";
  if (selectedDomain === "memory") return "memories";
  return destinationForRoute(context.route);
}

function selectorFor(action: CalendarAction): EventSelector | undefined {
  if ("selector" in action) return action.selector;
  if ((action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom") && action.destination.type === "relative") return action.destination.anchor;
  return undefined;
}

function targetForIntent(intent: GlobalIntent, document: LifeDocument, context: LifeContext) {
  if (intent.type === "studio-compound") return undefined; // The primary world is the compound target, not an unrelated prior entity.
  if (intent.type === "calendar-inspect") {
    const result = resolveEventReference(document.calendar, intent.selector, context.selected?.kind === "calendar-event" ? context.selected.id : undefined);
    return result.status === "resolved" && result.events.length === 1 ? result.events[0]!.id : undefined;
  }
  if (intent.type === "calendar") {
    const selector = intent.request.actions.map(selectorFor).find(Boolean);
    if (selector) {
      const result = resolveEventReference(document.calendar, selector, context.selected?.kind === "calendar-event" ? context.selected.id : undefined, intent.request.nowMinutes);
      if (result.status === "resolved" && result.events.length === 1) return result.events[0]!.id;
    }
  }
  return context.selected?.id ?? context.lastReferenced?.id ?? context.focusedEntityId;
}

export function projectResolvedCommand(
  resolution: GlobalIntentResolution,
  document: LifeDocument,
  context: LifeContext,
  transcript: string,
  source: TransactionSource,
  actionId: string,
): VoiceCommandProjection {
  const domain = domainForIntent(resolution.intent, context, resolution.selected?.domain);
  return {
    domain,
    targetId: targetForIntent(resolution.intent, document, context),
    actionId,
    transcript,
    source,
    confidenceTier: resolution.selected?.confidence
      ?? (resolution.intent.type === "clarification" ? "clarify" : resolution.intent.type === "unsupported" ? "unsupported" : "contextual"),
    targetDirection: directionForDomain(domain),
  };
}
