import type { RecordingTarget } from "../../domain/friends-actions";
import { patchCommandTrace } from "../../app/commandTrace";
import { journalRuntimePosition } from "./journalRuntimeClock";
const recordingCommands = new Map<string, string>();
export const recordingCommandId = (targetId: string) => recordingCommands.get(targetId);

export type RecordingOperation = "start" | "pause" | "resume" | "stop" | "discard";
export interface RecordingRequest {
  target: RecordingTarget;
  mode: RecordingOperation;
  isCurrent: () => boolean;
  accept: (completion: () => Promise<void>) => void;
}
/** The existing Studio owner accepts this exact target; no extra recorder. */
export function requestStudioRecording(target: RecordingTarget, mode: RecordingOperation, isCurrent: () => boolean = () => true, commandId = window.__FLOW_COMMAND_TRACE__?.commandId): Promise<void> {
  if (mode === "start" && commandId) recordingCommands.set(target.id, commandId);
  return new Promise((resolve, reject) => {
    let accepted = false;
    window.dispatchEvent(new CustomEvent<RecordingRequest>("flow-recording-runtime", { detail: { target, mode, isCurrent, accept: (complete) => {
      if (accepted || !isCurrent()) return;
      accepted = true;
      void Promise.resolve().then(complete).then(() => { const elapsedMs = journalRuntimePosition(target.id); patchCommandTrace(commandId, { recording: { targetId: target.id, kind: target.kind, state: mode === "start" && elapsedMs === undefined ? "not-recording" : mode, elapsedMs } }); resolve(); }, (error: unknown) => { patchCommandTrace(commandId, { recording: { targetId: target.id, kind: target.kind, state: "failed", error: error instanceof Error ? error.message : String(error) } }); reject(error); });
    } } }));
    if (!accepted) reject(new Error(isCurrent() ? "The recording surface is unavailable." : "That recording request was cancelled."));
  });
}
