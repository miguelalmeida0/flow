import type { LifeSnapshot } from "./life-model";
import { weekScope } from "../features/elite/temporal";

/** Today and its current-week projection travel together. Explicit historical
 * or future scopes remain pinned; no range may retain a stale end date. */
export function rolloverTemporal(previous: LifeSnapshot["temporal"], today: string, fallbackDate: string, startsOn: 0 | 1): NonNullable<LifeSnapshot["temporal"]> {
  if (!previous) return { todayDateKey: today, scope: { kind: "day", dateKey: fallbackDate } };
  let scope = previous.scope;
  if (previous.todayDateKey !== today) {
    if (scope.kind === "day" && scope.dateKey === previous.todayDateKey) scope = { kind: "day", dateKey: today };
    if (scope.kind === "week") {
      const oldWeek = weekScope(previous.todayDateKey, startsOn);
      if (scope.dateKey === oldWeek.dateKey && scope.endDateKey === oldWeek.endDateKey) scope = weekScope(today, startsOn);
    }
  }
  if (scope.kind === "week" && (!scope.endDateKey || scope.endDateKey < scope.dateKey)) scope = weekScope(scope.dateKey, startsOn);
  return { ...previous, todayDateKey: today, scope };
}
