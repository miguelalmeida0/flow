import { useOptionalFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import type { CalendarEvent } from "../day-planner/model";
import type { Person } from "../../domain/life-model";
import { PersonAvatar } from "./PersonAvatar";
import { personLabel } from "./people";

export function ParticipantBadges({ event, people }: { event: CalendarEvent; people: readonly Person[] }) {
  const participants = people.filter(({ id }) => event.participantIds?.includes(id));
  if (!participants.length) return null;
  return <span className="inline-flex items-center gap-1" aria-label={`With ${participants.map(personLabel).join(", ")}`} data-calendar-participants={participants.map(({ id }) => id).join(",")}><span className="inline-flex -space-x-2">{participants.slice(0, 3).map((person) => <PersonAvatar key={person.id} person={person} small />)}</span>{participants.length > 3 && <span className="text-[10px]">+{participants.length - 3}</span>}</span>;
}
export function CalendarParticipants({ event }: { event: CalendarEvent }) {
  const environment = useOptionalFlowEnvironment();
  return <ParticipantBadges event={event} people={environment?.document.people ?? []} />;
}
