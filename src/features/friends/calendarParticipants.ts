import type { CalendarRequest, EventSelector } from "../day-planner/model";
import type { Person } from "../../domain/life-model";
import { personLabel, resolvePeople } from "./people";

type Result = { request: CalendarRequest } | { question: string; detail: string; query: string };
export function bindCalendarParticipants(request: CalendarRequest, people: readonly Person[]): Result {
  let problem: { question: string; detail: string; query: string } | undefined;
  function reference(value: string) {
    const withPerson = value.match(/^(.*?)\s+with\s+(.+)$/i);
    const possessive = value.match(/^(.+?)['’]s\s+(meeting|appointment|call|lunch|dinner|coffee)$/i);
    if (!withPerson && !possessive) return undefined;
    const query = withPerson?.[2] ?? possessive![1]!;
    const matches = resolvePeople(people, query);
    // Unknown words after “with” may be literal title content (coffee with milk).
    // Only canonical people grant participant semantics; contact creation stays explicit.
    if (!matches.length) return undefined;
    if (matches.length !== 1) {
      problem = { query, question: matches.length ? `Which ${query} do you mean?` : `Who is ${query}?`, detail: matches.length ? matches.slice(0, 3).map(personLabel).join(" · ") : "Add that person to Friends first. Nothing changed." };
      return undefined;
    }
    return { title: withPerson?.[1] ?? possessive![2]!, personId: matches[0]!.id };
  }
  function selector(value: EventSelector): EventSelector {
    if (value.type === "multi") return { ...value, selectors: value.selectors.map(selector) };
    if (value.type === "relativeEvent") return { ...value, anchor: selector(value.anchor) };
    if (value.type === "source" && value.literalQuery) return value;
    if (!("query" in value) || !value.query) return value;
    const bound = reference(value.query);
    if (!bound) return value;
    const generic = /^(?:my |the )?(?:meeting|appointment|call|event)$/i.test(bound.title);
    return value.type === "title" ? generic ? { type: "source", date: value.date, participantIds: [bound.personId] } : { ...value, query: bound.title, participantIds: [bound.personId] }
      : { ...value, query: generic ? undefined : bound.title, participantIds: [bound.personId] };
  }
  const result: CalendarRequest = { ...request, actions: request.actions.map((action) => {
    if ((action.type === "create" || action.type === "fit") && !action.literalTitle && !action.participantIds?.length) {
      const bound = reference(action.title);
      return bound ? { ...action, participantIds: [bound.personId] } : action;
    }
    return "selector" in action ? { ...action, selector: selector(action.selector) } : action;
  }), constraints: request.constraints.map((constraint) => ({ ...constraint, selector: selector(constraint.selector) })) };
  return problem ?? { request: result };
}
