import { useEffect, useRef, type RefObject } from "react";
import { playStudioElement, type StudioPlaybackRequest } from "./studioPlayback";
import type { MediaReadState } from "./useStudioMediaUrl";
import { setVoicePlaybackActive } from "../voice/promptSpeech";

/** The component supplies a native element, never interprets language. */
export function useStudioPlayback(audio: RefObject<HTMLAudioElement | null>, target: "journal-playback" | "voice-note-playback" | "memory", id: string, startMs: number, endMs: number | undefined, media: { url?: string; state: MediaReadState }, onNativeActivation?: () => void, onPlaybackState?: (status: "playing" | "paused" | "stopped") => void) {
  const activation = useRef(onNativeActivation); activation.current = onNativeActivation;
  const playbackState = useRef(onPlaybackState); playbackState.current = onPlaybackState;
  const programmatic = useRef(0);
  useEffect(() => {
    const element = audio.current, owner = `${target}:${id}`;
    if (!element) return;
    const activated = () => activation.current?.();
    const playing = () => { if (!programmatic.current) activated(); setVoicePlaybackActive(owner, true, () => element.pause()); playbackState.current?.("playing"); };
    const stopped = () => { setVoicePlaybackActive(owner, false); playbackState.current?.("paused"); };
    const ended = () => { setVoicePlaybackActive(owner, false); playbackState.current?.("stopped"); };
    element.addEventListener("pointerdown", activated); element.addEventListener("keydown", activated);
    element.addEventListener("play", playing); element.addEventListener("pause", stopped); element.addEventListener("ended", ended);
    return () => { setVoicePlaybackActive(owner, false); element.removeEventListener("pointerdown", activated); element.removeEventListener("keydown", activated); element.removeEventListener("play", playing); element.removeEventListener("pause", stopped); element.removeEventListener("ended", ended); if (!element.paused) element.pause(); };
  }, [audio, id, target, media.url]);
  useEffect(() => {
    const playback = (event: Event) => {
      const { command, accept } = (event as CustomEvent<StudioPlaybackRequest>).detail;
      if (command.target !== target || (command.target === "memory" ? command.memoryId : command.entryId) !== id) return;
      const element = audio.current;
      if (element && media.url) accept(async () => {
        // A command's own native play event must not supersede that command's
        // epoch, pending confirmation or already-bound marker selection.
        programmatic.current += 1;
        try { await playStudioElement(element, command, { startMs, endMs }); }
        finally { programmatic.current -= 1; }
      });
      else if (media.state === "missing" || media.state === "failed") accept(() => Promise.reject(new Error("The original recording is unavailable on this device. No playback started.")));
    };
    window.addEventListener("flow-studio-playback", playback);
    window.dispatchEvent(new Event("flow-studio-playback-ready"));
    return () => window.removeEventListener("flow-studio-playback", playback);
  }, [audio, target, id, startMs, endMs, media.url, media.state]);
}
