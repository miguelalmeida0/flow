import { motion } from "motion/react";
import { useLayoutEffect, useState } from "react";
import { useFlowEnvironment, useFlowTransition } from "../../app/FlowEnvironmentProvider";
import { flowMotion } from "../motion/motion-presets";

interface TargetRect { left: number; top: number; width: number; height: number }

export function RewardLayer() {
  const { reward, route } = useFlowEnvironment();
  const sharedTransition = useFlowTransition();
  const [target, setTarget] = useState<TargetRect>();
  // Cross-space morphs already carry the transaction's visual causality. A
  // second highlight over the same source creates competing Motion owners,
  // extra layout reads, and needless animation allocation. The typed reward
  // event and mascot state remain intact; this layer resumes after the morph.
  const plan = reward.active && !sharedTransition ? reward.plan : undefined;
  useLayoutEffect(() => {
    if (!plan?.entityIds[0]) { setTarget(undefined); return; }
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(plan.entityIds[0]) : plan.entityIds[0].replaceAll('"', '\\"');
    const element = document.querySelector<HTMLElement>(`[data-life-entity-id="${escaped}"]`);
    if (!element) { setTarget(undefined); return; }
    const rect = element.getBoundingClientRect();
    setTarget({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }, [plan, reward.sequence, route]);

  return <aside aria-hidden className="pointer-events-none fixed inset-0 z-[45] overflow-hidden" data-reward-active={String(Boolean(plan))} data-reward-family={plan?.recipe.family ?? "none"} data-reward-level={plan?.level ?? 0} data-reward-sequence={reward.sequence}>
    <>
      {plan?.level === 3 && <motion.div
        animate={plan.reducedMotion ? { opacity: [0, 0.12, 0] } : { opacity: [0, 0.1, 0.075, 0], x: ["-14%", "0%", "2%", "8%"] }}
        className={`absolute inset-0 ${plan.recipe.family === "anchor" ? "bg-flow-orange-soft" : plan.recipe.family === "tide" ? "bg-flow-blue-soft" : "bg-flow-green-soft"}`}
        data-reward-wash
        initial={{ opacity: 0 }}
        key={`wash-${reward.sequence}`}
        transition={plan.reducedMotion ? flowMotion.reducedConfirm : flowMotion.ceremonySettle}
      />}
      {plan && target && <motion.div
        animate={plan.reducedMotion ? { opacity: [0, 0.65, 0] } : { opacity: [0, 0.9, 0.55, 0], scale: [0.985, 1.012, 1, 1] }}
        className={`fixed rounded-[22px] border-2 ${plan.recipe.family === "anchor" ? "border-flow-orange/70 shadow-[0_0_0_7px_rgba(246,189,84,0.09)]" : plan.recipe.family === "tide" ? "border-flow-blue/60 shadow-[0_0_0_7px_rgba(77,145,245,0.08)]" : "border-flow-green/70 shadow-[0_0_0_7px_rgba(77,171,128,0.08)]"}`}
        data-reward-target={plan.entityIds[0]}
        initial={{ opacity: 0, scale: 0.985 }}
        key={`target-${reward.sequence}`}
        style={target}
        transition={plan.reducedMotion ? flowMotion.reducedConfirm : plan.level === 3 ? flowMotion.ceremonySettle : flowMotion.bloomReveal}
      />}
      {plan?.level === 3 && <motion.div
        animate={plan.reducedMotion ? { opacity: [0, 1, 0], x: "-50%" } : { opacity: [0, 1, 1, 0], x: "-50%", y: [6, 0, 0, -4] }}
        className="fixed left-1/2 top-[74px] rounded-full border border-flow-border bg-flow-elevated px-5 py-1 text-xs font-semibold tracking-[0.02em] text-flow-ink shadow-[0_12px_32px_rgba(35,43,55,0.08)]"
        data-reward-label
        initial={{ opacity: 0, x: "-50%", y: 6 }}
        key={`label-${reward.sequence}`}
        transition={plan.reducedMotion ? flowMotion.reducedConfirm : flowMotion.ceremonySettle}
      >{plan.recipe.label}</motion.div>}
    </>
  </aside>;
}
