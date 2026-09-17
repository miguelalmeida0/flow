import type { CalendarAction, CalendarRequest, ClarificationRequest, DayPlan } from "../model";

export interface ChangeSet {
  changedIds: Set<string>;
  anchoredIds: Set<string>;
  deferredIds: Set<string>;
  notes: string[];
  markerMinutes?: number;
  markerLabel?: string;
  originById: Record<string, { start: number; end: number }>;
}

export type EngineResult =
  | { status: "success"; plan: DayPlan; summary: string; detail: string; changes: ChangeSet; executedActions: CalendarAction[] }
  | { status: "clarification"; request: CalendarRequest; clarification: ClarificationRequest }
  | { status: "confirmation"; request: CalendarRequest; title: string; detail: string; confirmLabel?: string; authorizationKey: string }
  | { status: "conflict"; title: string; detail: string; options: string[] };

export type EngineFailure = Exclude<EngineResult, { status: "success" }>;

export function createChangeSet(): ChangeSet {
  return { changedIds: new Set(), anchoredIds: new Set(), deferredIds: new Set(), notes: [], originById: {} };
}
