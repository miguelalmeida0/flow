import { loadPlannerState } from "../features/day-planner/storage";
import { createInitialLifePlan, createInitialTomorrowPlan } from "../features/day-planner/seed";
import type { LifeDocument, LifeSnapshot, LifeTransactionRecord } from "./life-model";
import { validateLifeDocument } from "./life-invariants";
import { isCanonicalMisroutedTranscript } from "../shared/command/globalMatchers";
import { normalizeCalendarWorld, projectCalendarDate } from "./life-calendar-world";
import { dateKeyAfter } from "../features/day-planner/interpretation/temporal";
import { createInitialStudioState, type StudioState } from "./studio-model";
import { rolloverTemporal } from "./temporalRollover";
import { migrateFriends } from "./friends-migration";
import { canonicalPerson } from "../features/friends/people";

export const LIFE_STORAGE_KEY = "flow.life.v3";
export const LEGACY_LIFE_STORAGE_KEY = "flow.life.v2";
export const LIFE_BACKUP_KEY = "flow.life.recovery";

const OLDEST_LIFE_STORAGE_KEY = "flow.life.v1";

const defaultLocation = {
  label: "Berlin",
  latitude: 52.52,
  longitude: 13.405,
  timezone: "Europe/Berlin",
};

function lifeDocumentForCalendar(calendar: LifeDocument["calendar"]): LifeDocument {
  return {
    schemaVersion: 6,
    calendar,
    calendars: { [calendar.dateKey]: structuredClone(calendar) },
    captures: [], plans: [], steps: [], people: [], commitments: [], links: [],
    focus: {},
    environment: { location: defaultLocation, weatherByDate: {} },
    instinctState: { dismissedUntil: {}, lastShownAt: {}, actedOnAt: {} },
    studio: createInitialStudioState(),
    friends: migrateFriends(undefined),
    preferences: { workdayEndMinutes: 17 * 60, firstName: "Alex", weekStartsOn: 1 },
  };
}

function freshLifeDocument(dateKey: string): LifeDocument {
  const current = createInitialLifePlan(dateKey);
  const nextDateKey = dateKeyAfter(dateKey, 1);
  const tomorrow = createInitialTomorrowPlan(nextDateKey);
  const document = lifeDocumentForCalendar(current);
  document.calendars[nextDateKey] = tomorrow;
  // Fresh and migrated documents share one canonical ordering immediately;
  // otherwise the first transaction can appear to change state merely by
  // sorting events even when Undo restored every value.
  return projectCalendarDate(normalizeCalendarWorld(document, dateKey), dateKey);
}

/** Deterministic pristine state for evaluation, onboarding previews, and
 * migrations that must not consult legacy local planner persistence. */
export function createFreshLifeSnapshot(dateKey: string): LifeSnapshot {
  return {
    revision: 0,
    document: freshLifeDocument(dateKey),
    temporal: { todayDateKey: dateKey, scope: { kind: "day", dateKey } },
    past: [],
    future: [],
  };
}

export function createLifeDocument(dateKey: string): LifeDocument {
  const planner = loadPlannerState(dateKey);
  return planner ? lifeDocumentForCalendar(planner.plan) : freshLifeDocument(dateKey);
}

/** Migrate the complete Calendar timeline into the one global history universe. */
export function createLifeSnapshot(dateKey: string): LifeSnapshot {
  const planner = loadPlannerState(dateKey);
  const temporal = { todayDateKey: dateKey, scope: { kind: "day" as const, dateKey } };
  if (!planner) return { revision: 0, document: freshLifeDocument(dateKey), temporal, past: [], future: [] };
  return {
    revision: 0,
    document: lifeDocumentForCalendar(planner.plan),
    temporal,
    past: planner.past.map(({ plan }) => ({ document: lifeDocumentForCalendar(plan) })),
    future: planner.future.map(({ plan }) => ({ document: lifeDocumentForCalendar(plan) })),
  };
}

function looksLikeSnapshot(value: unknown): value is LifeSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<LifeSnapshot>;
  const document = snapshot.document as Partial<LifeDocument> | undefined;
  return Boolean(document && [1, 2, 3, 4, 5, 6].includes(Number(document.schemaVersion)) && document.calendar && Array.isArray(document.captures)
    && Array.isArray(document.plans) && Array.isArray(document.steps) && Array.isArray(document.people)
    && Array.isArray(document.commitments) && Array.isArray(document.links) && Array.isArray(snapshot.past)
    && Array.isArray(snapshot.future));
}

function compactRecordForStorage(record: LifeTransactionRecord | undefined) {
  if (!record) return undefined;
  const compact: LifeTransactionRecord = { ...record };
  delete compact.before;
  delete compact.after;
  if (compact.calendarChange) {
    compact.calendarChange = { ...compact.calendarChange };
    delete compact.calendarChange.before;
    delete compact.calendarChange.after;
  }
  return compact;
}

/**
 * History entries already own the documents immediately before and after a
 * transaction. Keep the runtime record fully hydrated, but never write those
 * same large documents a second time inside transaction metadata.
 */
function compactSnapshotForStorage(snapshot: LifeSnapshot): LifeSnapshot {
  const compactEntry = ({ document, lastTransaction }: LifeSnapshot["past"][number]) => ({
    document,
    ...(lastTransaction ? { lastTransaction: compactRecordForStorage(lastTransaction) } : {}),
  });
  return {
    ...snapshot,
    past: snapshot.past.map(compactEntry),
    future: snapshot.future.map(compactEntry),
    ...(snapshot.lastTransaction ? { lastTransaction: compactRecordForStorage(snapshot.lastTransaction) } : {}),
  };
}

function compactHistoricalRecords(snapshot: LifeSnapshot): LifeSnapshot {
  const compactEntry = ({ document, lastTransaction }: LifeSnapshot["past"][number]) => ({
    document,
    ...(lastTransaction ? { lastTransaction: compactRecordForStorage(lastTransaction) } : {}),
  });
  return { ...snapshot, past: snapshot.past.map(compactEntry), future: snapshot.future.map(compactEntry) };
}

function hydrateActiveRecord(snapshot: LifeSnapshot): LifeSnapshot {
  const record = snapshot.lastTransaction;
  if (!record) return snapshot;
  // The surrounding canonical history is authoritative. Legacy payloads
  // occasionally carried stale nested copies; trusting them would make the
  // first hydration differ from every subsequent reload.
  const before = snapshot.past.at(-1)?.document ?? snapshot.document;
  const after = snapshot.document;
  return {
    ...snapshot,
    lastTransaction: {
      ...record,
      before,
      after,
      ...(record.calendarChange ? {
        calendarChange: {
          ...record.calendarChange,
          before: before.calendar,
          after: after.calendar,
        },
      } : {}),
    },
  };
}

function migrateRouterSafety(snapshot: LifeSnapshot, original: string, dateKey: string): LifeSnapshot {
  const allEntries = [
    ...snapshot.past,
    { document: snapshot.document, lastTransaction: snapshot.lastTransaction },
    ...snapshot.future,
  ];
  const records = [...new Map(allEntries.flatMap((entry) => entry.lastTransaction ? [[entry.lastTransaction.id, entry.lastTransaction] as const] : [])).values()];
  const documents = allEntries.flatMap((entry) => [entry.document, ...(entry.lastTransaction ? [entry.lastTransaction.before, entry.lastTransaction.after].filter((document): document is LifeDocument => Boolean(document)) : [])]);
  const captureIds = new Set(documents.flatMap(({ captures }) => captures.map(({ id }) => id)));
  const linkedIds = new Set(documents.flatMap(({ links }) => links.flatMap(({ fromId, toId }) => [fromId, toId])));
  const removable = new Set([...captureIds].filter((captureId) => {
    const captures = documents.flatMap(({ captures }) => captures.filter(({ id }) => id === captureId));
    if (!captures.length || captures.some((capture) => capture.status !== "unresolved" || capture.source !== "voice" || capture.provenance)) return false;
    if (linkedIds.has(captureId)) return false;
    const proof = records.filter((record) => record.source === "voice"
      && record.actionTypes.length === 1 && record.actionTypes[0] === "capture.create"
      && record.after?.captures.some(({ id }) => id === captureId)
      && !record.before?.captures.some(({ id }) => id === captureId));
    return proof.length === 1 && isCanonicalMisroutedTranscript(proof[0]!.transcript);
  }));

  const cleanDocument = (input: LifeDocument): LifeDocument => {
    const document = input as LifeDocument & Partial<Pick<LifeDocument, "calendars" | "focus" | "environment" | "instinctState" | "studio">>;
    const fallbackStudio = createInitialStudioState();
    const storedStudio = document.studio as Partial<StudioState> | undefined;
    const studio: StudioState = storedStudio ? {
      ...fallbackStudio,
      ...storedStudio,
      journalEntries: Array.isArray(storedStudio.journalEntries) ? storedStudio.journalEntries.map((entry) => ({
        ...entry,
        recordingState: entry.recordingState === "recording" || entry.recordingState === "paused" ? "interrupted" : entry.recordingState,
        photoAssetIds: Array.isArray(entry.photoAssetIds) ? entry.photoAssetIds : [],
        bookmarks: Array.isArray(entry.bookmarks) ? entry.bookmarks : [],
        transcriptSegments: Array.isArray(entry.transcriptSegments) ? entry.transcriptSegments : [],
        drawings: Array.isArray(entry.drawings) ? entry.drawings : [],
        tags: Array.isArray(entry.tags) ? entry.tags : [],
      })) : [],
      mediaAssets: Array.isArray(storedStudio.mediaAssets) ? storedStudio.mediaAssets : [],
      atmospherePresets: Array.isArray(storedStudio.atmospherePresets) && storedStudio.atmospherePresets.length ? storedStudio.atmospherePresets : fallbackStudio.atmospherePresets,
      memories: Array.isArray(storedStudio.memories) ? storedStudio.memories.map((memory) => ({
        ...memory,
        datePlacement: memory.datePlacement === "corner" ? "corner" as const : "inline" as const,
      })) : [],
      rituals: Array.isArray(storedStudio.rituals) ? storedStudio.rituals : fallbackStudio.rituals,
      workspace: storedStudio.workspace ? { ...fallbackStudio.workspace, ...storedStudio.workspace, minimized: Array.isArray(storedStudio.workspace.minimized) ? storedStudio.workspace.minimized : [] } : fallbackStudio.workspace,
    } : fallbackStudio;
    const activeIds = [...document.calendar.events, ...document.calendar.deferred, ...(document.calendar.breathingRooms ?? [])].map(({ id }) => id);
    if (new Set(activeIds).size !== activeIds.length) throw new Error("duplicate calendar identity");
    const cleaned: LifeDocument = {
    ...document,
    schemaVersion: 6,
    people: document.people.map(canonicalPerson),
    friends: migrateFriends(document.friends),
    calendars: document.calendars ?? { [document.calendar.dateKey]: structuredClone(document.calendar) },
    captures: document.captures.filter(({ id }) => !removable.has(id)),
    plans: document.plans.map((plan) => ({ ...plan })),
    commitments: document.commitments.map((commitment) => {
      const legacy = commitment as typeof commitment & { direction: string; status: string };
      return {
        ...commitment,
        direction: legacy.direction === "mine" ? "i-owe" as const : legacy.direction === "theirs" ? "waiting-on" as const : commitment.direction,
        status: legacy.status === "waiting" ? "open" as const : commitment.status,
      };
    }),
    focus: document.focus ?? {},
    environment: document.environment ?? { location: defaultLocation, weatherByDate: {} },
    instinctState: document.instinctState
      ? { ...document.instinctState, actedOnAt: document.instinctState.actedOnAt ?? {} }
      : { dismissedUntil: {}, lastShownAt: {}, actedOnAt: {} },
    studio,
    preferences: {
      workdayEndMinutes: document.preferences?.workdayEndMinutes ?? 17 * 60,
      firstName: document.preferences?.firstName ?? "Alex",
      weekStartsOn: document.preferences?.weekStartsOn ?? 1,
    },
  };
    return normalizeCalendarWorld(cleaned, cleaned.calendar.dateKey);
  };
  const cleanRecord = (record: NonNullable<LifeSnapshot["lastTransaction"]> | undefined) => record ? {
    ...record,
    ...(record.before ? { before: cleanDocument(record.before) } : {}),
    ...(record.after ? { after: cleanDocument(record.after) } : {}),
  } : undefined;
  const migrated: LifeSnapshot = {
    revision: Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0 ? snapshot.revision : 0,
    document: cleanDocument(snapshot.document),
    past: snapshot.past.map((entry) => ({ document: cleanDocument(entry.document), ...(entry.lastTransaction ? { lastTransaction: cleanRecord(entry.lastTransaction) } : {}) })),
    future: snapshot.future.map((entry) => ({ document: cleanDocument(entry.document), ...(entry.lastTransaction ? { lastTransaction: cleanRecord(entry.lastTransaction) } : {}) })),
    ...(snapshot.lastTransaction ? { lastTransaction: cleanRecord(snapshot.lastTransaction) } : {}),
  };
  migrated.temporal = rolloverTemporal(snapshot.temporal, dateKey, dateKey, migrated.document.preferences.weekStartsOn);
  migrated.document = projectCalendarDate(migrated.document, migrated.temporal.scope.dateKey);
  if (removable.size) localStorage.setItem(LIFE_BACKUP_KEY, original);
  return hydrateActiveRecord(migrated);
}

function parseLifeSnapshot(stored: string, dateKey: string): LifeSnapshot | undefined {
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!looksLikeSnapshot(parsed)) throw new Error("invalid life document");
    const migrated = migrateRouterSafety(parsed, stored, dateKey);
    const historyEntries = [...migrated.past, ...migrated.future];
    const records = [migrated.lastTransaction, ...historyEntries.map(({ lastTransaction }) => lastTransaction)].filter(Boolean);
    const documents = [
      migrated.document,
      ...historyEntries.map(({ document }) => document),
      ...records.flatMap((record) => record ? [record.before, record.after].filter((document): document is LifeDocument => Boolean(document)) : []),
    ];
    if (documents.some((document) => validateLifeDocument(document))) throw new Error("invalid life document");
    const runtimeSnapshot = compactHistoricalRecords(migrated);
    if (parsed.document.schemaVersion !== 6 || !Number.isSafeInteger((parsed as Partial<LifeSnapshot>).revision) || !localStorage.getItem(LIFE_STORAGE_KEY)) {
      localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(compactSnapshotForStorage(runtimeSnapshot)));
    }
    return runtimeSnapshot;
  } catch {
    try {
      const original = localStorage.getItem(LIFE_STORAGE_KEY);
      if (original) localStorage.setItem(LIFE_BACKUP_KEY, original);
    } catch { /* A recoverable in-memory document remains available. */ }
    return undefined;
  }
}

export function readLifeSnapshot(dateKey: string): LifeSnapshot | undefined {
  const stored = localStorage.getItem(LIFE_STORAGE_KEY);
  return stored ? parseLifeSnapshot(stored, dateKey) : undefined;
}

/** Read the canonical CAS token without hydrating and auditing the document. */
export function readLifeSnapshotRevision() {
  const stored = localStorage.getItem(LIFE_STORAGE_KEY);
  if (!stored) return undefined;
  // LifeSnapshot serializes `revision` first. Unknown or legacy shapes fall
  // back to the defensive full reader at the provider boundary.
  const match = /^\s*\{\s*"revision"\s*:\s*(\d+)/.exec(stored);
  if (!match) return undefined;
  const revision = Number(match[1]);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : undefined;
}

export function loadLifeSnapshot(dateKey: string): LifeSnapshot {
  const stored = localStorage.getItem(LIFE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_LIFE_STORAGE_KEY) ?? localStorage.getItem(OLDEST_LIFE_STORAGE_KEY);
  return stored ? parseLifeSnapshot(stored, dateKey) ?? createLifeSnapshot(dateKey) : createLifeSnapshot(dateKey);
}

export function saveLifeSnapshot(snapshot: LifeSnapshot, expectedRevision?: number) {
  try {
    if (expectedRevision !== undefined) {
      const stored = localStorage.getItem(LIFE_STORAGE_KEY);
      const storedRevision = readLifeSnapshotRevision();
      // Malformed storage fails closed rather than allowing a stale tab to
      // replace it. Missing storage is the valid initial revision.
      const currentRevision = stored === null ? 0 : storedRevision;
      if (currentRevision !== expectedRevision) return false;
    }
    const serialized = JSON.stringify(compactSnapshotForStorage(snapshot));
    localStorage.setItem(LIFE_STORAGE_KEY, serialized);
    return true;
  } catch { return false; }
}

export function clearLifeStorage() {
  localStorage.removeItem(LIFE_STORAGE_KEY);
  localStorage.removeItem(LEGACY_LIFE_STORAGE_KEY);
  localStorage.removeItem(OLDEST_LIFE_STORAGE_KEY);
}
