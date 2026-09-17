export type SpaceId =
  | "home"
  | "calendar"
  | "inbox"
  | "plans"
  | "people"
  | "now";

export type VoiceSessionStatus =
  | "off"
  | "requesting-permission"
  | "starting"
  | "listening"
  | "processing"
  | "recovering"
  | "paused"
  | "permission-denied"
  | "unavailable";

export interface ConversationContext {
  activeSpace: SpaceId;
  previousSpace?: SpaceId;
  selectedEntityId?: string;
  lastReferencedEntityId?: string;
  lastChangedEntityId?: string;
  lastCreatedEntityId?: string;
  pendingClarification?: {
    id: string;
    prompt: string;
    optionIds: string[];
  };
  lastCommandAt?: number;
}

export type UnsupportedReason =
  | "no-intent"
  | "missing-reference"
  | "missing-time"
  | "ambiguous"
  | "unsupported-domain";

export type RoutedIntent =
  | {
      kind: "system";
      action: "pause" | "resume" | "undo" | "redo" | "cancel";
    }
  | {
      kind: "navigate";
      target: SpaceId;
    }
  | {
      kind: "life-action";
      actions: unknown[];
    }
  | {
      kind: "clarification";
      prompt: string;
      options: Array<{ id: string; label: string }>;
    }
  | {
      kind: "unsupported";
      transcript: string;
      reason: UnsupportedReason;
    };
