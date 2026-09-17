import type { LifeContext, LifeDocument, LifeRoute } from "../../domain/life-model";
import { selectUnresolvedCaptures, type NowRecommendation } from "../../domain/life-selectors";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { freshReference } from "../../app/conversationContext";
import type { CalendarEvent } from "../day-planner/model";
import type { EntityEditor, EntityViewIntent } from "./entityView";

type ViewPlan = { status: "ready"; id: string; title: string; route?: LifeRoute; planId?: string; calendarEvent?: CalendarEvent; editor?: Omit<EntityEditor, "session"> }
  | { status: "clarification"; title: string; detail: string };
const same = (a: string, b: string) => a.normalize("NFKC").toLocaleLowerCase() === b.normalize("NFKC").toLocaleLowerCase();

/** A read-only projection of existing identities. It never creates entities,
 * infers missing reservations, or changes a document. */
export function planEntityView(intent: Extract<EntityViewIntent, { type: "entity-view" }>, document: LifeDocument, context: LifeContext, recommendations: NowRecommendation[]): ViewPlan {
  const { kind, target } = intent;
  const records = kind === "capture" ? selectUnresolvedCaptures(document) : kind === "step" ? document.steps
    : kind === "commitment" ? document.commitments : recommendations;
  const contextual = freshReference(context, kind === "capture" ? ["capture"] : kind === "step" ? ["plan-step"] : kind === "commitment" ? ["commitment"] : ["capture", "plan-step", "commitment"]);
  let matches = [...records];
  if ("id" in target) matches = matches.filter(({ id }) => id === target.id);
  else if ("ordinal" in target) {
    if (kind === "step" && context.activePlanId) {
      const plan = document.plans.find(({ id }) => id === context.activePlanId);
      matches = (plan?.stepIds ?? []).flatMap((id) => records.filter((record) => record.id === id));
    }
    matches = matches.slice(target.ordinal - 1, target.ordinal);
  } else if ("contextual" in target) matches = matches.filter(({ id }) => id === contextual?.id);
  else {
    if (kind === "commitment" && target.person) {
      const personIds = document.people.filter(({ name }) => same(name, target.person!)).map(({ id }) => id);
      matches = matches.filter((record) => "personId" in record && personIds.includes(record.personId));
    }
    const exact = matches.filter(({ title }) => same(title, target.query));
    matches = exact.length ? exact : matches.filter(({ title }) => title.toLocaleLowerCase().includes(target.query.toLocaleLowerCase()));
  }
  if (matches.length !== 1) return { status: "clarification", title: `Which ${kind}?`, detail: matches.slice(0, 3).map((item) => {
    const person = "personId" in item ? document.people.find(({ id }) => id === item.personId)?.name : undefined;
    return `${item.title}${person ? ` · ${person}` : ""} (${item.id})`;
  }).join(" · ") || `Name an existing ${kind}, or select one first. Nothing changed.` };
  const record = matches[0]!;
  const source = kind === "recommendation" ? recommendations.find(({ id }) => id === record.id)!.source : kind === "step" ? "plan-step" : kind;
  const sourceRecord = source === "capture" ? document.captures.find(({ id }) => id === record.id)
    : source === "commitment" ? document.commitments.find(({ id }) => id === record.id) : document.steps.find(({ id }) => id === record.id);
  if (!sourceRecord) return { status: "clarification", title: "That recommendation's source is no longer available", detail: "Nothing was selected or created. Ask for current recommendations." };
  const step = source === "plan-step" ? document.steps.find(({ id }) => id === record.id) : undefined;
  const planId = step?.planId;
  if (step && !document.plans.some(({ id }) => id === planId)) return { status: "clarification", title: "That step's outcome is unavailable", detail: "No data changed." };
  const link = kind === "step" && intent.operation !== "edit" ? document.links.find(({ type, fromId }) => type === "step-scheduled-as-event" && fromId === record.id) : undefined;
  const calendarEvent = link ? allCalendarEvents(document).find(({ id }) => id === link.toId) : undefined;
  if ((link || intent.inToday) && !calendarEvent) return { status: "clarification", title: "That step has no available Calendar reservation", detail: "The step was not scheduled or changed." };
  const route = kind === "recommendation" && intent.operation === "select" ? undefined : calendarEvent ? "today" : source === "capture" ? "inbox" : source === "commitment" ? "people" : "plans";
  return { status: "ready", id: record.id, title: sourceRecord.title, route, planId, calendarEvent,
    ...(intent.operation === "edit" && (kind === "capture" || kind === "step") ? { editor: { kind, id: record.id } } : {}) };
}
