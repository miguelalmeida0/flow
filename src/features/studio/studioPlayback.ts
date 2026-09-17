import type { JournalPlaybackSettings } from "./interpretation/journalPlayback";

export type StudioPlaybackCommand =
  | { target: "voice-note-playback"; entryId: string; mode: "play" | "pause" | "restart" | "stop"; positionMs?: number }
  | { target: "voice-note-playback"; entryId: string; mode: "configure"; settings: JournalPlaybackSettings }
  | { target: "journal-playback"; entryId: string; mode: "play" | "pause" | "restart" | "stop"; positionMs?: number }
  | { target: "journal-playback"; entryId: string; mode: "configure"; settings: JournalPlaybackSettings }
  | { target: "memory"; memoryId: string; mode: "play" | "pause" | "restart" };

export interface StudioPlaybackRequest {
  command: StudioPlaybackCommand;
  accept: (completion: () => Promise<void>) => boolean;
}

/** Navigation and local Blob loading can finish after command dispatch. Only
 * the bound target may accept, and only while the originating command is current.
 * Readiness is not playback success: the native play promise remains authoritative. */
export function requestStudioPlayback(command: StudioPlaybackCommand, isCurrent: () => boolean = () => true): Promise<void> {
  return new Promise((resolve, reject) => {
    let accepted = false;
    const cleanup = () => { clearTimeout(timeout); window.removeEventListener("flow-studio-playback-ready", attempt); };
    const accept: StudioPlaybackRequest["accept"] = (completion) => {
      if (accepted || !isCurrent()) return false;
      accepted = true; cleanup();
      void Promise.resolve().then(() => isCurrent() ? completion() : undefined).then(resolve, reject);
      return true;
    };
    const attempt = () => {
      if (!isCurrent()) { cleanup(); resolve(); return; }
      window.dispatchEvent(new CustomEvent<StudioPlaybackRequest>("flow-studio-playback", { detail: { command, accept } }));
    };
    const timeout = setTimeout(() => {
      cleanup();
      if (!isCurrent()) resolve();
      else reject(new Error("The requested recording has not loaded. Check its original audio and try again."));
    }, 2000);
    window.addEventListener("flow-studio-playback-ready", attempt);
    attempt();
  });
}

export async function playStudioElement(audio: HTMLMediaElement, command: StudioPlaybackCommand, range: { startMs: number; endMs?: number }) {
  if (command.mode === "configure") {
    const { volume, muted, playbackRate } = command.settings;
    if (volume !== undefined) audio.volume = volume;
    if (muted !== undefined) audio.muted = muted;
    if (playbackRate !== undefined) audio.playbackRate = playbackRate;
    return;
  }
  if (command.mode === "pause") { audio.pause(); return; }
  if (command.mode === "stop") { audio.pause(); audio.currentTime = range.startMs / 1000; return; }
  const position = command.target !== "memory" ? command.positionMs : undefined;
  if (position !== undefined) audio.currentTime = Math.max(range.startMs, Math.min(range.endMs ?? Infinity, position)) / 1000;
  else if (command.mode === "restart" || audio.currentTime * 1000 < range.startMs || range.endMs !== undefined && audio.currentTime * 1000 >= range.endMs) audio.currentTime = range.startMs / 1000;
  try { await audio.play(); }
  catch { throw new Error("Playback could not start. Use the recording's Play control to allow sound, then try again."); }
}
