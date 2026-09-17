import { useEffect } from "react";
import { tokens } from "../../shared/design-system/tokens";
import { DayTimeline } from "./DayTimeline";
import { InlineFeedback } from "./InlineFeedback";
import { PlannerHeader } from "./PlannerHeader";
import { VoiceCommandBar } from "./VoiceCommandBar";
import { classifyDensity } from "./tide/classifyDensity";
import { useFlowPlanner } from "./useFlowPlanner";
import type { RecognitionAdapter, VoiceLocale } from "./voice/recognition";
import type { FlowPlannerRuntime } from "./useFlowPlanner";

interface FlowPlannerScreenProps {
  recognitionAdapter?: RecognitionAdapter;
  voiceLocale?: VoiceLocale;
  now?: FlowPlannerRuntime["now"];
  createTransactionId?: FlowPlannerRuntime["createTransactionId"];
}

export function FlowPlannerScreen({ recognitionAdapter, voiceLocale, now, createTransactionId }: FlowPlannerScreenProps) {
  const planner = useFlowPlanner({ now, createTransactionId });
  const density = classifyDensity(planner.renderedPlan);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) planner.redo(); else planner.undo();
      } else if (!editing && (event.key === "/" || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k"))) {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>('[aria-label="Tell Flow what to change"]');
        if (input) input.focus();
        else {
          document.querySelector<HTMLButtonElement>('[aria-label="Open Flow command"]')?.click();
          window.setTimeout(() => document.querySelector<HTMLInputElement>('[aria-label="Tell Flow what to change"]')?.focus(), 0);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  return (
    <main className={tokens.shell}>
      <PlannerHeader
        canRedo={planner.canRedo}
        canUndo={planner.canUndo}
        dateKey={planner.plan.dateKey}
        density={density}
        onRedo={planner.redo}
        onReset={planner.reset}
        onUndo={planner.undo}
      />

      <section className="relative flex min-h-[620px] min-w-0 flex-1 flex-col overflow-hidden">
        <div className={`flex h-[74px] shrink-0 items-center justify-between border-b px-4 sm:px-6 ${tokens.divider}`}>
          <div>
            <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${tokens.eyebrow}`}>Today · Tide active</p>
            <h1 className="mt-1 text-xl font-semibold tracking-[-0.035em] sm:text-2xl">Your day, in motion</h1>
          </div>
          <div className="text-right">
            {planner.preview && <p className={`text-xs font-semibold ${tokens.accent}`}>What-if preview</p>}
            {planner.plan.deferred.length > 0 && (
              <div className={`mt-1 text-[11px] ${tokens.secondaryText}`}>
                <p>{planner.plan.deferred.length} planned for later</p>
                <p className={`hidden max-w-[320px] truncate sm:block ${tokens.mutedText}`}>{planner.plan.deferred.map((event) => event.title).join(" · ")}</p>
              </div>
            )}
            {!planner.preview && <p className={`hidden max-w-sm text-xs leading-5 sm:block ${tokens.mutedText}`}>Anchors stay still. Flexible time flows around them.</p>}
          </div>
        </div>

        <InlineFeedback
          feedback={planner.feedback}
          onCancel={planner.cancel}
          onChoose={planner.chooseClarification}
          onConfirm={planner.confirm}
          pending={planner.pending}
          plan={planner.plan}
        />

        <DayTimeline
          feedback={planner.feedback}
          onAction={planner.dispatch}
          onSelect={planner.setSelected}
          now={now}
          plan={planner.renderedPlan}
          preview={Boolean(planner.preview)}
          selected={planner.selected}
        />
      </section>

      <VoiceCommandBar
        lastTranscript={planner.lastTranscript}
        holdOpen={Boolean(planner.pending || planner.preview)}
        onRun={planner.run}
        onPresentation={planner.present}
        presentationRequest={planner.presentationRequest}
        pendingDestination={planner.pending?.type === "clarification" && planner.pending.clarification.type === "destination"}
        phase={planner.feedback.phase}
        plan={planner.plan}
        recognitionAdapter={recognitionAdapter}
        selected={planner.selected}
        voiceLocale={voiceLocale}
      />
    </main>
  );
}
