import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import type { Commitment } from "../../domain/life-model";
import { WorldPageShell, warmButton, warmCard, warmField, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { primaryWorldUiActions } from "../../shared/command/uiActionDescriptors";
import { formatTime } from "../day-planner/time";
import { commitmentLenses, visibleCommitments } from "./commitmentView";
import { FriendsSpace } from "../friends/FriendsSpace";

function due(commitment: Commitment, now: Date) {
  if (commitment.status === "deferred") return `Deferred until ${commitment.deferredUntil}`;
  if (!commitment.dueAt) return commitment.direction === "waiting-on" ? "Waiting · no deadline" : "No due date";
  const days = Math.ceil((new Date(commitment.dueAt).getTime() - now.getTime()) / 86_400_000);
  return days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

export function PeopleSpace() {
  const { document, snapshot, peopleView, commitmentView, dispatchCommitmentView, dispatchEntityView, navigate, focusedEntityId, runCommand, currentTime } = useFlowEnvironment();
  const focusEntity = (id: string) => dispatchEntityView({ type: "entity-view", kind: "commitment", operation: "select", target: { id } });
  const [draft, setDraft] = useState("");
  const { search, lens } = commitmentView;
  function submit(event: FormEvent) { event.preventDefault(); if (!draft.trim()) return; runCommand(draft.trim(), "type"); setDraft(""); }
  const commitments = visibleCommitments(document, commitmentView);
  const transactionKept = document.commitments.find((commitment) => commitment.status === "completed"
    && (snapshot.lastTransaction?.rewardFactType === "commitment-kept"
      || (snapshot.lastTransaction?.before?.commitments.find(({ id }) => id === commitment.id)?.status !== "completed"
        && snapshot.lastTransaction?.after?.commitments.find(({ id }) => id === commitment.id)?.status === "completed")));
  // A kept promise remains a useful relationship fact after the ceremony has
  // settled or the page has reloaded. Prefer the current transaction, then the
  // most recently updated completed commitment.
  const recentlyKept = transactionKept ?? [...document.commitments]
    .filter(({ status }) => status === "completed")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  function reservation(commitment: Commitment) {
    const link = document.links.find(({ type, fromId }) => type === "commitment-reserved-by-event" && fromId === commitment.id);
    const event = link && Object.values(document.calendars).flatMap(({ events }) => events).find(({ id }) => id === link.toId);
    if (!event) return undefined;
    return `Today · ${event.dateKey} ${formatTime(event.start)}`;
  }
  function relatedPlan(commitment: Commitment) {
    const link = document.links.find(({ type, fromId }) => type === "commitment-about-plan" && fromId === commitment.id);
    return link ? document.plans.find(({ id }) => id === link.toId) : undefined;
  }
  const action = <div className="flex rounded-full border border-[#DED7D0] bg-white p-1"><button data-action-id="people.view" aria-pressed={peopleView === "default"} className={`min-h-10 rounded-full px-4 text-sm ${peopleView === "default" ? "bg-flow-ink text-white" : "text-[#52606D]"}`} data-flow-action="Open People" onClick={() => navigate("people", undefined, false, "default")} type="button">Friends</button><button data-action-id="people.view" aria-pressed={peopleView === "commitments"} className={`min-h-10 rounded-full px-4 text-sm ${peopleView === "commitments" ? "bg-flow-ink text-white" : "text-[#52606D]"}`} data-flow-action="Open Commitments" onClick={() => navigate("people", undefined, false, "commitments")} type="button">Commitments</button></div>;
  if (peopleView === "default") return <FriendsSpace />;

  return <WorldPageShell destination="people" action={action} description="What you owe, what you are waiting on, and what belongs in the next conversation." eyebrow={`${commitments.length} visible`} testId="people-space" title="Commitments">
    <form className={`${warmCard} flex gap-2 p-2`} onSubmit={submit}><input data-action-id="commitments.create" aria-label="Add a commitment" className={warmField} data-flow-action="Commitment text" onChange={(event) => setDraft(event.target.value)} placeholder="I promised Maya the proposal by Friday" value={draft}/><button data-action-id="commitments.create" className={warmButton} data-flow-action="Add commitment" type="submit">Add</button></form>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-between"><div className="flex flex-wrap gap-1" role="group" aria-label="Commitment lenses">{commitmentLenses.map(([value,label]) => <button data-action-id="commitments.filter" aria-pressed={lens === value} className={lens === value ? warmButton : warmQuietButton} data-flow-action="Filter commitments" key={value} onClick={() => dispatchCommitmentView({ lens: value })} type="button">{label}</button>)}</div><input data-action-id="commitments.search" aria-label="Search commitments" className={`${warmField} sm:max-w-xs`} data-flow-action="Search commitments" onChange={(event) => dispatchCommitmentView({ search: event.target.value })} placeholder="Search person or promise" value={search}/></div>
    <div className="mt-6 grid gap-3" role="list">{recentlyKept && lens !== "completed" && <motion.article className={`${warmCard} flex items-center justify-between border-flow-green/40 bg-flow-green-soft p-5`} data-commitment-id={recentlyKept.id} data-life-entity-id={recentlyKept.id} layout role="listitem"><span><span className="text-xs font-semibold uppercase tracking-[0.14em] text-flow-green-strong">Promise kept</span><span className="mt-1 block text-base">{recentlyKept.title}</span><span className="mt-1 block text-xs text-flow-secondary">With {document.people.find(({ id }) => id === recentlyKept.personId)?.name ?? "this person"} · relationship preserved</span></span><span aria-hidden className="grid size-9 place-items-center rounded-full bg-white text-flow-green-strong">✓</span></motion.article>}{commitments.map((commitment) => {
      const person = document.people.find(({ id }) => id === commitment.personId);
      const plan = relatedPlan(commitment);
      const relation = commitment.direction === "i-owe" || commitment.direction === "mine" ? "You owe" : commitment.direction === "next-conversation" ? "Next conversation" : "Waiting on";
      const completeAction = primaryWorldUiActions.commitments.complete(commitment.title, person?.name ?? "this person");
      return <motion.article className={`${warmCard} flex flex-col gap-4 p-5 sm:flex-row sm:items-center ${focusedEntityId === commitment.id ? "border-flow-blue ring-2 ring-flow-blue/10" : ""}`} data-commitment-id={commitment.id} data-life-entity-id={commitment.id} key={commitment.id} layout role="listitem"><button data-action-id="commitments.select" className="min-h-11 min-w-0 flex-1 text-left" data-flow-action="Select commitment" onClick={() => focusEntity(commitment.id)} type="button"><span className="text-xs font-semibold text-[#4D91F5]">{relation} · {person?.name}</span><span className="mt-1 block text-base">{commitment.title}</span><span className="mt-1 block text-xs text-flow-secondary">{due(commitment, currentTime)}</span>{plan && <span className="mt-2 block text-xs font-medium text-[#245D9C]">Plan · {plan.title}</span>}{reservation(commitment) && <span className="mt-1 block text-xs font-medium text-[#245D9C]">{reservation(commitment)}</span>}</button>{commitment.status !== "completed" && <div className="flex flex-wrap gap-1"><button data-action-id="commitments.complete" className={warmQuietButton} data-flow-action={completeAction.label} onClick={() => { focusEntity(commitment.id); runCommand(completeAction.phrase, "quick"); }} type="button">Complete</button><button data-action-id="commitments.defer" className={warmQuietButton} data-flow-action="Defer commitment" onClick={() => { focusEntity(commitment.id); runCommand(`Defer ${commitment.title} commitment with ${person?.name} until Friday`, "quick"); }} type="button">Defer</button><button data-action-id="commitments.delete" className="min-h-11 rounded-full px-4 text-sm text-[#C75151] hover:bg-[#FFF0EE]" data-flow-action="Delete commitment" onClick={() => { focusEntity(commitment.id); runCommand(`Delete ${commitment.title} promise to ${person?.name}`, "quick"); }} type="button">Delete</button></div>}</motion.article>;
    })}{!commitments.length && <div className={`${warmCard} p-10 text-center`}><p className="font-serif text-3xl">No commitments match.</p><p className="mt-3 text-sm text-flow-secondary">Nothing was invented. Change the lens or add a clear promise.</p></div>}</div>
  </WorldPageShell>;
}
