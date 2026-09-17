import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import { WorldPageShell, warmButton, warmCard, warmField, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { primaryWorldUiActions } from "../../shared/command/uiActionDescriptors";
import { formatTime } from "../day-planner/time";
import type { PlanStep } from "../../domain/life-model";

function dueLabel(value?: string) { return value ? `Due ${new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(value))}` : "No due date"; }

export function PlansSpace() {
  const { document, activePlanId, navigate, focusedEntityId, focusEntity, runCommand, entityEditor, dispatchEntityView } = useFlowEnvironment();
  const active = document.plans.find(({ id }) => id === activePlanId);
  const [draft, setDraft] = useState("");
  const [stepDraft, setStepDraft] = useState("");
  function create(event: FormEvent) { event.preventDefault(); if (!draft.trim()) return; runCommand(primaryWorldUiActions.outcomes.create(draft.trim()).phrase, "type"); setDraft(""); }
  function addStep(event: FormEvent) { event.preventDefault(); if (!stepDraft.trim()) return; runCommand(`Add ${stepDraft.trim()} step to this plan`, "type"); setStepDraft(""); }

  if (!active) {
    const action = <form className="flex w-full max-w-xl gap-2" onSubmit={create}><input data-action-id="outcomes.create" aria-label="Create an outcome" className={warmField} data-flow-action="Outcome title" onChange={(event) => setDraft(event.target.value)} placeholder="What do you need to make true?" value={draft}/><button data-action-id="outcomes.create" className={warmButton} data-flow-action="Create outcome" type="submit">Create</button></form>;
    return <WorldPageShell destination="outcomes" action={action} description="Give an intention a path, then let Tide place concrete steps into real time." eyebrow={`${document.plans.filter(({ status }) => status === "active").length} active`} testId="plans-space" title="Outcomes">
      <div className="grid gap-4 md:grid-cols-2">{document.plans.map((plan) => <motion.button data-action-id="outcomes.open" className={`${warmCard} min-h-40 p-6 text-left transition hover:-translate-y-1 hover:border-[#BED4F4]`} data-flow-action="Open outcome" data-life-entity-id={plan.id} key={plan.id} layout onClick={() => navigate("outcomes", plan.id)} type="button"><span className="font-serif text-2xl">{plan.title}</span><span className="mt-6 block text-xs text-flow-secondary">{plan.stepIds.length} steps · {plan.status} · {dueLabel(plan.dueAt)}</span><span className="mt-5 block text-xs font-semibold text-[#4D91F5]">Open outcome →</span></motion.button>)}{!document.plans.length && <div className={`${warmCard} p-10 text-center md:col-span-2`}><p className="font-serif text-3xl">No active outcomes.</p><p className="mt-3 text-sm text-flow-secondary">Create one here or shape a Capture item.</p></div>}</div>
    </WorldPageShell>;
  }

  const steps = active.stepIds.map((id) => document.steps.find((step) => step.id === id)).filter(Boolean);
  return <WorldPageShell destination="outcomes" action={<button data-action-id="outcomes.list" className={warmQuietButton} data-flow-action="All outcomes" onClick={() => navigate("outcomes")} type="button">All outcomes</button>} description={active.outcome} eyebrow={`${active.status} · ${dueLabel(active.dueAt)}`} testId="plan-detail" title={active.title}>
    {active.status === "completed" && <motion.section className={`${warmCard} mb-6 flex items-center justify-between border-flow-green/40 bg-flow-green-soft p-5`} data-life-entity-id={active.id} layout><span><span className="text-xs font-semibold uppercase tracking-[0.14em] text-flow-green-strong">Outcome complete</span><strong className="mt-1 block font-serif text-2xl text-flow-ink">{active.title} is now true.</strong></span><span aria-hidden className="grid size-10 place-items-center rounded-full bg-white text-flow-green-strong">✓</span></motion.section>}
    <div className="flex flex-wrap gap-2" data-testid="outcome-actions">{active.status !== "completed" && <><button data-action-id="outcomes.status" className={warmQuietButton} data-flow-action="Pause or resume outcome" onClick={() => runCommand(`${active.status === "paused" ? "Resume" : "Pause"} this outcome`, "quick")} type="button">{active.status === "paused" ? "Resume" : "Pause"}</button><button data-action-id="outcomes.complete" className={warmQuietButton} data-flow-action={primaryWorldUiActions.outcomes.complete.label} onClick={() => runCommand(primaryWorldUiActions.outcomes.complete.phrase, "quick")} type="button">{primaryWorldUiActions.outcomes.complete.label}</button></>}<button data-action-id="outcomes.delete" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-[#C75151] hover:bg-[#FFF0EE]" data-flow-action="Delete outcome" onClick={() => runCommand("Delete this outcome", "quick")} type="button">Delete outcome</button></div>
    {active.status !== "completed" && <form className={`${warmCard} mt-7 flex gap-2 p-2`} data-testid="outcome-add-step" onSubmit={addStep}><input data-action-id="outcomes.step-add" aria-label="Add an outcome step" className={warmField} data-flow-action="Outcome step title" onChange={(event) => setStepDraft(event.target.value)} placeholder="Add a concrete next step" value={stepDraft}/><button data-action-id="outcomes.step-add" className={warmButton} data-flow-action="Add outcome step" type="submit">Add step</button></form>}
    <div className="relative mt-8 grid gap-3 before:absolute before:bottom-8 before:left-[31px] before:top-8 before:w-px before:bg-[#DED7D0]">{steps.map((step, index) => {
      if (!step) return null;
      const link = document.links.find((item) => item.type === "step-scheduled-as-event" && item.fromId === step.id);
      const calendarEvent = link && allCalendarEvents(document).find(({ id }) => id === link.toId);
      return <motion.article className={`${warmCard} relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 p-5 ${focusedEntityId === step.id ? "border-flow-blue ring-2 ring-flow-blue/10" : ""}`} data-life-entity-id={step.id} data-step-id={step.id} key={step.id} layout onClick={() => focusEntity(step.id)}>
        <span className={`z-10 grid size-7 place-items-center rounded-full text-xs ${step.status === "completed" ? "bg-flow-green-strong text-white" : "border border-[#D8D0C8] bg-white text-flow-secondary"}`}>{step.status === "completed" ? "✓" : index + 1}</span>
        <div className="min-w-0">{entityEditor?.kind === "step" && entityEditor.id === step.id ? <StepTitleEditor key={entityEditor.session} step={step}/> : <button data-action-id="outcomes.step-select" aria-label={calendarEvent ? `Inspect ${step.title} in Today` : step.title} className="min-h-11 w-full text-left" data-flow-action="Select outcome step" onClick={() => dispatchEntityView({ type: "entity-view", kind: "step", operation: "select", target: { id: step.id } })} type="button"><span className="font-medium">{step.title}</span><span className="mt-1 block text-xs text-flow-secondary">{calendarEvent ? `Scheduled ${calendarEvent.dateKey} at ${formatTime(calendarEvent.start)}` : `${step.estimatedMinutes ?? "—"} minutes · ${step.status}`}</span></button>}
          <div className="mt-3 flex flex-wrap gap-1"><button data-action-id="outcomes.step-rename-open" className={warmQuietButton} data-flow-action="Rename outcome step" onClick={() => dispatchEntityView({ type: "entity-view", kind: "step", operation: "edit", target: { id: step.id } })} type="button">Rename</button>{step.status === "planned" && <button data-action-id="outcomes.step-find-time" className={warmQuietButton} data-flow-action="Find time for outcome step" onClick={() => runCommand(`Find time for ${step.title} step`, "quick")} type="button">Find time</button>}{step.status !== "completed" && <button data-action-id="outcomes.step-complete" className={warmQuietButton} data-flow-action="Complete outcome step" onClick={() => runCommand(`Mark ${step.title} complete`, "quick")} type="button">Complete</button>}<button data-action-id="outcomes.step-delete" className="min-h-11 rounded-full px-4 text-sm text-[#C75151] hover:bg-[#FFF0EE]" data-flow-action="Delete outcome step" onClick={() => runCommand(`Delete ${step.title} step`, "quick")} type="button">Delete</button></div>
        </div>
      </motion.article>;
    })}</div>
  </WorldPageShell>;
}

function StepTitleEditor({ step }: { step: PlanStep }) {
  const { runCommand } = useFlowEnvironment(), [title, setTitle] = useState(step.title);
  return <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (title.trim()) runCommand(`Rename ${step.title} step to ${title.trim()}`, "quick"); }}><input data-action-id="outcomes.step-title-save" aria-label={`Rename ${step.title}`} autoFocus className={warmField} data-flow-action="Rename outcome step text" onChange={(event) => setTitle(event.target.value)} value={title}/><button data-action-id="outcomes.step-title-save" className={warmButton} data-flow-action="Save outcome step title" type="submit">Save</button></form>;
}
