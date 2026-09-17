import type { CalendarRequest, ChangeRecord, DayPlan, TransactionSource } from "./model";
import type { EngineResult } from "./planner";

export interface TransactionClock {
  now: () => Date;
  createId?: () => string;
}

export function createTransactionMetadata(clock: TransactionClock, sequence: number) {
  const timestamp = clock.now();
  return {
    transactionId: clock.createId?.()
      ?? globalThis.crypto?.randomUUID?.()
      ?? `flow-${timestamp.getTime().toString(36)}-${sequence.toString(36)}`,
    timestamp: timestamp.toISOString(),
  };
}

export function createTransactionRecord(
  clock: TransactionClock,
  sequence: number,
  request: CalendarRequest,
  result: Extract<EngineResult, { status: "success" }>,
  source: TransactionSource,
  before: DayPlan,
): ChangeRecord {
  return {
    ...createTransactionMetadata(clock, sequence),
    summary: result.summary,
    detail: result.detail,
    transcript: request.transcript,
    source,
    actions: result.executedActions,
    before,
    after: result.plan,
  };
}

export function plansEqual(left: DayPlan, right: DayPlan) {
  return JSON.stringify(left) === JSON.stringify(right);
}
