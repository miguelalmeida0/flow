import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import type { VoiceWorldPhase, VoiceWorldSnapshot } from "./voiceWorld";
import { isVisibleVoicePulseStart, motionStageReached, reportVoiceTargetMotion } from "../../shared/motion/voiceMotionHandshake";

const heights = [14, 28, 20, 38, 24, 31, 16];

export function VoiceEnergy({ phase, sequence }: { phase: VoiceWorldPhase; sequence: number }) {
  const reduced = useReducedMotionPreference();
  const active = ["wake-detected", "listening", "targeting", "executing"].includes(phase);
  return <div aria-hidden="true" className="flex h-12 items-center justify-center gap-2" data-voice-energy={active ? "active" : "quiet"}>
    {heights.map((height, index) => <motion.span
      animate={reduced ? { height: active ? Math.max(12, height * 0.65) : 8, opacity: active ? 1 : 0.45 } : {
        height: active ? [Math.max(8, height * 0.45), height, Math.max(10, height * 0.62)] : 8,
        opacity: active ? [0.55, 1, 0.7] : 0.38,
      }}
      className="w-1.5 rounded-full bg-[#5E8F89]"
      key={`${sequence}-${index}`}
      transition={{ duration: active ? 0.52 : 0.18, delay: index * 0.025, ease: [0.22, 1, 0.36, 1] }}
    />)}
  </div>;
}

interface EnergyGeometry { fromX: number; fromY: number; toX: number; toY: number }

function centerOf(element: Element | undefined) {
  if (!element) return undefined;
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return undefined;
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
}

function semanticTarget(targetId: string | undefined, domain: VoiceWorldSnapshot["domain"]) {
  const nodes = [...document.querySelectorAll<HTMLElement>("[data-life-entity-id]")];
  const entity = targetId ? nodes.find((node) => node.dataset.lifeEntityId === targetId && node.getBoundingClientRect().width > 0) : undefined;
  if (entity) return entity;
  const domains = [...document.querySelectorAll<HTMLElement>("[data-home-domain], [data-world-continuity-surface]")];
  return domains.find((node) => (node.dataset.homeDomain === domain || node.dataset.worldContinuitySurface === domain) && node.getBoundingClientRect().width > 0)
    ?? document.querySelector<HTMLElement>("[data-home-temporal-scene]")
    ?? document.querySelector<HTMLElement>("[data-space-shell]")
    ?? undefined;
}

/** The command surface and semantic target are measured only for presentation.
 * Business state remains owned by the canonical command transaction. */
export function VoiceTargetPulse({ snapshot, home = false }: { snapshot: VoiceWorldSnapshot; home?: boolean }) {
  const reduced = useReducedMotionPreference();
  const [geometry, setGeometry] = useState<EnergyGeometry>();
  const retained = useRef<VoiceWorldSnapshot | undefined>(undefined);
  const signalled = useRef<{ actionId?: string; stage?: "world" | "pulse" }>({});
  const acknowledged = (snapshot.phase === "targeting" || snapshot.phase === "executing") && Boolean(snapshot.domain && snapshot.actionId);
  if (acknowledged) retained.current = snapshot;
  const projection = acknowledged
    ? snapshot
    : snapshot.phase === "success" && snapshot.domain && snapshot.actionId === retained.current?.actionId
      ? retained.current
      : undefined;
  if (signalled.current.actionId !== projection?.actionId) signalled.current = { actionId: projection?.actionId };
  const visible = Boolean(projection && (projection.phase === "executing" || motionStageReached(projection.targetMotionStage, home && !reduced ? "pulse" : "world")));

  useLayoutEffect(() => {
    if (!visible) {
      setGeometry(undefined);
      return;
    }
    const origin = centerOf(document.querySelector<HTMLElement>("[data-voice-energy-origin]") ?? undefined);
    const target = centerOf(semanticTarget(projection?.targetId, projection?.domain));
    if (origin && target) setGeometry({ fromX: origin.x, fromY: origin.y, toX: target.x, toY: target.y });
  }, [projection?.actionId, projection?.domain, projection?.targetId, visible]);

  if (!projection) return null;
  const domainLabel = projection.domain === "today" ? "Calendar" : projection.domain ? `${projection.domain.charAt(0).toUpperCase()}${projection.domain.slice(1)}` : "Flow";
  const controlY = geometry ? Math.min(geometry.fromY, geometry.toY) - 70 : 0;
  const path = geometry ? `M ${geometry.fromX} ${geometry.fromY} Q ${(geometry.fromX + geometry.toX) / 2} ${controlY} ${geometry.toX} ${geometry.toY}` : "";
  const reportTravel = (latest: Record<string, string | number>) => {
    const stage = !home && projection.targetMotionStage === "world" ? "world" : "pulse";
    const distance = geometry ? Math.hypot(geometry.toX - geometry.fromX, geometry.toY - geometry.fromY) : 0;
    const progress = distance > 0 ? Math.hypot(Number(latest.x ?? 0), Number(latest.y ?? 0)) / distance : 0;
    const visiblyReached = isVisibleVoicePulseStart(progress, Number(latest.opacity ?? 0));
    if (!visiblyReached || reduced) return;
    if (signalled.current.stage === stage) return;
    signalled.current.stage = stage;
    reportVoiceTargetMotion(projection.actionId, stage);
  };
  return <><output
    aria-live="polite"
    className="pointer-events-none fixed left-1/2 top-3 z-[71] -translate-x-1/2 rounded-full bg-flow-elevated px-3 py-1 text-xs text-flow-secondary"
    data-voice-target-acknowledgement
    data-voice-action-id={snapshot.actionId}
    {...{ elementtiming: `flow-target-heading-${snapshot.actionId}` }}
  >{projection.source === "voice" ? `“${projection.transcript}”` : domainLabel}</output>{visible && geometry ? <svg
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-[70] size-full overflow-visible"
    data-target-domain={projection.domain}
    data-target-entity={projection.targetId}
    data-voice-action-id={projection.actionId}
    data-voice-motion-stage={projection.targetMotionStage}
    data-voice-energy-mode={reduced ? "reduced-target" : "semantic-travel"}
    data-voice-target-pulse
    data-voice-origin-x={geometry.fromX}
    data-voice-origin-y={geometry.fromY}
    data-voice-target-x={geometry.toX}
    data-voice-target-y={geometry.toY}
  >
    {reduced ? <motion.circle
      animate={{ opacity: [0.2, 0.7, 0.25], r: [15, 22, 22] }}
      cx={geometry.toX}
      cy={geometry.toY}
      fill="none"
      initial={false}
      r="15"
      stroke="#5E8F89"
      strokeWidth="3"
      transition={{ duration: 0.12 }}
    /> : <>
      <motion.path animate={{ opacity: [0, 0.45, 0], pathLength: [0, 1, 1] }} d={path} data-voice-pulse-path fill="none" initial={{ opacity: 0, pathLength: 0 }} stroke="#6FA49D" strokeLinecap="round" strokeWidth="2" transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }} />
      <motion.circle
        animate={{
          // Hold the visible endpoint until execution. A dropped frame may
          // skip a tween, but must never erase the pending acknowledgement.
          opacity: projection.phase === "targeting" ? [0, 0.9] : [0.9, 0.9, 0],
          r: projection.phase === "targeting" ? [4, 6] : [6, 6, 3],
          x: geometry.toX - geometry.fromX,
          y: geometry.toY - geometry.fromY,
        }}
        cx={geometry.fromX}
        cy={geometry.fromY}
        data-voice-pulse-traveler
        fill="#5E8F89"
        initial={{ opacity: 0, r: 4, x: 0, y: 0 }}
        onUpdate={reportTravel}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle animate={{ opacity: [0, 0.7, 0], r: [12, 24, 28] }} cx={geometry.toX} cy={geometry.toY} data-voice-pulse-arrival fill="none" initial={{ opacity: 0, r: 12 }} stroke="#5E8F89" strokeWidth="2" transition={{ delay: 0.16, duration: 0.16, ease: "easeOut" }} />
    </>}
  </svg> : null}</>;
}
