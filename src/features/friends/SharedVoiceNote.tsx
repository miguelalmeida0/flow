import { useRef } from "react";
import type { FriendMessage } from "../../domain/friends-model";
import { useStudioMediaUrl } from "../studio/useStudioMediaUrl";
import { useStudioPlayback } from "../studio/useStudioPlayback";
import { RecordingMoments } from "../studio/RecordingMoments";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";

export function SharedVoiceNote({ message }: { message: FriendMessage }) {
  const environment = useFlowEnvironment();
  const audio = useRef<HTMLAudioElement>(null);
  const attachment = message.attachment!;
  const media = useStudioMediaUrl(attachment.assetId);
  useStudioPlayback(audio, "voice-note-playback", message.id, 0, attachment.durationMs, media, () => environment.selectRecordingPlayback({ kind: "shared-message", id: message.id }));
  const markers = attachment.markers?.map((marker) => ({ ...marker, recordingId: message.id, segmentIds: [], origin: "manual" as const, alignment: "segment-estimate" as const, status: "kept" as const, createdAt: message.createdAt })) ?? [];
  return <div className="mt-3 rounded-2xl border border-[#E8E0D7] p-4"><h3 className="text-sm font-medium">{attachment.title}</h3>{media.url ? <audio data-action-id="friends.shared-audio" className="mt-3 w-full" aria-label={`Shared recording: ${attachment.title}`} ref={audio} controls src={media.url} /> : <p className="mt-3 text-xs text-flow-secondary">{media.missing || media.state === "failed" ? "This shared recording is unavailable on this device." : "Loading shared recording…"}</p>}<RecordingMoments target={{ kind: "shared-message", id: message.id }} markers={markers} /></div>;
}
