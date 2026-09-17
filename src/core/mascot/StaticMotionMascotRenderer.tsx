import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import type { MascotPresentation } from "./mascot-model";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { useMascotSafeZone } from "./useMascotSafeZone";
import { voiceTargetStageSeconds } from "../../shared/motion/voiceTargetStages";
import { motionStageReached, reportVoiceTargetMotion } from "../../shared/motion/voiceMotionHandshake";

const gazeOffset = { left: -3, center: 0, right: 3 } as const;

/** Authored SVG character with one Motion owner per layer. Semantic attention
 * arrives from the command projection; the renderer never parses speech. */
export function StaticMotionMascotRenderer({ presentation, layoutKey, placement = "fixed" }: { presentation: MascotPresentation; layoutKey: string; placement?: "fixed" | "home" }) {
  const reduced = useReducedMotionPreference();
  const { ref, safe } = useMascotSafeZone(`${layoutKey}-${presentation.state}-${presentation.sequence}-${presentation.bubble ?? ""}`);
  const winning = presentation.state === "small-win" || presentation.state === "big-win";
  const waking = presentation.ceremony === "wake";
  const listening = presentation.state === "listening";
  const uncertain = presentation.state === "uncertain";
  const resting = presentation.state === "resting";
  const placedInHome = placement === "home";
  const direction = presentation.attention?.direction ?? "center";
  const gaze = gazeOffset[direction];
  const centerNudge = direction === "center" && presentation.attention ? -2 : 0;
  const signalled = useRef<{ actionId?: string; eyes?: boolean; body?: boolean }>({});
  if (signalled.current.actionId !== presentation.attention?.actionId) signalled.current = { actionId: presentation.attention?.actionId };
  const bodyEnabled = !presentation.attention || motionStageReached(presentation.attention.motionStage, "body");
  const bodyMotion = reduced
    ? { opacity: 1, y: 0, scaleX: 1, scaleY: 1, rotate: 0 }
    : waking
      ? { y: [0, 5, -22, -17, 0], scaleX: [1, 1.08, 0.96, 1.02, 1], scaleY: [1, 0.91, 1.05, 0.99, 1], rotate: [0, 0, 1.5, -0.6, 0] }
      : winning
        ? { y: [0, -8, 0], scaleX: [1, 1.02, 1], scaleY: [1, 0.98, 1], rotate: [0, 1.5, 0] }
        : listening
          ? { y: [0, -3, 0], scaleX: 1, scaleY: 1, rotate: 0 }
          : uncertain
            ? { y: 0, scaleX: 1, scaleY: 1, rotate: [0, -0.8, 0] }
            : presentation.attention && bodyEnabled
              ? { x: gaze * 1.4, y: centerNudge, scaleX: direction === "center" ? 1.012 : 1, scaleY: direction === "center" ? 0.994 : 1, rotate: gaze * 0.45 }
              : { x: 0, y: 0, scaleX: 1, scaleY: 1, rotate: 0 };

  return <motion.div
    aria-label={presentation.attention?.domain ? `Flow is attending to ${presentation.attention.domain}` : undefined}
    className={placedInHome
      ? "pointer-events-none flex origin-bottom items-end justify-center gap-3"
      : `pointer-events-none fixed bottom-9 left-12 z-30 hidden origin-bottom-left items-end gap-3 xl:flex ${safe ? "visible" : "invisible"}`}
    data-mascot-attention-direction={presentation.attention?.direction}
    data-mascot-attention-domain={presentation.attention?.domain}
    data-mascot-attention-entity={presentation.attention?.entityId}
    data-mascot-mobile-policy={placedInHome ? "integrated-home-world" : "measured-home-safe-zone"}
    data-mascot-renderer="static-motion"
    data-mascot-safe-zone={placedInHome || safe ? "clear" : "suppressed"}
    data-mascot-state={presentation.state}
    data-wake-ceremony={waking ? "active" : undefined}
    ref={ref}
  >
    <div className={placedInHome ? "relative aspect-[206/178] w-full" : "relative h-[178px] w-[206px]"} data-mascot-face={resting ? "sleeping" : winning ? "happy" : uncertain ? "uncertain" : "awake"} data-mascot-form="sprout" data-wake-lift-px={waking ? "22" : undefined}>
      <AnimatePresence>
        {waking && !reduced && <motion.svg aria-hidden="true" className="absolute inset-0 overflow-visible" exit={{ opacity: 0 }} initial={{ opacity: 1 }} viewBox="0 0 206 178">
          <motion.circle animate={{ opacity: [0.65, 0.28, 0], scale: [0.45, 1.05, 1.4] }} cx="103" cy="100" data-wake-ripple fill="none" r="70" stroke="#E4B95F" strokeWidth="1.5" style={{ originX: "103px", originY: "100px" }} transition={{ duration: 1.05, ease: "easeOut" }} />
          {[
            { d: "M43 82 C30 78 24 67 27 57 C39 59 47 68 48 80 Z", x: -18, y: -17, rotate: -28 },
            { d: "M158 74 C166 60 178 56 188 61 C183 73 174 80 160 80 Z", x: 20, y: -19, rotate: 32 },
            { d: "M157 128 C170 125 181 131 185 141 C174 146 163 141 156 132 Z", x: 24, y: 9, rotate: 54 },
          ].map((leaf, index) => <motion.path
            animate={{ opacity: [0, 0.78, 0], rotate: [0, leaf.rotate], scale: [0.62, 1, 0.84], x: [0, leaf.x], y: [0, leaf.y] }}
            d={leaf.d}
            data-authored-wake-leaf
            fill="#86A779"
            initial={{ opacity: 0, rotate: 0, scale: 0.62, x: 0, y: 0 }}
            key={leaf.d}
            transition={{ duration: 1.1, delay: 0.16 + index * 0.045, ease: "easeOut" }}
          />)}
        </motion.svg>}
      </AnimatePresence>
      <motion.svg
        animate={bodyMotion}
        aria-hidden="true"
        className="absolute inset-0 overflow-visible drop-shadow-[0_15px_15px_rgba(68,55,45,0.14)]"
        initial={false}
        key={waking ? `wake-${presentation.sequence}` : "steady"}
        data-mascot-motion-stage="body-follow"
        onUpdate={(latest) => {
          if (!motionStageReached(presentation.attention?.motionStage, "body")) return;
          const moved = Math.abs(Number(latest.x ?? 0)) > 0.01 || Math.abs(Number(latest.y ?? 0)) > 0.01 || Math.abs(Number(latest.rotate ?? 0)) > 0.01 || Math.abs(Number(latest.scaleX ?? 1) - 1) > 0.001;
          if (!moved || signalled.current.body) return;
          signalled.current.body = true;
          reportVoiceTargetMotion(presentation.attention?.actionId, "body");
        }}
        transition={reduced ? { duration: 0.1 } : { duration: waking ? 1.45 : 0.5, delay: presentation.attention ? voiceTargetStageSeconds.body : 0, ease: [0.16, 1, 0.3, 1] }}
        viewBox="0 0 206 178"
      >
        <motion.g animate={reduced ? undefined : { rotate: waking ? [0, -10, 8, -3, 0] : presentation.attention && bodyEnabled ? gaze * 1.8 : 0 }} data-wake-sprout style={{ originX: "103px", originY: "47px" }} transition={{ duration: waking ? 1.55 : 0.34, delay: waking ? 0.12 : 0.08, ease: [0.16, 1, 0.3, 1] }}>
          <path d="M103 51 C103 39 103 31 100 22" fill="none" stroke="#71946F" strokeLinecap="round" strokeWidth="4" />
          <path d="M100 26 C86 24 78 16 78 7 C90 8 99 14 102 24 Z" fill="#83A87B" />
          <path d="M101 22 C109 10 119 8 129 11 C125 21 115 27 103 27 Z" fill="#6F9970" />
        </motion.g>
        <path d="M103 43 C65 43 38 68 38 108 C38 146 59 163 103 163 C147 163 168 146 168 108 C168 68 141 43 103 43 Z" fill="#FFFDF9" />
        <path d="M103 49 C135 49 158 70 160 105 C158 78 141 61 119 55 C112 53 106 51 103 49 Z" fill="#F3ECE5" opacity="0.58" />
        <motion.g
          animate={reduced ? undefined : waking ? { x: [0, -8, -2, 0], rotate: [0, -8, 3, 0] } : { x: 0, rotate: 0 }}
          data-wake-arm="left"
          style={{ originX: "40px", originY: "119px" }}
          transition={{ duration: 0.95, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        ><ellipse cx="40" cy="119" fill="#FFFDF9" rx="23" ry="20" /></motion.g>
        <motion.g
          animate={reduced ? undefined : waking ? { x: [0, 8, 2, 0], rotate: [0, 8, -3, 0] } : { x: 0, rotate: 0 }}
          data-wake-arm="right"
          style={{ originX: "166px", originY: "119px" }}
          transition={{ duration: 0.95, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        ><ellipse cx="166" cy="119" fill="#FFFDF9" rx="23" ry="20" /></motion.g>
        <ellipse cx="74" cy="126" fill="#F6CFC9" opacity="0.72" rx="12" ry="5" />
        <ellipse cx="132" cy="126" fill="#F6CFC9" opacity="0.72" rx="12" ry="5" />
        {resting ? <g fill="none" stroke="#18212B" strokeLinecap="round" strokeWidth="2.4"><path d="M70 99 Q77 106 84 99" /><path d="M122 99 Q129 106 136 99" /></g> : <motion.g animate={{ x: gaze, y: centerNudge, scaleY: waking ? [0.15, 1.12, 1] : 1 }} data-mascot-motion-stage="gaze-first" data-wake-eyes onUpdate={(latest) => {
          if ((Math.abs(Number(latest.x ?? 0)) <= 0.01 && Math.abs(Number(latest.y ?? 0)) <= 0.01) || signalled.current.eyes) return;
          signalled.current.eyes = true;
          reportVoiceTargetMotion(presentation.attention?.actionId, "eyes");
        }} style={{ originX: "103px", originY: "100px" }} transition={reduced ? { duration: 0.1 } : { duration: waking ? 0.35 : 0.18, delay: voiceTargetStageSeconds.eyes, ease: "easeOut" }}>
          <ellipse cx="78" cy="100" fill="#18212B" rx="7" ry="8" />
          <ellipse cx="128" cy="100" fill="#18212B" rx="7" ry="8" />
          <g>
            <circle cx="80" cy="97" fill="white" r="2.2" /><circle cx="130" cy="97" fill="white" r="2.2" />
          </g>
        </motion.g>}
        {waking || winning ? <path d="M94 116 Q103 130 112 116 Q103 111 94 116 Z" fill="#9C4D42" /> : <path d={uncertain ? "M95 120 Q103 113 111 120" : "M95 116 Q103 123 111 116"} fill="none" stroke="#18212B" strokeLinecap="round" strokeWidth="2.2" />}
        <ellipse cx="75" cy="156" fill="#FFFDF9" rx="14" ry="9" /><ellipse cx="131" cy="156" fill="#FFFDF9" rx="14" ry="9" />
      </motion.svg>
    </div>
    {presentation.bubble && <motion.div animate={{ opacity: 1, y: 0 }} className="mb-10 hidden max-w-[205px] rounded-[18px] border border-flow-border bg-flow-elevated px-5 py-4 text-sm leading-5 text-[#344052] shadow-[0_8px_24px_rgba(35,43,55,0.05)] sm:block" initial={reduced ? false : { opacity: 0, y: 5 }}>{presentation.bubble}</motion.div>}
  </motion.div>;
}
