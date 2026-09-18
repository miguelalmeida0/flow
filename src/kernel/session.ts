import type { LifeEntityId, LifeEntityKind } from "../domain/life-model";
import type { Plan } from "./planner";
import type { ClarificationRequest } from "./clarification";
import type { Proposal } from "./proposals";

/**
 * A reference to something the conversation has talked about — the entity
 * "it"/"that"/"her" can resolve to. This is Flow's ONE authoritative referent
 * shape: legacy's own conversation context (ConversationEntityReference in
 * life-model.ts) and the kernel's recall/desktop results both normalize into
 * this same structure at the app-layer boundary (see
 * src/app/kernelReferentBridge.ts) rather than keeping separate stores that
 * can drift.
 *
 * `id`/`kind` cover a real domain entity (a LifeEntityId + LifeEntityKind,
 * the case legacy already understands). `kind` additionally allows
 * "desktop-file" and "search-hit" for referents that have no LifeEntityId at
 * all (an opened file, an Earmark/memory-fact recall result) — legacy has no
 * slot for those and simply won't resolve pronouns pointing at them, which
 * is correct rather than a gap: the kernel is the only side that understands
 * them.
 */
export interface EntityReference {
  id: string;
  kind: LifeEntityKind | "desktop-file" | "search-hit";
  label?: string;
  /** Epoch ms this referent became current — comparable with legacy's
   * ConversationEntityReference.at, so whichever side acted most recently
   * wins when the two are merged. */
  at?: number;
  /** Recall's SearchDomain, when this referent came from search.ts. */
  domain?: string;
  audioTimestamp?: { recordingId: string; atMs: number; endAtMs?: number; confidence?: "exact" | "estimated" };
  desktopPath?: string;
  personIds?: LifeEntityId[];
}

export interface RecentResult {
  description: string;
  entityId?: LifeEntityId;
  entityKind?: LifeEntityKind;
  capabilityId: string;
  timestamp: string;
}

/** First-class conversation session. While a session is active the user
 * never needs to re-say a wake word — every subsequent utterance is
 * interpreted against this state. */
export interface ConversationSession {
  id: string;
  turn: number;
  topic?: string;
  /** Referents available for "it"/"that"/"her"/"the first one" resolution. */
  referents: {
    selected?: EntityReference;
    lastMentioned?: EntityReference;
    lastCreated?: EntityReference;
    person?: EntityReference;
    lastSearchResults?: EntityReference[];
  };
  activeProposal?: Proposal;
  pendingClarification?: ClarificationRequest;
  /** The plan a pending clarification or proposal belongs to, so answering it resumes rather than restarts. */
  pendingPlan?: Plan;
  recentResults: RecentResult[];
}

export function createSession(id = "session-1"): ConversationSession {
  return { id, turn: 0, referents: {}, recentResults: [] };
}

export function rememberResult(session: ConversationSession, result: RecentResult): ConversationSession {
  const referents = { ...session.referents };
  if (result.entityId && result.entityKind) {
    const ref: EntityReference = { id: result.entityId, kind: result.entityKind };
    referents.lastMentioned = ref;
    referents.selected = ref;
    if (result.entityKind === "person") referents.person = ref;
  }
  return { ...session, turn: session.turn + 1, referents, recentResults: [...session.recentResults, result].slice(-20) };
}

/** An interruption ("wait", "stop", "cancel") must not corrupt earlier state —
 * it only clears the in-flight proposal/clarification/plan. */
export function clearInFlight(session: ConversationSession): ConversationSession {
  return { ...session, activeProposal: undefined, pendingClarification: undefined, pendingPlan: undefined };
}
