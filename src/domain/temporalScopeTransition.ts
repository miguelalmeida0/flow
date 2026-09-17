import type { LifeSnapshot, TemporalScope } from "./life-model";
import { projectCalendarDate } from "./life-calendar-world";

/** A persisted view projection, not a business transaction or undo entry. */
export function temporalScopeTransition(current: LifeSnapshot, scope: TemporalScope, todayDateKey: string): LifeSnapshot {
  const previous = current.temporal?.scope;
  if (previous?.kind === scope.kind && previous.dateKey === scope.dateKey && previous.endDateKey === scope.endDateKey) return current;
  return {
    ...current,
    revision: current.revision + 1,
    document: projectCalendarDate(current.document, scope.dateKey),
    temporal: { todayDateKey: current.temporal?.todayDateKey ?? todayDateKey, scope, ...(previous ? { previousScope: previous } : {}) },
  };
}
