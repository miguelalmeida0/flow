import { applyLifeTransaction } from "../../domain/life-transaction";
import type { Plan } from "../../domain/life-model";
import { fail, ok, type Capability, type CapabilityResult } from "../types";

function findPlan(plans: Plan[], query: { planId?: string; title?: string }): Plan | undefined {
  if (query.planId) return plans.find((plan) => plan.id === query.planId);
  if (query.title) return plans.find((plan) => plan.title.toLowerCase().includes(query.title!.toLowerCase()));
  return undefined;
}

let sequence = 0;
function nextId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${sequence}`;
}

export interface PlansCreateArgs {
  title: string;
  outcome: string;
  dueAt?: string;
}

export interface PlansUpdateArgs {
  planId?: string;
  title?: string;
  patch: Partial<Pick<Plan, "title" | "outcome" | "status" | "dueAt">>;
}

export interface PlansQueryArgs {
  status?: Plan["status"];
}

export const plansCreate: Capability<PlansCreateArgs> = {
  id: "plans.create",
  domain: "plans",
  description: "Create a new plan.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.title ? "Needs a title." : !args.outcome ? "Needs an outcome." : null),
  execute: (args, ctx): CapabilityResult => {
    const now = ctx.clock.now().toISOString();
    const plan: Plan = { id: nextId("plan"), kind: "plan", title: args.title, outcome: args.outcome, status: "active", dueAt: args.dueAt, stepIds: [], createdAt: now, updatedAt: now };
    const result = applyLifeTransaction(ctx.document, [{ type: "plan.create", plan }], ctx.clock.now);
    if (result.status !== "success") return fail("plans-create-failed", result.detail);
    return ok(`Created plan "${plan.title}".`, { document: result.document }, { entityId: plan.id, entityKind: "plan" });
  },
};

export const plansUpdate: Capability<PlansUpdateArgs> = {
  id: "plans.update",
  domain: "plans",
  description: "Update an existing plan.",
  mutates: true,
  undoable: true,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.planId && !args.title ? "Say which plan." : null),
  execute: (args, ctx): CapabilityResult => {
    const plan = findPlan(ctx.document.plans, args);
    if (!plan) return fail("not-found", "Couldn't find that plan.");
    const result = applyLifeTransaction(ctx.document, [{ type: "plan.update", planId: plan.id, patch: args.patch }], ctx.clock.now);
    if (result.status !== "success") return fail("plans-update-failed", result.detail);
    return ok(`Updated plan "${plan.title}".`, { document: result.document }, { entityId: plan.id, entityKind: "plan" });
  },
};

export const plansQuery: Capability<PlansQueryArgs> = {
  id: "plans.query",
  domain: "plans",
  description: "List plans.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const plans = args.status ? ctx.document.plans.filter((plan) => plan.status === args.status) : ctx.document.plans;
    return ok(plans.length === 0 ? "No plans found." : `${plans.length} plan${plans.length === 1 ? "" : "s"}.`, {}, { data: plans });
  },
};

export const plansCapabilities = [plansCreate, plansUpdate, plansQuery];
