import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useState } from "react";
import { useFlowEnvironment, useFlowTransition } from "../../app/FlowEnvironmentProvider";
import type { ActiveLifeTransition, TransitionBounds } from "../../app/environment-types";
import { beginMeasuredTransition } from "./transitionDiagnostics";
import { TidePath } from "./TidePath";

const beatIndex = ["focus-source", "release-tide", "transfer-path", "destination-shell", "resolve-content", "settled"] as const;

function safeFlightBounds(bounds: TransitionBounds): TransitionBounds {
  const margin = 16;
  const header = 76;
  const footer = window.innerWidth < 640 ? 76 : 20;
  const width = Math.min(Math.max(bounds.width, 220), Math.min(420, window.innerWidth - margin * 2));
  const height = Math.min(Math.max(bounds.height, 76), Math.min(160, window.innerHeight - header - footer));
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  return {
    left: Math.min(Math.max(centerX - width / 2, margin), window.innerWidth - margin - width),
    top: Math.min(Math.max(centerY - height / 2, header), window.innerHeight - footer - height),
    width,
    height,
  };
}

function Flight({ transition }: { transition: ActiveLifeTransition }) {
  const { document: lifeDocument } = useFlowEnvironment();
  const reducedMotion = Boolean(useReducedMotion() || transition.reducedMotion);
  const [measuredDestination, setMeasuredDestination] = useState<TransitionBounds>();
  useEffect(() => beginMeasuredTransition({ trackFrames: !reducedMotion && !window.document.hidden }), [reducedMotion]);
  useLayoutEffect(() => {
    if (beatIndex.indexOf(transition.beat) < 3) return;
    const element = [...window.document.querySelectorAll<HTMLElement>("[data-life-entity-id]")]
      .find((candidate) => candidate.dataset.lifeEntityId === transition.destinationId);
    const rect = element?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) setMeasuredDestination({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }, [transition.beat, transition.destinationId]);
  const title = lifeDocument.captures.find(({ id }) => id === transition.sourceId)?.title
    ?? lifeDocument.steps.find(({ id }) => id === transition.sourceId)?.title
    ?? lifeDocument.commitments.find(({ id }) => id === transition.destinationId)?.title;
  const viewportFallback = { left: Math.max(16, window.innerWidth / 2 - 160), top: Math.max(72, window.innerHeight / 2 - 30), width: 320, height: 60 };
  const source = safeFlightBounds(transition.sourceBounds ?? transition.destinationBounds ?? viewportFallback);
  const destination = safeFlightBounds(measuredDestination ?? transition.destinationBounds ?? source);
  const moving = beatIndex.indexOf(transition.beat) >= 2;
  const destinationTransform = {
    x: destination.left - source.left,
    y: destination.top - source.top,
    scaleX: destination.width / source.width,
    scaleY: destination.height / source.height,
  };
  return <motion.div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70]" data-transition-beat={transition.beat} data-transition-clone-count="1">
    {!reducedMotion && transition.sourceBounds && (measuredDestination ?? transition.destinationBounds) && (
      <div className={`absolute inset-0 text-flow-blue ${transition.beat === "settled" ? "opacity-0" : "opacity-100"}`}><TidePath destination={destination} progressed={beatIndex.indexOf(transition.beat) >= 4} source={source} /></div>
    )}
    <motion.div
      animate={{ x: moving ? destinationTransform.x : 0, y: moving ? destinationTransform.y : 0, opacity: transition.beat === "settled" ? 0 : 1 }}
      className="absolute origin-top-left text-sm text-flow-ink will-change-transform"
      data-transition-measured={String(Boolean(transition.sourceBounds && (measuredDestination ?? transition.destinationBounds)))}
      data-transition-surface="true"
      initial={false}
      style={{ left: source.left, top: source.top, width: source.width, height: source.height }}
      transition={{ duration: reducedMotion ? 0.08 : 0.32 }}
    >
      <motion.div
        animate={{ scaleX: moving ? destinationTransform.scaleX : 1, scaleY: moving ? destinationTransform.scaleY : 1 }}
        className="absolute inset-0 origin-top-left rounded-[18px] border border-[#BCD5FC] bg-flow-elevated shadow-[0_18px_45px_rgba(35,43,55,0.14)] will-change-transform"
        data-transition-paper
        initial={false}
        transition={{ duration: reducedMotion ? 0.08 : 0.32 }}
      />
      <div className="relative px-4 py-3" data-transition-content style={{ width: Math.min(source.width, destination.width) }}>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4D91F5]">{transition.kind === "capture-to-plan" ? "Becoming an outcome" : transition.kind === "step-to-calendar" ? "Reserving time" : "Linking a promise"}</span>
        <span className="mt-1 block line-clamp-2 text-[13px] leading-4" data-transition-title>{title ?? (transition.kind === "capture-to-plan" ? "Turning this into an outcome…" : transition.kind === "step-to-calendar" ? "Reserving time…" : "Linking promise…")}</span>
      </div>
    </motion.div>
  </motion.div>;
}

export function SharedFlightLayer() {
  const transition = useFlowTransition();
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {transition && <Flight key={`${transition.sourceId}-${transition.destinationId}`} transition={transition} />}
    </AnimatePresence>, document.body,
  );
}
