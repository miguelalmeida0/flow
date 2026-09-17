import { useEffect, useState } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";

export function RewardInspector() {
  const { reward, commandPresentation, dispatchPresentation } = useFlowEnvironment();
  const open = commandPresentation.rewardInspectorOpen;
  const [live, setLive] = useState({ animations: 0, clones: 0, audioNodes: 0 });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const toggle = (event: KeyboardEvent) => { if (event.shiftKey && event.key.toLowerCase() === "r") dispatchPresentation({ type: "command-surface", surface: "reward-inspector", open: !open }); };
    window.addEventListener("keydown", toggle);
    return () => window.removeEventListener("keydown", toggle);
  }, [open, dispatchPresentation]);
  useEffect(() => {
    if (!import.meta.env.DEV || !open) return;
    const read = () => {
      const motion = (window as typeof window & { __FLOW_MOTION__?: { activeClones?: number } }).__FLOW_MOTION__;
      const sound = (window as typeof window & { __FLOW_SOUND__?: { activeNodes?: number } }).__FLOW_SOUND__;
      setLive({
        animations: document.getAnimations().filter(({ playState }) => playState === "running").length,
        clones: motion?.activeClones ?? document.querySelectorAll("[data-transition-clone-count]").length,
        audioNodes: sound?.activeNodes ?? 0,
      });
    };
    read();
    const timer = window.setInterval(read, 250);
    return () => window.clearInterval(timer);
  }, [open]);
  if (!import.meta.env.DEV || !open) return null;
  return <aside className="fixed right-5 top-24 z-[70] w-[330px] rounded-[20px] border border-flow-border bg-[#17212C] p-5 text-xs text-white shadow-2xl" data-reward-inspector>
    <div className="flex items-center justify-between"><strong className="tracking-wide">Reward inspector</strong><button data-action-id="diagnostic.reward-inspector" className="min-h-10 px-2 text-white/70" data-flow-action="Close reward inspector" onClick={() => dispatchPresentation({ type: "command-surface", surface: "reward-inspector", open: false })} type="button">Close</button></div>
    <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-white/70"><dt>Sequence</dt><dd>{reward.sequence}</dd><dt>Event</dt><dd>{reward.event?.type ?? "none"}</dd><dt>Active</dt><dd>{String(reward.active)}</dd><dt>Level</dt><dd>{reward.plan?.level ?? 0}</dd><dt>Recipe</dt><dd>{reward.plan?.recipe.id ?? "none"}</dd><dt>Family</dt><dd>{reward.plan?.recipe.family ?? "none"}</dd><dt>Reduced</dt><dd>{String(reward.plan?.reducedMotion ?? false)}</dd><dt>Motion owner</dt><dd>{reward.activeMotionOwner}</dd><dt>Plan animations</dt><dd>{reward.animationCount}</dd><dt>Live animations</dt><dd>{live.animations}</dd><dt>Transition clones</dt><dd>{live.clones}</dd><dt>Audio context</dt><dd>{reward.audioContextState}</dd><dt>Audio nodes</dt><dd>{live.audioNodes}</dd><dt>Sound cue</dt><dd>{reward.soundCue ?? "none"}</dd><dt>Mascot</dt><dd>{reward.mascotState}</dd><dt>Suppression</dt><dd>{reward.suppressionReason}</dd></dl>
    <p className="mt-4 break-words border-t border-white/10 pt-4 text-white/60">{reward.plan?.recipe.id ?? reward.event?.type ?? "No event yet"}</p>
  </aside>;
}
