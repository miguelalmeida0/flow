import { motion } from "motion/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { WorldDestination } from "../../domain/life-model";
import { Icon, type IconName } from "../../shared/design-system/Icon";
import { WorldContinuitySurface } from "../../shared/motion/WorldContinuitySurface";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { voiceTargetStageSeconds } from "../../shared/motion/voiceTargetStages";
import { motionStageReached, reportVoiceTargetMotion } from "../../shared/motion/voiceMotionHandshake";

export function HomeDomainCard({ destination, title, eyebrow, icon, children }: {
  destination: Extract<WorldDestination, "today" | "journal" | "people" | "atmosphere" | "memories">;
  title: string;
  eyebrow: string;
  icon: IconName;
  children: ReactNode;
}) {
  const environment = useFlowEnvironment();
  const reduced = useReducedMotionPreference();
  const active = environment.voiceWorld.domain === destination;
  const worldEnabled = environment.voiceWorld.phase !== "targeting" || motionStageReached(environment.voiceWorld.targetMotionStage, "world");
  const signalledAction = useRef<string | undefined>(undefined);
  const card = useRef<HTMLButtonElement>(null);
  const actionId = environment.voiceWorld.actionId;
  useLayoutEffect(() => {
    if (document.documentElement.clientWidth <= 0 || reduced || !active || !worldEnabled || !actionId || signalledAction.current === actionId) return;
    let frame = 0;
    const observe = () => {
      if (!card.current) return;
      const transform = getComputedStyle(card.current).transform;
      const translated = transform && transform !== "none" ? new DOMMatrixReadOnly(transform).m42 : 0;
      if (Math.abs(translated) > 0.05) {
        signalledAction.current = actionId;
        reportVoiceTargetMotion(actionId, "world");
      } else frame = requestAnimationFrame(observe);
    };
    frame = requestAnimationFrame(observe);
    return () => cancelAnimationFrame(frame);
  }, [actionId, active, reduced, worldEnabled]);
  const receded = Boolean(environment.voiceWorld.domain && !active && ["targeting", "executing", "success"].includes(environment.voiceWorld.phase) && worldEnabled);
  return <motion.button data-action-id="home.domain-card"
    animate={reduced ? { opacity: receded ? 0.72 : 1 } : { y: active && worldEnabled ? -9 : 0, scale: active && worldEnabled ? 1.035 : receded ? 0.975 : 1, opacity: receded ? 0.68 : 1 }}
    aria-label={`Open ${title}`}
    className="group relative h-full min-h-[228px] w-full overflow-hidden rounded-[26px] border border-[#D6C9BA] bg-[#FFFDF8] p-5 text-left shadow-[0_22px_55px_rgba(80,61,43,0.09)] outline-none transition-colors hover:border-[#AABDB7] focus-visible:ring-2 focus-visible:ring-[#376F6A] focus-visible:ring-offset-4 focus-visible:ring-offset-[#F2E8DB] sm:min-h-[248px] sm:rounded-[30px] sm:p-6 lg:min-h-[278px] [@media(min-width:1024px)_and_(max-height:900px)]:min-h-[220px] [@media(min-width:1024px)_and_(max-height:900px)]:p-4"
    data-flow-action={`Open ${title}`}
    data-home-domain={destination}
    data-voice-targeted={active ? "true" : "false"}
    data-world-target-stage={active ? "world-third" : undefined}
    data-world-target-stage-delay-ms={active ? voiceTargetStageSeconds.world * 1_000 : undefined}
    data-voice-phase={active ? environment.voiceWorld.phase : undefined}
    layout={reduced ? false : "position"}
    ref={card}
    onClick={() => environment.navigate(destination)}
    transition={reduced
      ? { duration: 0.1 }
      : active && environment.voiceWorld.phase === "targeting"
        ? { duration: 0.12, delay: Math.max(0, voiceTargetStageSeconds.world - (performance.now() - (environment.voiceWorld.acknowledgedAt ?? performance.now())) / 1_000), ease: [0.22, 1, 0.36, 1] }
        : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
    type="button"
  >
    <WorldContinuitySurface className="rounded-[30px] border border-[#D6C9BA] bg-[#FFFDF8]" destination={destination} />
    <div className="relative flex items-start justify-between gap-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.19em] text-[#63837F]">{eyebrow}</p><h2 className="mt-2 font-serif text-[30px] font-normal tracking-[-0.035em] text-[#233039]">{title}</h2></div>
      <span className="grid size-10 place-items-center rounded-full border border-[#D8CEC2] text-[#4A7773] transition-transform group-hover:translate-x-0.5"><Icon name={icon} size={19} /></span>
    </div>
    <div className="relative mt-5">{children}</div>
    {active && <motion.span animate={{ opacity: 1, scaleX: 1 }} className="absolute inset-x-7 bottom-0 h-1 origin-center rounded-full bg-[#6FA49D]" initial={reduced ? false : { opacity: 0, scaleX: 0.2 }} />}
  </motion.button>;
}
