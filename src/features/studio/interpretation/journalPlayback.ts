import type { LifeContext } from "../../../domain/life-model";
import { parseNumberWords } from "../../day-planner/interpretation/numbers";

export type JournalPlaybackSettings = { volume?: number; muted?: boolean; playbackRate?: number };
export type JournalPlaybackIntent =
  | { type: "journal-playback"; mode: "play" | "pause" | "restart" | "stop"; positionMs?: number; bookmarkOrdinal?: number; contextualTransport?: boolean }
  | { type: "journal-playback"; mode: "configure"; settings: JournalPlaybackSettings };

/** A saved source or an actual playback interaction supplies audio context.
 * The controller asks which owner to control if a bare transport has both. */
export function parseJournalPlayback(text: string, context: LifeContext): JournalPlaybackIntent | null {
  const journal = context.route === "journal" && Boolean(context.activeJournalEntryId);
  if (journal) {
    if (/^(?:listen to|let me hear) (?:(?:the|my|this) )?(?:audio|recording|it)$/.test(text)) return { type: "journal-playback", mode: "play" };
    if (/^(?:start (?:it )?over|play (?:it |the audio |the recording )?again)$/.test(text)) return { type: "journal-playback", mode: "restart" };
    const bare = text.match(/^(pause|resume|continue|stop)$/);
    if (bare && context.activePlayback?.kind === "journal" && context.activePlayback.id === context.activeJournalEntryId) return { type: "journal-playback", mode: bare[1] === "pause" ? "pause" : bare[1] === "stop" ? "stop" : "play", contextualTransport: true };
    if (/^(?:play|replay|restart) (?:(?:the|my|this) )?(?:audio|recording|it)$/.test(text)) return { type: "journal-playback", mode: /^(?:replay|restart)/.test(text) ? "restart" : "play" };
    if (/^(?:play|start) (?:it )?(?:from|at) the beginning$/.test(text)) return { type: "journal-playback", mode: "restart" };
    if (/^continue playing$/.test(text)) return { type: "journal-playback", mode: "play" };
    const transport = text.match(/^(play|pause|resume|restart|replay|stop) (?:(?:the|my|this) )?(?:audio|playback|player)$/);
    if (transport) return { type: "journal-playback", mode: transport[1] === "pause" ? "pause" : transport[1] === "stop" ? "stop" : /^(?:restart|replay)$/.test(transport[1]!) ? "restart" : "play" };
    if (!/\bjournal\b/.test(text)) text = text.replace(/\b(?:(?:the|my|this) )?audio\b/, "journal audio");
  }
  const mute = text.match(/^(mute|unmute) (?:the |this )?journal (?:playback|audio|recording)$/);
  if (mute) return { type: "journal-playback", mode: "configure", settings: { muted: mute[1] === "mute" } };
  const volume = text.match(/^set (?:the |this )?journal (?:playback |audio |recording )?volume to (.+?) (?:percent|%)$/);
  if (volume) {
    const value = /^\d+(?:\.\d+)?$/.test(volume[1]!) ? Number(volume[1]) : parseNumberWords(volume[1]!);
    if (value !== null && value !== undefined) return { type: "journal-playback", mode: "configure", settings: { volume: value / 100 } };
  }
  const rate = text.match(/^set (?:the |this )?journal (?:playback |audio |recording )?(?:speed|rate) to (\d+(?:\.\d+)?)(?: times|x)?$/);
  if (rate) return { type: "journal-playback", mode: "configure", settings: { playbackRate: Number(rate[1]) } };
  const bookmark = text.match(/^(?:play|select and play) (?:the )?(?:journal )?bookmark (\d+)$/)
    ?? text.match(/^play (?:the )?(first|second|third|fourth|fifth) (?:journal )?bookmark$/);
  if (bookmark && (context.activeJournalEntryId || context.route === "journal" || /journal/.test(text))) {
    const ordinal = ({ first: 1, second: 2, third: 3, fourth: 4, fifth: 5 } as Record<string, number>)[bookmark[1]!] ?? Number(bookmark[1]);
    return { type: "journal-playback", mode: "play", bookmarkOrdinal: ordinal };
  }
  const seek = text.match(/^(?:seek|take|move) (?:the |this )?journal (?:recording|audio)(?: to)? (.+?) (seconds?|minutes?)(?: in)?$/);
  if (seek) {
    const value = /^\d+(?:\.\d+)?$/.test(seek[1]!) ? Number(seek[1]) : parseNumberWords(seek[1]!);
    return value === null || value === undefined ? null : { type: "journal-playback", mode: "play", positionMs: value * (/minute/.test(seek[2]!) ? 60000 : 1000) };
  }
  const transport = text.match(/^(play|pause|resume|restart|replay) (?:the |this )?(?:journal (?:recording|audio|playback)|(?:entry(?:'s)? )recording)$/)
    ?? text.match(/^(play|pause|resume|restart|replay) playback of (?:the |this )?journal$/);
  if (!transport) return null;
  return { type: "journal-playback", mode: /^(?:restart|replay)$/.test(transport[1]!) ? "restart" : transport[1] === "pause" ? "pause" : "play" };
}
