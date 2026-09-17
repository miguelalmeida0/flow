export type EntityId = string;
export type IsoDateTime = string;

interface BaseEntity {
  id: EntityId;
  title: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface Capture extends BaseEntity {
  kind: "capture";
  status: "unresolved" | "resolved" | "archived";
  source: "voice" | "typed";
}

export interface Plan extends BaseEntity {
  kind: "plan";
  status: "active" | "paused" | "completed";
  dueAt?: IsoDateTime;
  stepIds: EntityId[];
}

export interface PlanStep extends BaseEntity {
  kind: "plan-step";
  planId: EntityId;
  status: "planned" | "scheduled" | "completed";
  estimatedMinutes?: number;
}

export interface Person extends BaseEntity {
  kind: "person";
}

export interface Commitment extends BaseEntity {
  kind: "commitment";
  personId: EntityId;
  direction: "mine" | "theirs";
  status: "open" | "completed" | "waiting";
  dueAt?: IsoDateTime;
}

export type LifeEntity = Capture | Plan | PlanStep | Person | Commitment;

export type EntityLinkType =
  | "capture-origin-of-plan"
  | "step-scheduled-as-event"
  | "commitment-about-plan"
  | "commitment-reserved-by-event";

export interface EntityLink {
  id: EntityId;
  type: EntityLinkType;
  fromId: EntityId;
  toId: EntityId;
  createdAt: IsoDateTime;
}

export type LifeAction =
  | { type: "capture.create"; capture: Capture }
  | { type: "capture.resolve"; captureId: EntityId }
  | { type: "plan.create-from-capture"; captureId: EntityId; plan: Plan }
  | { type: "plan.step.add"; step: PlanStep }
  | { type: "plan.step.complete"; stepId: EntityId }
  | { type: "plan.step.schedule"; stepId: EntityId; calendarEventId: EntityId }
  | { type: "commitment.create"; commitment: Commitment }
  | { type: "commitment.complete"; commitmentId: EntityId }
  | { type: "link.create"; link: EntityLink }
  | { type: "link.remove"; linkId: EntityId }
  | { type: "history.undo" }
  | { type: "history.redo" };
