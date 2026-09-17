import { useRef } from "react";
import type { VoiceNote } from "../../domain/friends-model";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { useStudioRuntime } from "../studio/StudioRuntimeProvider";
import { useStudioMediaUrl } from "../studio/useStudioMediaUrl";
import { useStudioPlayback } from "../studio/useStudioPlayback";
import { warmButton, warmCard, warmQuietButton } from "../../shared/design-system/WorldPageShell";
import { RecordingMoments } from "../studio/RecordingMoments";

export function VoiceNoteSpace({ note }: { note: VoiceNote }) {
  const environment = useFlowEnvironment();
  const runtime = useStudioRuntime();
  const recorder = runtime.recorder.entryId === note.id ? runtime.recorder : undefined;
  const audio = useRef<HTMLAudioElement>(null);
  const active = recorder?.status === "recording" || recorder?.status === "paused";
  const media = useStudioMediaUrl(note.audioAssetId, active ? "recording" : recorder?.status === "saving" ? "finalizing" : undefined);
  useStudioPlayback(audio, "voice-note-playback", note.id, 0, undefined, media, () => environment.selectRecordingPlayback({ kind: "voice-note", id: note.id }));
  const elapsed = Math.round((recorder?.elapsedMs ?? note.recordingDurationMs) / 1000);
  const run = (operation: "start" | "pause" | "resume" | "stop" | "play" | "send" | "discard") => environment.dispatchFriend({ type: "friend-voice", operation, noteId: note.id });
  return <section className={`${warmCard} mb-5 p-6`} aria-label="Voice note recorder" data-voice-note-id={note.id} data-page-task="recording" data-task-entity-id={note.id}>
    <p className="text-xs uppercase tracking-[0.16em] text-flow-secondary">{note.title}</p>
    <div className="my-7 flex items-center gap-4" aria-label="Recording timeline"><span className="h-px flex-1 bg-[#DBD4CB]" /><time className="font-mono text-3xl tabular-nums">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</time><span className="h-px flex-1 bg-[#DBD4CB]" /></div>
    <div className="mt-5 flex flex-wrap gap-2">{!active && !note.audioAssetId && <button data-action-id="friends.record-start" className={warmButton} type="button" onClick={() => run("start")}>Start recording</button>}{active && <><button data-action-id="friends.record-pause-resume" className={warmQuietButton} type="button" onClick={() => run(recorder?.status === "paused" ? "resume" : "pause")}>{recorder?.status === "paused" ? "Continue" : "Pause"}</button><button data-action-id="friends.record-stop" className={warmQuietButton} type="button" onClick={() => run("stop")}>Stop</button></>}{note.audioAssetId && <button data-action-id="friends.voice-review" className={warmButton} type="button" onClick={() => run("send")}>Review delivery</button>}<button data-action-id="friends.voice-discard" className={warmQuietButton} type="button" onClick={() => run("discard")}>Discard note</button></div>
    <p className="min-h-24 whitespace-pre-wrap text-lg leading-8">{note.text || "Your words will appear here while you speak."}</p>
    <p className="mt-4 text-xs text-flow-secondary" role="status">{recorder?.error ?? (recorder?.status === "requesting" ? "Waiting for microphone permission…" : recorder?.status === "saving" ? "Saving original audio…" : active ? `${recorder?.status === "paused" ? "Paused" : "Recording"} · Say “Mark that”, “Stop”, or “Send it”.` : note.audioAssetId ? "Original audio saved on this device." : "No audio recorded yet.")}</p>
    {media.url && !active && <audio data-action-id="friends.note-audio" ref={audio} className="mt-4 w-full" controls src={media.url} aria-label="Original voice note" />}
    {(media.state === "missing" || media.state === "failed") && note.audioAssetId && <p className="mt-3 text-sm text-flow-error">The original audio is unavailable on this device.</p>}

    <p className="mt-4 text-xs leading-5 text-flow-muted">Controls are kept out of the transcript. The original audio may still include spoken controls.</p>
    <RecordingMoments target={{ kind: "voice-note", id: note.id }} markers={note.markers} />
  </section>;
}
