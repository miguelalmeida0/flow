import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { HomeDomainCard } from "../voice-home/HomeDomainCard";
import { PersonAvatar } from "./PersonAvatar";
import { personLabel } from "./people";

export function FriendsPreview() {
  const { document } = useFlowEnvironment();
  const people = document.people.filter(({ archived }) => !archived).slice(0, 3);
  return <HomeDomainCard destination="people" eyebrow="Your people" icon="people" title="Friends">
    <div className="space-y-4">{people.map((person) => {
      const message = document.friends?.messages.filter(({ recipient }) => recipient.kind === "person" && recipient.id === person.id).at(-1);
      const open = document.commitments.filter(({ personId, status }) => personId === person.id && status !== "completed");
      return <div className="flex items-center gap-3" data-life-entity-id={person.id} key={person.id}><PersonAvatar person={person} small /><div className="min-w-0"><p className="text-sm font-medium text-flow-ink">{personLabel(person)}</p><p className="mt-1 truncate text-xs text-flow-secondary">{message ? message.body || "Voice note draft" : open[0]?.title ?? "No recent activity"}</p></div></div>;
    })}</div>
    {!people.length && <div className="grid min-h-[150px] place-items-center rounded-[22px] bg-[#F1E9DC] px-5 text-center"><div><p className="font-serif text-2xl text-flow-ink">No friends yet.</p><p className="mt-2 text-sm leading-6 text-flow-secondary">Add someone you know to begin.</p></div></div>}
  </HomeDomainCard>;
}
