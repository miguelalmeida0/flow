import type { LifeEntityId, LifeEntityKind } from "../domain/life-model";
import type { Plan } from "./planner";
import type { ClarificationRequest } from "./clarification";
import type { Proposal } from "./proposals";

/** A reference to something the conversation has talked about — the entity
 * "it"/"that"/"her" can resolve to. */
export interface EntityReference {
  id: LifeEntityId;
  kind: LifeEntityKind;
  label?: string;
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
