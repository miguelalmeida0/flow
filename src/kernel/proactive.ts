import type { LifeDocument } from "../domain/life-model";

/**
 * Rule-driven proactive checks — no ML, no random notifications. Each rule is
 * a small deterministic function over LifeDocument that either finds
 * something worth surfacing or doesn't. New rules should follow the same
 * shape: pure function, explicit reason, one suggestedAction.
 */
export type ProactiveSeverity = "info" | "warning" | "critical";

export interface ProactiveSignal {
  type: "calendar-conflict" | "deadline-approaching" | "duplicate-plan" | "commitment-due" | "travel-conflict";
  severity: ProactiveSeverity;
  source: string;
  reason: string;
  suggestedAction: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function calendarConflicts(document: LifeDocument): ProactiveSignal[] {
  const events = document.calendar.events;
  const signals: ProactiveSignal[] = [];
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]!;
      const b = events[j]!;
      if (a.start < b.end && b.start < a.end) {
        signals.push({
          type: "calendar-conflict",
          severity: "warning",
          source: `${a.id}/${b.id}`,
          reason: `"${a.title}" overlaps "${b.title}".`,
          suggestedAction: `Move one of them.`,
        });
      }
    }
  }
  return signals;
}

function deadlinesApproaching(document: LifeDocument, nowMs: number): ProactiveSignal[] {
  return document.plans
    .filter((plan) => plan.status === "active" && plan.dueAt && new Date(plan.dueAt).getTime() - nowMs < DAY_MS && new Date(plan.dueAt).getTime() > nowMs)
    .map((plan) => ({
      type: "deadline-approaching" as const,
      severity: "warning" as const,
      source: plan.id,
      reason: `"${plan.title}" is due within a day.`,
      suggestedAction: `Check progress on "${plan.title}".`,
    }));
}

function duplicatePlans(document: LifeDocument): ProactiveSignal[] {
  const byTitle = new Map<string, string[]>();
  for (const plan of document.plans) {
    const key = plan.title.trim().toLowerCase();
    byTitle.set(key, [...(byTitle.get(key) ?? []), plan.id]);
  }
  return [...byTitle.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([title, ids]) => ({
      type: "duplicate-plan" as const,
      severity: "info" as const,
      source: ids.join("/"),
      reason: `You have ${ids.length} plans titled "${title}".`,
      suggestedAction: `Merge or rename the duplicates.`,
    }));
}

function commitmentsDue(document: LifeDocument, nowMs: number): ProactiveSignal[] {
  return document.commitments
    .filter((commitment) => commitment.status === "open" && commitment.dueAt && new Date(commitment.dueAt).getTime() - nowMs < DAY_MS && new Date(commitment.dueAt).getTime() > nowMs)
    .map((commitment) => ({
      type: "commitment-due" as const,
      severity: "warning" as const,
      source: commitment.id,
      reason: `"${commitment.title}" is due soon.`,
      suggestedAction: `Follow up on "${commitment.title}".`,
    }));
}

/** Foundation-only: flags back-to-back events explicitly labeled "travel"
 * with too little buffer. A real travel-time check needs location data this
 * codebase doesn't model yet (see sprint report, P2). */
function travelConflicts(document: LifeDocument, minimumBufferMinutes = 15): ProactiveSignal[] {
  const events = [...document.calendar.events].sort((a, b) => a.start - b.start);
  const signals: ProactiveSignal[] = [];
  for (let i = 0; i < events.length - 1; i += 1) {
    const current = events[i]!;
    const next = events[i + 1]!;
    const gap = next.start - current.end;
    if (gap >= 0 && gap < minimumBufferMinutes && (current.labels?.includes("travel") || next.labels?.includes("travel"))) {
      signals.push({
        type: "travel-conflict",
        severity: "critical",
        source: `${current.id}/${next.id}`,
        reason: `Only ${gap} minutes between "${current.title}" and "${next.title}".`,
        suggestedAction: `Add travel time or move one of them.`,
      });
    }
  }
  return signals;
}

export function runProactiveChecks(document: LifeDocument, now: Date): ProactiveSignal[] {
  const nowMs = now.getTime();
  return [...calendarConflicts(document), ...deadlinesApproaching(document, nowMs), ...duplicatePlans(document), ...commitmentsDue(document, nowMs), ...travelConflicts(document)];
}
