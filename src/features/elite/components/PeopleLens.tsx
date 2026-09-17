import type { EliteHomeModel } from "../eliteViewModel";
import { HomeLens } from "./HomeLens";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";

function PeopleIcon() {
  return <svg aria-hidden className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 32 32"><circle cx="11" cy="11" r="5" /><circle cx="22" cy="12" r="4" /><path d="M3 27c0-6 3-9 8-9s8 3 8 9M18 20c5-1 9 2 9 7" /></svg>;
}

export function PeopleLens({ model }: { model: EliteHomeModel }) {
  const { runCommand, navigate } = useFlowEnvironment();
  return <HomeLens destination="people" icon={<PeopleIcon />} testId="elite-people-lens" title="People">
    <div className="mt-8 divide-y divide-flow-border">
      {model.people.map((person) => <div className="py-5 first:pt-0" key={person.id}>
        <div className="flex gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#E8E5E0] font-serif text-lg text-flow-ink">{person.name.slice(0, 1)}</span><div className="min-w-0"><p className="text-sm font-medium text-flow-ink">{person.name}</p><p className="mt-1 truncate text-xs text-flow-secondary">{person.detail}</p>{person.time && <p className="mt-1 text-xs text-flow-secondary">{person.time}</p>}</div></div>
        <button data-action-id="people.prepare" className="ml-auto mt-3 block min-h-10 rounded-full bg-flow-neutral-soft px-4 text-xs text-flow-ink transition hover:bg-[#E8E5E0]" data-flow-action="Prepare for person" onClick={() => runCommand(`Prepare me for ${person.name}`, "quick")} type="button">Prepare for {person.name === "Team" ? "this" : "my call"}</button>
      </div>)}
      {!model.people.length && <p className="py-8 text-sm leading-6 text-flow-secondary">No person needs attention in this time scope.</p>}
    </div>
    <button data-action-id="people.view" className="mt-3 min-h-11 w-full rounded-full text-xs text-[#52606D] hover:bg-flow-page" data-flow-action="Open People" onClick={() => navigate("people")} type="button">Open People</button>
  </HomeLens>;
}
