import type { LifeDocument, LifeEntityId, LifeEntityKind, LifeRoute } from "../domain/life-model";

/**
 * The Flow Kernel represents every meaningful thing Flow can do as a Capability.
 * The conversational layer (planner/session) chooses capabilities; the kernel
 * executes them against real domain state; the UI renders results. See
 * src/kernel/README-shaped documentation in the sprint report for the full
 * architecture rationale.
 */

export type RiskLevel = "low" | "medium" | "high";

export interface NavigationState {
  route: LifeRoute;
  previousRoute?: LifeRoute;
}

export interface KernelClock {
  now(): Date;
}

/** A user-approved durable fact, distinct from ephemeral conversation context
 * or session-only state. Explicit unless the kernel ever infers one (it
 * currently never does — see memoryStore.ts). */
export interface PersonalMemoryFact {
  id: string;
  text: string;
  subjectPersonId?: LifeEntityId;
  createdAt: string;
  source: "explicit" | "inferred";
}

/** One universal mutation record. Every capability that mutates records a
 * before/after snapshot here instead of inventing its own undo semantics —
 * see history.ts. */
export interface MutationHistoryEntry {
  id: string;
  capabilityId: string;
  description: string;
  timestamp: string;
  before: { document: LifeDocument; navigation: NavigationState; memory: PersonalMemoryFact[] };
  after: { document: LifeDocument; navigation: NavigationState; memory: PersonalMemoryFact[] };
}

/** Everything a capability is allowed to read while validating/executing. */
export interface CapabilityContext {
  document: LifeDocument;
  navigation: NavigationState;
  memory: PersonalMemoryFact[];
  /** Full mutation log, oldest first, for system.undo/redo/whatChanged. */
  history: MutationHistoryEntry[];
  /** Index (within `history`) of the last-applied entry; entries after it are redo-able. */
  historyPointer: number;
  clock: KernelClock;
}

/** Everything a capability is allowed to change. Executors return the next
 * state rather than mutating in place, so the kernel can snapshot before/after
 * for undo without every domain reinventing its own undo semantics. */
export interface CapabilityMutation {
  document?: LifeDocument;
  navigation?: NavigationState;
  memory?: PersonalMemoryFact[];
}

export interface PreflightAlternative {
  /** Short, speakable label, e.g. "8:30". */
  label: string;
  /** Full sentence Flow can say/show, e.g. "Move dinner to 8:30 instead?" */
  description: string;
  /** Replacement arguments that resolve the conflict if the user accepts this alternative. */
  args: Record<string, unknown>;
}

export interface PreflightConflict {
  code: string;
  message: string;
  withEntityId?: LifeEntityId;
}

export interface PreflightWarning {
  code: string;
  message: string;
}

export interface PreflightResult {
  /** True when the capability must not execute until the user resolves this. */
  blocking: boolean;
  conflicts: PreflightConflict[];
  warnings: PreflightWarning[];
  alternatives: PreflightAlternative[];
  dependencies: LifeEntityId[];
}

export function emptyPreflight(): PreflightResult {
  return { blocking: false, conflicts: [], warnings: [], alternatives: [], dependencies: [] };
}

export interface CapabilityFailure {
  status: "error";
  code: string;
  message: string;
}

export interface CapabilitySuccess {
  status: "ok";
  /** Human-readable, past-tense description for history/"what changed", e.g. "Moved Dinner from 7 PM to 8:30 PM." */
  description: string;
  mutation: CapabilityMutation;
  entityId?: LifeEntityId;
  entityKind?: LifeEntityKind;
  data?: unknown;
}

export type CapabilityResult = CapabilitySuccess | CapabilityFailure;

export function ok(description: string, mutation: CapabilityMutation = {}, extra?: Partial<Pick<CapabilitySuccess, "entityId" | "entityKind" | "data">>): CapabilitySuccess {
  return { status: "ok", description, mutation, ...extra };
}

export function fail(code: string, message: string): CapabilityFailure {
  return { status: "error", code, message };
}

export interface Capability<Args = Record<string, unknown>> {
  id: string;
  domain: string;
  description: string;
  /** Whether executing this capability changes state (vs. a pure query). */
  mutates: boolean;
  /** Whether a successful mutation can be reverted by system.undo. */
  undoable: boolean;
  riskLevel: RiskLevel;
  /** Static confirmation requirement independent of preflight, e.g. destructive deletes. */
  requiresConfirmation: (args: Args, ctx: CapabilityContext) => boolean;
  /** Returns an error message if arguments are structurally invalid/incomplete, else null. */
  validate: (args: Args, ctx: CapabilityContext) => string | null;
  /** Consequence inspection: conflicts, warnings, alternatives, dependencies. */
  preflight?: (args: Args, ctx: CapabilityContext) => PreflightResult;
  execute: (args: Args, ctx: CapabilityContext) => CapabilityResult;
}
