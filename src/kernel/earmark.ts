/**
 * Earmark foundation. A voice recording should eventually yield derived
 * items (tasks/decisions/questions/commitments), each linked back to the
 * exact moment in the recording it came from. This sprint only lands the
 * shapes the kernel needs to represent that later — no extraction pipeline,
 * no UI. A derived item is deliberately NOT auto-committed to the calendar,
 * plans, or commitments; turning one into a real capability call is a
 * separate, explicit user action (consistent with memory's explicit-store
 * rule in memoryStore.ts).
 */
export interface SourceRecording {
  id: string;
  kind: "journal" | "voice-note";
  durationMs: number;
}

export interface AudioTimestamp {
  recordingId: string;
  atMs: number;
}

export interface VoiceMoment {
  id: string;
  recording: AudioTimestamp;
  transcript: string;
}

export type DerivedItemKind = "task" | "decision" | "question" | "commitment";

export interface DerivedItem {
  id: string;
  kind: DerivedItemKind;
  text: string;
  sourceMoment: VoiceMoment;
  /** Set once the user turns this into a real capability call (e.g. plans.create). */
  promotedCapabilityId?: string;
  promotedEntityId?: string;
}
