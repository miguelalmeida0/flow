export interface TurnAuthority {
  sessionId: string;
  turnId: string;
  captureEpoch: number;
  documentRevision: number;
  createdAtMs: number;
}

export const PROPOSAL_AUTHORITY_TTL_MS = 60_000;

export function authorityIsCurrent(authority: TurnAuthority, current: TurnAuthority, nowMs: number): boolean {
  return authority.sessionId === current.sessionId
    && authority.turnId === current.turnId
    && authority.captureEpoch === current.captureEpoch
    && authority.documentRevision === current.documentRevision
    && nowMs >= authority.createdAtMs
    && nowMs - authority.createdAtMs <= PROPOSAL_AUTHORITY_TTL_MS;
}
