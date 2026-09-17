import type { LifeAction } from "../../domain/life-actions";
import type { LifeContext, LifeDocument, TemporalScope } from "../../domain/life-model";
import type { AtmosphereLayer, JournalEntry, MemoryArtifact } from "../../domain/studio-model";
import type { CalendarAction, CalendarEvent } from "../day-planner/model";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import type { StudioState } from "../../domain/studio-model";
import type { CommitmentViewState } from "../people/commitmentView";
import type { StudioRuntimeCommand } from "../studio/studioCommandPlan";

export type SemanticSubset<T> = T extends readonly (infer Item)[] ? SemanticSubset<Item>[]
  : T extends object ? { [Key in keyof T]?: SemanticSubset<T[Key]> } : T;

export interface SemanticExpectation {
  historyDelta: number;
  feedbackPhase?: "completed" | "clarification" | "confirmation" | "error";
  feedback?: { title?: string; detail?: string };
  resultEntityIds?: string[];
  /** Actual production reference resolution compared with independently named IDs. */
  targetIds?: string[];
  commitCount?: number;
  runtimeCommands?: StudioRuntimeCommand[];
  sessionRequests?: Array<"start" | "sleep">;
  contextAfter?: SemanticSubset<LifeContext>;
  absentContextFields?: Array<keyof LifeContext>;
  queryResult?: object;
  queryWindow?: { dateKey: string; start: number; end: number; minutes: number; currentEventId?: string };
  documentState?: Partial<Pick<LifeDocument, "focus" | "instinctState">>;
  /** Explicit ambient projection before the user transaction, never prefilled
   * to hide a missing production exposure callback. */
  ambientExposure?: LifeDocument["instinctState"];
  viewport?: { height: number; scrollHeight: number; beforeTop: number; afterTop: number };
  intent?: SemanticSubset<GlobalIntent>;
  absentIntentFields?: string[];
  calendarActionTypes?: CalendarAction["type"][];
  actions?: SemanticSubset<LifeAction>[];
  pendingActions?: SemanticSubset<LifeAction>[];
  noPending?: boolean;
  scope?: TemporalScope;
  commitmentView?: CommitmentViewState;
  eventChanges?: { id: string; patch: Partial<CalendarEvent> }[];
  /** Complete independently declared new records, including identity/defaults. */
  calendarInsertions?: CalendarEvent[];
  journalChanges?: { id: string; patch: Partial<JournalEntry> }[];
  memoryChanges?: { id: string; patch: Partial<MemoryArtifact> }[];
  layerChanges?: { id: string; patch: Partial<AtmosphereLayer> }[];
  /** Independently declared complete replacement collections, for creation,
   * deletion and linked actions. Never populated from observed output. */
  collections?: Partial<Pick<LifeDocument, "captures" | "plans" | "steps" | "people" | "commitments" | "links">>;
  studioCollections?: Partial<Pick<StudioState, "journalEntries" | "memories" | "mediaAssets" | "atmospherePresets" | "rituals">>;
  studioState?: Partial<Pick<StudioState, "workspace" | "activeAtmosphere">>;
  datedEventChanges?: { id: string; sourceDate: string; destinationDate?: string; patch: Partial<CalendarEvent> }[];
  /** Every other field in the complete document must equal the fixture. */
  noCreation?: boolean;
}

/** This is an independent field oracle, not a second invocation of the planner
 * or transaction engine under test. In particular, it never reads actualAfter. */
export function expectedDocument(before: LifeDocument, expected: SemanticExpectation, at: string): LifeDocument {
  const document = structuredClone(before);
  if (expected.documentState) Object.assign(document, structuredClone(expected.documentState));
  if (expected.collections) Object.assign(document, structuredClone(expected.collections));
  if (expected.studioCollections) Object.assign(document.studio, structuredClone(expected.studioCollections));
  if (expected.studioState) Object.assign(document.studio, structuredClone(expected.studioState));
  for (const event of expected.calendarInsertions ?? []) {
    if (Object.values(document.calendars).some((day) => [...day.events, ...day.deferred].some(({ id }) => id === event.id))) throw new Error(`Insertion reuses a fixture identity: ${event.id}`);
    const day = document.calendars[event.dateKey] ?? { dateKey: event.dateKey, events: [], deferred: [], breathingRooms: [] };
    day.events.push(structuredClone(event));
    day.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    document.calendars[event.dateKey] = day;
  }
  if (expected.calendarInsertions?.length) document.calendar = structuredClone(document.calendars[document.calendar.dateKey]!);
  for (const change of expected.eventChanges ?? []) {
    const event = document.calendar.events.find(({ id }) => id === change.id);
    if (!event) throw new Error(`Undeclared fixture event: ${change.id}`);
    Object.assign(event, change.patch);
  }
  if (expected.eventChanges?.length) {
    document.calendar.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    document.calendars[document.calendar.dateKey] = structuredClone(document.calendar);
  }
  for (const change of expected.datedEventChanges ?? []) {
    const source = document.calendars[change.sourceDate];
    const event = source?.events.find(({ id }) => id === change.id);
    if (!event) throw new Error(`Undeclared dated fixture event: ${change.sourceDate}/${change.id}`);
    const destinationDate = change.destinationDate ?? change.sourceDate;
    source!.events = source!.events.filter(({ id }) => id !== change.id);
    const destination = document.calendars[destinationDate] ?? { dateKey: destinationDate, events: [], deferred: [], breathingRooms: [] };
    destination.events.push({ ...event, ...change.patch, dateKey: destinationDate });
    destination.events.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    document.calendars[destinationDate] = destination;
    document.calendar = structuredClone(document.calendars[document.calendar.dateKey]!);
  }
  for (const change of expected.journalChanges ?? []) {
    const entry = document.studio.journalEntries.find(({ id }) => id === change.id);
    if (!entry) throw new Error(`Undeclared fixture Journal: ${change.id}`);
    Object.assign(entry, change.patch, { updatedAt: at });
  }
  for (const change of expected.memoryChanges ?? []) {
    const memory = document.studio.memories.find(({ id }) => id === change.id);
    if (!memory) throw new Error(`Undeclared fixture Memory: ${change.id}`);
    Object.assign(memory, change.patch, { updatedAt: at });
  }
  for (const change of expected.layerChanges ?? []) {
    const layer = document.studio.activeAtmosphere?.layers.find(({ id }) => id === change.id);
    if (!layer) throw new Error(`Undeclared fixture Atmosphere layer: ${change.id}`);
    Object.assign(layer, change.patch);
  }
  if (expected.scope) {
    const dateKey = expected.scope.dateKey;
    const viewed = document.calendars[dateKey] ?? { dateKey, events: [], deferred: [], breathingRooms: [] };
    document.calendars[dateKey] = structuredClone(viewed);
    document.calendar = structuredClone(viewed);
  }
  return document;
}

export function entityIdentityInventory(document: LifeDocument) {
  return {
    // A multiset, not a Set: duplication must still fail, while moving the
    // same stable identity to a different date is not entity creation.
    calendar: Object.values(document.calendars).flatMap((day) => [...day.events, ...day.deferred].map(({ id }) => id)).sort(),
    captures: document.captures.map(({ id }) => id), plans: document.plans.map(({ id }) => id),
    steps: document.steps.map(({ id }) => id), commitments: document.commitments.map(({ id }) => id), people: document.people.map(({ id }) => id),
    journal: document.studio.journalEntries.map(({ id }) => id), memories: document.studio.memories.map(({ id }) => id),
    media: document.studio.mediaAssets.map(({ id }) => id), presets: document.studio.atmospherePresets.map(({ id }) => id), rituals: document.studio.rituals.map(({ id }) => id),
    links: document.links.map(({ id }) => id),
  };
}
