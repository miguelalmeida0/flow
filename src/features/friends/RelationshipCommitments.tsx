import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { formatTime } from "../day-planner/time";

export function RelationshipCommitments({ personId }: { personId?: string }) {
  const { document, dispatchEntityView } = useFlowEnvironment();
  return <section><h2 className="font-serif text-xl">Commitments</h2>{document.commitments.filter((item) => !personId || item.personId === personId).map((item) => {
    const reservation = document.links.find(({ type, fromId }) => type === "commitment-reserved-by-event" && fromId === item.id);
    const event = reservation && allCalendarEvents(document).find(({ id }) => id === reservation.toId);
    const relation = document.links.find(({ type, fromId }) => type === "commitment-about-plan" && fromId === item.id);
    const plan = relation && document.plans.find(({ id }) => id === relation.toId);
    return <button data-action-id="commitments.select" className="mt-3 block min-h-11 text-left text-sm" key={item.id} type="button" onClick={() => dispatchEntityView({ type: "entity-view", kind: "commitment", operation: "select", target: { id: item.id } })}>{item.title}<span className="mt-1 block text-xs text-flow-secondary">{item.direction === "waiting-on" ? "Waiting on" : "You owe"} · {item.status}{!personId ? ` · ${document.people.find(({ id }) => id === item.personId)?.name ?? "Person"}` : ""}</span>{plan && <span className="mt-1 block text-xs text-flow-secondary">Plan · {plan.title}</span>}{event && <span className="mt-1 block text-xs text-flow-secondary">Today · {event.dateKey} {formatTime(event.start)}</span>}</button>;
  })}</section>;
}
