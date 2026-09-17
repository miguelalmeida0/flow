import type { MascotState, RewardRuntimeSnapshot } from "../rewards/reward-types";
import type { FlowLiveStatus } from "../../features/voice/useFlowLiveSession";
import type { PlannerPhase } from "../../features/day-planner/model";
import type { WorldDestination } from "../../domain/life-model";
import type { VoiceTargetDirection } from "../../features/voice-home/voiceWorld";
import type { VoiceTargetMotionStage } from "../../shared/motion/voiceMotionHandshake";

export interface MascotAttentionTarget {
  domain?: WorldDestination;
  entityId?: string;
  direction: VoiceTargetDirection;
  actionId?: string;
  motionStage?: VoiceTargetMotionStage;
}

export interface MascotPresentation {
  state: MascotState;
  bubble?: string;
  sequence: number;
  attention?: MascotAttentionTarget;
  ceremony?: "wake";
}

/** State vocabulary is broader than visible presence. Routine wins, rest,
 * focused work and stale post-ceremony dwell never summon the character. */
export function isHighLeverageMascotMoment(presentation: MascotPresentation, reward: RewardRuntimeSnapshot, focusActive: boolean) {
  if (focusActive) return false;
  if (presentation.state === "listening" || presentation.state === "thinking") return true;
  if (!reward.active) return false;
  if (presentation.state === "understood") return reward.event?.type === "voice-understood";
  return presentation.state === "big-win" && reward.plan?.level === 3 && reward.event?.type === "transaction-committed";
}

export function mascotPresentation(reward: RewardRuntimeSnapshot, voiceStatus: FlowLiveStatus, feedbackPhase: PlannerPhase, focusActive: boolean): MascotPresentation {
  if (voiceStatus === "interpreting" || feedbackPhase === "understanding" && voiceStatus === "listening") return { state: "thinking", sequence: reward.sequence };
  if (voiceStatus === "listening") return { state: "listening", bubble: "I’m listening.", sequence: reward.sequence };
  if (feedbackPhase === "clarification" || feedbackPhase === "error") return { state: "uncertain", bubble: "I need one clear detail.", sequence: reward.sequence };
  if (reward.plan && (reward.active || reward.mascotState !== "resting")) return { state: reward.mascotState, bubble: reward.plan.level === 3 ? reward.plan.recipe.label : undefined, sequence: reward.sequence };
  if (focusActive) return { state: "focused", bubble: "I’ll keep things quiet while you focus.", sequence: reward.sequence };
  if (voiceStatus === "live-idle") return { state: "attentive", sequence: reward.sequence };
  return { state: "resting", sequence: reward.sequence };
}
