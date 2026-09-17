import { normalizeTranscript } from "../day-planner/interpretation/normalize";

export type WakeEnvelope =
  | { kind: "none" }
  | { kind: "wake" }
  | { kind: "wake-command"; command: string };

/** The wake phrase is session framing only. Business meaning is still owned by
 * the global interpreter after this envelope is removed. */
export function readWakeEnvelope(transcript: string): WakeEnvelope {
  const normalized = normalizeTranscript(transcript);
  if (/^(?:hey )?flow$/.test(normalized)) return { kind: "wake" };
  if (!/^(?:hey )?flow\b/.test(normalized)) return { kind: "none" };
  const command = transcript
    .trim()
    .replace(/^(?:hey\s+)?flow\b[\s,.:;!?—–-]*/i, "")
    .trim();
  return command ? { kind: "wake-command", command } : { kind: "wake" };
}

export function withoutWakePrefix(transcript: string) {
  // These are established whole-utterance session controls, not a wake word
  // wrapped around a second command.
  if (/^flow\s+(?:live|sleep)[.!?]*$/i.test(transcript.trim())) return transcript.trim();
  const envelope = readWakeEnvelope(transcript);
  return envelope.kind === "wake-command" ? envelope.command : transcript.trim();
}
