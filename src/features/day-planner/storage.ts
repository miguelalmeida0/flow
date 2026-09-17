import { z } from "zod";
import { withEventDefaults } from "./eventDefaults";
import type { CalendarAction, ChangeRecord, DayPlan, PlannerSnapshot } from "./model";
import { validatePlan } from "./scheduling/invariants";
import { syncEventBuffers } from "./scheduling/linkedBreathingRooms";

const KEY_V4 = "flow.planner.v4";
const KEY_V3 = "flow.planner.v3";
const KEY_V2 = "flow.planner.v2";
const KEY_V1 = "flow.day-plan.v1";

const eventSchema = z.object({
  id: z.string().min(1), title: z.string().min(1), dateKey: z.string(),
  start: z.number().int(), end: z.number().int(),
  kind: z.enum(["fixed", "protected", "flexible", "buffer"]),
  priority: z.enum(["high", "medium", "low"]),
  color: z.enum(["neutral", "red", "orange", "yellow", "green", "cyan", "blue", "indigo"]).optional(),
  labels: z.array(z.string()).optional(),
  importance: z.enum(["normal", "important", "critical"]).optional(),
  mobility: z.enum(["anchored", "heavy", "light", "fluid"]).optional(),
  protected: z.boolean().optional(), status: z.enum(["planned", "confirmed", "active", "done", "cancelled"]).optional(),
  bufferBeforeMinutes: z.number().int().nonnegative().optional(), bufferAfterMinutes: z.number().int().nonnegative().optional(),
  linkedGroupId: z.string().optional(), completedAtMinutes: z.number().int().optional(), mergedFromIds: z.array(z.string()).optional(),
});
const roomSchema = z.object({
  id: z.string().min(1), dateKey: z.string(), start: z.number().int(), end: z.number().int(),
  protected: z.boolean(), label: z.string().optional(), source: z.enum(["user", "tide"]),
  linkedEventId: z.string().optional(), relation: z.enum(["before", "after"]).optional(),
});
const planSchema = z.object({
  dateKey: z.string(), events: z.array(eventSchema), deferred: z.array(eventSchema),
  breathingRooms: z.array(roomSchema).optional(), endBoundaryMinutes: z.number().int().optional(),
});
const changeSchema = z.object({
  transactionId: z.string().min(1).optional(), timestamp: z.string().datetime().optional(),
  summary: z.string(), detail: z.string(), transcript: z.string(),
  source: z.enum(["type", "voice", "drag", "resize", "quick", "keyboard", "tide"]).optional(),
  actions: z.array(z.unknown()).optional(), before: planSchema.optional(), after: planSchema.optional(),
});
const historySchema = z.object({ plan: planSchema, lastChange: changeSchema.optional() });
const snapshotV4Schema = z.object({ version: z.literal(4), plan: planSchema, past: z.array(historySchema), future: z.array(historySchema), lastChange: changeSchema.optional() });
const snapshotV3Schema = z.object({ version: z.literal(3), plan: planSchema, past: z.array(historySchema), future: z.array(historySchema), lastChange: changeSchema.optional() });

function normalizePlan(plan: z.infer<typeof planSchema>): DayPlan {
  const events = plan.events.map(withEventDefaults);
  const deferred = plan.deferred.map(withEventDefaults);
  const all = [...events, ...deferred];
  const normalized: DayPlan = {
    ...plan,
    events,
    deferred,
    breathingRooms: (plan.breathingRooms ?? []).map((room) => {
      if (!room.linkedEventId || room.relation) return { ...room };
      const event = all.find((candidate) => candidate.id === room.linkedEventId);
      if (event && room.end === event.start) return { ...room, relation: "before" as const };
      if (event && room.start === event.end) return { ...room, relation: "after" as const };
      const unlinked = { ...room };
      delete unlinked.linkedEventId;
      return unlinked;
    }),
  };
  syncEventBuffers(normalized);
  return normalized;
}

function normalizeChange(change: z.infer<typeof changeSchema> | undefined): ChangeRecord | undefined {
  if (!change) return undefined;
  const legacyKey = `${change.transcript}|${change.summary}|${change.detail}`;
  let hash = 2166136261;
  for (const character of legacyKey) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return {
    ...change,
    transactionId: change.transactionId ?? `legacy-${(hash >>> 0).toString(36)}`,
    timestamp: change.timestamp ?? "1970-01-01T00:00:00.000Z",
    actions: change.actions as CalendarAction[] | undefined,
    before: change.before ? normalizePlan(change.before) : undefined,
    after: change.after ? normalizePlan(change.after) : undefined,
  };
}

function normalizeSnapshot(parsed: Omit<z.infer<typeof snapshotV4Schema>, "version">): PlannerSnapshot {
  return {
    plan: normalizePlan(parsed.plan),
    past: parsed.past.map((entry) => ({ plan: normalizePlan(entry.plan), lastChange: normalizeChange(entry.lastChange) })),
    future: parsed.future.map((entry) => ({ plan: normalizePlan(entry.plan), lastChange: normalizeChange(entry.lastChange) })),
    lastChange: normalizeChange(parsed.lastChange),
  };
}

function valid(snapshot: PlannerSnapshot) {
  return [snapshot.plan, ...snapshot.past.map((entry) => entry.plan), ...snapshot.future.map((entry) => entry.plan)]
    .every((plan) => validatePlan(plan) === null);
}

function migrateV1(dateKey: string): PlannerSnapshot | null {
  const value = localStorage.getItem(KEY_V1);
  if (!value) return null;
  const legacyEventSchema = eventSchema.omit({ dateKey: true });
  const legacy = z.object({ dateKey: z.string(), events: z.array(legacyEventSchema), deferred: z.array(legacyEventSchema) }).parse(JSON.parse(value));
  if (legacy.dateKey !== dateKey) return null;
  const tomorrow = new Date(`${dateKey}T12:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const snapshot: PlannerSnapshot = {
    plan: normalizePlan({ ...legacy, events: legacy.events.map((event) => ({ ...event, dateKey })), deferred: legacy.deferred.map((event) => ({ ...event, dateKey: next })) }),
    past: [], future: [],
  };
  return valid(snapshot) ? snapshot : null;
}

function migrateV2(dateKey: string): PlannerSnapshot | null {
  const value = localStorage.getItem(KEY_V2);
  if (!value) return migrateV1(dateKey);
  const parsed = z.object({ version: z.literal(2), plan: planSchema, past: z.array(planSchema), future: z.array(planSchema), lastChange: changeSchema.optional() }).parse(JSON.parse(value));
  const snapshot = normalizeSnapshot({ plan: parsed.plan, past: parsed.past.map((plan) => ({ plan })), future: parsed.future.map((plan) => ({ plan })), lastChange: parsed.lastChange });
  return snapshot.plan.dateKey === dateKey && valid(snapshot) ? snapshot : null;
}

function migrateV3(dateKey: string): PlannerSnapshot | null {
  const value = localStorage.getItem(KEY_V3);
  if (!value) return migrateV2(dateKey);
  const parsed = snapshotV3Schema.parse(JSON.parse(value));
  const snapshot = normalizeSnapshot({ plan: parsed.plan, past: parsed.past, future: parsed.future, lastChange: parsed.lastChange });
  return snapshot.plan.dateKey === dateKey && valid(snapshot) ? snapshot : null;
}

export function loadPlannerState(dateKey: string): PlannerSnapshot | null {
  try {
    const value = localStorage.getItem(KEY_V4);
    if (!value) return migrateV3(dateKey);
    const parsed = snapshotV4Schema.parse(JSON.parse(value));
    const snapshot = normalizeSnapshot({ plan: parsed.plan, past: parsed.past, future: parsed.future, lastChange: parsed.lastChange });
    return snapshot.plan.dateKey === dateKey && valid(snapshot) ? snapshot : null;
  } catch {
    return null;
  }
}

export function savePlannerState(snapshot: PlannerSnapshot) {
  try {
    localStorage.setItem(KEY_V4, JSON.stringify({ version: 4, ...snapshot }));
  } catch {
    // The in-memory plan remains authoritative when browser storage is unavailable.
  }
}

export function clearPlan() {
  localStorage.removeItem(KEY_V4);
  localStorage.removeItem(KEY_V3);
  localStorage.removeItem(KEY_V2);
  localStorage.removeItem(KEY_V1);
}
