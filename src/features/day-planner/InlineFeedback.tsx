import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { tokens } from "../../shared/design-system/tokens";
import type { DayPlan, PendingInteraction, PlannerFeedback } from "./model";
import { DAY_START, MINUTE_HEIGHT } from "./time";

interface InlineFeedbackProps {
  feedback: PlannerFeedback;
  pending?: PendingInteraction;
  onChoose: (id: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  plan: DayPlan;
}

export function InlineFeedback({ feedback, pending, onChoose, onConfirm, onCancel, plan }: InlineFeedbackProps) {
  const reducedMotion = useReducedMotion();
  const quiet = feedback.phase === "ready";
  if (quiet) return <span className="sr-only">On track</span>;
  const issue = feedback.phase === "error" || feedback.phase === "conflict" || feedback.phase === "clarification" || feedback.phase === "confirmation";
  const target = feedback.targetEventId ? plan.events.find((event) => event.id === feedback.targetEventId) : undefined;
  const marker = target?.start ?? feedback.markerMinutes;
  return (
    <AnimatePresence initial={false}>
      <motion.section
        aria-live="polite"
        className={`absolute z-40 w-[min(calc(100%-1.5rem),620px)] rounded-[14px] border px-4 py-3 ${marker === undefined ? "left-1/2 top-3 -translate-x-1/2" : "left-[68px] right-3 sm:left-auto sm:right-8 sm:w-[420px]"} ${tokens.feedback.base} ${issue ? tokens.feedback.issue : tokens.feedback.calm}`}
        initial={reducedMotion ? false : { opacity: 0, y: -10 }}
        data-feedback-phase={feedback.phase}
        data-feedback-transaction-id={feedback.transactionId}
        data-feedback-transcript={feedback.transcript}
        data-flow-feedback="true"
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        key={`${feedback.phase}-${feedback.title}`}
        style={marker === undefined ? undefined : { top: Math.max(8, 90 + (marker - DAY_START) * MINUTE_HEIGHT) }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-sm font-semibold ${tokens.titleText}`}>{feedback.title}</h2>
            <p className={`mt-0.5 text-xs leading-5 ${tokens.secondaryText}`}>{feedback.summary}</p>
          </div>
          {feedback.transcript && <span className={`max-w-[44%] truncate text-[11px] ${tokens.mutedText}`}>“{feedback.transcript}”</span>}
        </div>
        {pending?.type === "clarification" && (
          <div className="mt-2 flex flex-wrap gap-2">
            {pending.clarification.choices.map((choice) => <button data-action-id="pending.clarification-choice" className={tokens.textButton} data-flow-action="Choose clarification" key={choice.id} onClick={() => onChoose(choice.id)} type="button">{choice.label}</button>)}
            <button data-action-id="pending.cancel" className={tokens.textButton} data-flow-action="Cancel clarification" onClick={onCancel} type="button">Never mind</button>
          </div>
        )}
        {pending?.type === "confirmation" && (
          <div className="mt-2 flex gap-2">
            <button data-action-id="pending.confirm" className={tokens.primaryButton} data-flow-action="Confirm destructive action" onClick={onConfirm} type="button">{pending.confirmation.confirmLabel ?? "Confirm"}</button>
            <button data-action-id="pending.cancel" className={tokens.textButton} data-flow-action="Cancel destructive action" onClick={onCancel} type="button">Cancel</button>
          </div>
        )}
      </motion.section>
    </AnimatePresence>
  );
}
