import type { RewardPreferences } from "../../core/rewards/reward-types";

export type PresentationIntent =
  | { type: "voice-retry" }
  | { type: "command-surface"; surface: "composer" | "settings" | "voice-inspector" | "reward-inspector"; open: boolean }
  | { type: "sensory-preference"; patch: Partial<RewardPreferences> };
export interface CommandPresentation {
  composerRequest?: { open: boolean; sequence: number };
  settingsOpen: boolean;
  voiceInspectorOpen: boolean;
  rewardInspectorOpen: boolean;
  soundAwaitingGesture: boolean;
}
export const initialCommandPresentation: CommandPresentation = { settingsOpen: false, voiceInspectorOpen: false, rewardInspectorOpen: false, soundAwaitingGesture: false };

/** Presentation preferences and disclosure are separate from business history. */
export function parsePresentationCapability(text: string, legacy = false): PresentationIntent | null {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, "");
  if (/^retry (?:the )?(?:voice command|flow live|microphone)$/.test(normalized) || (legacy && normalized === "try again")) return { type: "voice-retry" };
  const command = normalized.match(/^(open|show|close|hide) (?:the )?(flow command|command (?:field|composer)|keyboard input|sensory settings|reward and motion settings|voice inspector|reward inspector)$/);
  if (command) return { type: "command-surface", surface: /inspector/.test(command[2]!) ? command[2]!.startsWith("voice") ? "voice-inspector" : "reward-inspector" : /settings/.test(command[2]!) ? "settings" : "composer", open: /^(?:open|show)$/.test(command[1]!) };
  const motion = normalized.match(/^(?:use|set|switch to) (system|full|reduced) motion(?: preference)?$/);
  if (motion) return { type: "sensory-preference", patch: { motion: motion[1] as RewardPreferences["motion"] } };
  if (/^follow (?:the )?system motion preference$/.test(normalized)) return { type: "sensory-preference", patch: { motion: "system" } };
  const mascot = normalized.match(/^(?:use|set) (helpful|minimal) mascot(?: responses)?$/);
  if (mascot) return { type: "sensory-preference", patch: { mascot: mascot[1] as RewardPreferences["mascot"] } };
  if (/^(?:turn (?:the )?reward sound off|disable (?:the )?reward sound)$/.test(normalized)) return { type: "sensory-preference", patch: { sound: false } };
  if (/^(?:turn (?:the )?reward sound on|enable (?:the )?reward sound)$/.test(normalized)) return { type: "sensory-preference", patch: { sound: true } };
  return null;
}

export type PlannerPresentationIntent = Extract<PresentationIntent, { type: "voice-retry" }> | { type: "command-surface"; surface: "composer"; open: boolean };
export interface PlannerPresentationRequest { intent: PlannerPresentationIntent; sequence: number }
/** The conditional standalone planner has only these two presentation targets. */
export function parsePlannerPresentation(text: string): PlannerPresentationIntent | null {
  const intent = parsePresentationCapability(text, true);
  return intent?.type === "voice-retry" ? intent : intent?.type === "command-surface" && intent.surface === "composer" ? { ...intent, surface: "composer" } : null;
}
