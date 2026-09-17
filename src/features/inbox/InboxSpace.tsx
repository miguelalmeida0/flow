import { AnimatePresence, motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import type { Capture } from "../../domain/life-model";
import { selectUnresolvedCaptures } from "../../domain/life-selectors";
import { WorldPageShell, warmButton, warmCard, warmField, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { captureUiActions } from "../../shared/command/uiActionDescriptors";

function CaptureCard({ capture, focused, onFocus, run }: { capture: Capture; focused: boolean; onFocus: () => void; run: (text: string, source: "quick") => void }) {
  const { entityEditor, dispatchEntityView } = useFlowEnvironment();
  const editing = entityEditor?.kind === "capture" && entityEditor.id === capture.id;
  return <motion.article className={`${warmCard} p-5 ${focused ? "border-flow-blue ring-2 ring-flow-blue/10" : ""}`} data-capture-id={capture.id} data-life-entity-id={capture.id} exit={{ opacity: 0, x: 20 }} layout role="listitem">
    {editing ? <CaptureEditor capture={capture} key={entityEditor.session}/> : <button data-action-id="capture.select" className="min-h-11 w-full text-left font-serif text-xl" data-flow-action="Select capture" onClick={() => dispatchEntityView({ type: "entity-view", kind: "capture", operation: "select", target: { id: capture.id } })} type="button">{capture.title}</button>}
    <div className="mt-4 flex flex-wrap gap-1 text-xs"><button data-action-id="capture.turn-into-outcome" className={warmQuietButton} data-flow-action="Turn into outcome" onClick={() => { onFocus(); run(captureUiActions.turnIntoOutcome.phrase, "quick"); }} type="button">{captureUiActions.turnIntoOutcome.label}</button><button data-action-id="capture.schedule-tomorrow" className={warmQuietButton} data-flow-action="Schedule tomorrow" onClick={() => { onFocus(); run(captureUiActions.scheduleTomorrow.phrase, "quick"); }} type="button">{captureUiActions.scheduleTomorrow.label}</button><button data-action-id="capture.edit-open" className={warmQuietButton} data-flow-action="Edit capture" onClick={() => dispatchEntityView({ type: "entity-view", kind: "capture", operation: "edit", target: { id: capture.id } })} type="button">Edit</button><button data-action-id="capture.keep-as-note" className={warmQuietButton} data-flow-action="Keep as note" onClick={() => { onFocus(); run(captureUiActions.keepAsNote.phrase, "quick"); }} type="button">{captureUiActions.keepAsNote.label}</button><button data-action-id="capture.delete" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-[#C75151] hover:bg-[#FFF0EE]" data-flow-action="Delete capture" onClick={() => { onFocus(); run("Delete this capture", "quick"); }} type="button">Delete</button></div>
  </motion.article>;
}

function CaptureEditor({ capture }: { capture: Capture }) {
  const { focusEntity, runCommand, dispatchEntityView } = useFlowEnvironment();
  const [title, setTitle] = useState(capture.title);
  function save(event: FormEvent) { event.preventDefault(); if (!title.trim()) return; focusEntity(capture.id); runCommand(`Edit this capture to ${title.trim()}`, "quick"); }
  return <form className="flex flex-col gap-2 sm:flex-row" onSubmit={save}><input data-action-id="capture.title-save" aria-label={`Edit ${capture.title}`} autoFocus className={warmField} data-flow-action="Edit capture title" onChange={(event) => setTitle(event.target.value)} value={title}/><button data-action-id="capture.title-save" className={warmButton} data-flow-action="Save capture title" type="submit">Save</button><button data-action-id="capture.edit-cancel" className={warmQuietButton} data-flow-action="Cancel capture edit" onClick={() => dispatchEntityView({ type: "editor-close" })} type="button">Cancel</button></form>;
}

export function InboxSpace() {
  const { document, focusedEntityId, focusEntity, runCommand } = useFlowEnvironment();
  const captures = selectUnresolvedCaptures(document);
  const resolved = document.captures.filter(({ status }) => status === "resolved").slice(-3).reverse();
  const [draft, setDraft] = useState("");
  function submit(event: FormEvent) { event.preventDefault(); if (!draft.trim()) return; runCommand(`Capture ${draft.trim()}`, "type"); setDraft(""); }
  const action = <form className="flex w-full max-w-xl gap-2" onSubmit={submit}><input data-action-id="capture.create" aria-label="Capture a thought" className={warmField} data-flow-action="Capture text" onChange={(event) => setDraft(event.target.value)} placeholder="What is on your mind?" value={draft}/><button data-action-id="capture.create" className={warmButton} data-flow-action="Capture" type="submit">Capture</button></form>;
  return <WorldPageShell destination="capture" action={action} description="Thoughts stay light until you turn them into time, an outcome, or a promise." eyebrow={`${captures.length} unresolved`} testId="inbox-space" title="Capture">
    {captures.length > 1 && <div className="mb-4 flex justify-end"><button data-action-id="capture.keep-all-as-notes" className={warmQuietButton} data-flow-action="Keep all as notes" onClick={() => runCommand(captureUiActions.keepAllAsNotes.phrase, "quick")} type="button">{captureUiActions.keepAllAsNotes.label}</button></div>}
    <div className="grid gap-3" role="list"><AnimatePresence initial={false}>{captures.map((capture) => <CaptureCard capture={capture} focused={focusedEntityId === capture.id} key={capture.id} onFocus={() => focusEntity(capture.id)} run={runCommand}/>)}</AnimatePresence>{!captures.length && <div className={`${warmCard} p-10 text-center`}><p className="font-serif text-3xl">Nothing unresolved.</p><p className="mt-3 text-sm text-flow-secondary">Say “Capture…” to add one thought without accidentally routing ordinary speech here.</p></div>}</div>
    {resolved.length > 0 && <section className="mt-10"><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-flow-muted">Recently routed</h3><div className="mt-3 grid gap-2">{resolved.map((capture) => <div className="flex items-center justify-between rounded-2xl border border-[#E8E1DA] bg-white px-5 py-4 text-sm" key={capture.id}><span>{capture.title}</span><span className="text-xs text-[#4D91F5]">Shaped</span></div>)}</div></section>}
  </WorldPageShell>;
}
