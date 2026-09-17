import type { LifeContext } from "../../../domain/life-model";
import { numberToken, parseNumberWords } from "../../day-planner/interpretation/numbers";
import { normalizeTranscript } from "../../day-planner/interpretation/normalize";
import type { StudioIntent } from "./studioInterpreter";
import { annotatedLiteralValue } from "../../../shared/command/literalValue";

/** Memory's existing editor properties, grounded by its domain and complete
 * property expressions. Content values are handled by the raw literal parser. */
export function parseMemoryEditing(source: string, context: LifeContext): StudioIntent | null {
  const text = normalizeTranscript(source).replace(/\s+(?:a bit|slightly)$/, "").replace(/\blast second\b/, "last one second");
  if (context.route !== "memories" && context.topic !== "memory" && !/\b(?:this memory|memory's)\b/.test(text)) return null;
  const rawText = source.trim().match(/^set the memory(?:'s|’s) words to\s+([\s\S]+)$/i)
    ?? source.trim().match(/^replace only the displayed words,? using\s+([\s\S]+)$/i);
  if (rawText) {
    const value = annotatedLiteralValue(rawText[1]!);
    return value === null ? null : { type: "memory-edit", property: "passage", value };
  }
  const lettering = text.match(/^only the (?:lettering|text|words) should move (up|down); keep the photograph where it is$/);
  if (lettering) return { type: "memory-update", property: "textY", operation: lettering[1] as "up" | "down" };
  const preserveVoice = text.match(/^make the words (smaller|larger),? and keep the voice included$/);
  if (preserveVoice) return { type: "memory-update", property: "textScale", operation: preserveVoice[1] === "smaller" ? "decrease" : "increase", requireAudioEnabled: true };
  if (/^the date belongs in the corner,? and the words must not move$/.test(text)) return { type: "memory-update", property: "dateCorner", operation: "show" };
  const composition = text.match(/^(?:show|make) (?:this|the) memory as (?:a )?(still|page|voice)(?: rather than (?:a )?(?:still|page|voice))?$/);
  if (composition) return { type: "memory-composition", composition: composition[1] as "still" | "page" | "voice" };
  if (/^(?:enlarge (?:the )?(?:words|text)(?: on this memory)?|(?:make )?(?:the |its )?(?:words|text)(?: should be)? (?:a little )?(?:larger|bigger|smaller))$/.test(text)) return { type: "memory-update", property: "textScale", operation: /smaller$/.test(text) ? "decrease" : "increase" };
  if (/^(?:hide|remove) (?:the )?(?:photograph|photo|image) for this version$/.test(text)) return { type: "memory-update", property: "photo", operation: "hide" };
  if (/^put (?:the )?date back on$/.test(text)) return { type: "memory-update", property: "showDate", operation: "show" };
  const position = text.match(/^(?:move (?:the )?(?:words|text) (up|down)|(?:raise|lower) (?:the )?(?:words|text))$/);
  if (position) return { type: "memory-update", property: "textY", operation: position[1] === "up" || text.startsWith("raise") ? "up" : "down" };
  const date = text.match(/^(?:put|place|show) (?:the )?(?:memory's )?date (in the corner|beneath the words|below the words)$/);
  if (date) return { type: "memory-update", property: "dateCorner", operation: date[1] === "in the corner" ? "show" : "hide" };
  if (/^leave (?:the )?(?:voice|audio) out(?: of this memory)?$/.test(text)) return { type: "memory-update", property: "audioEnabled", operation: "hide" };
  if (/^save (?:the |this )?memory(?: as it is)?$/.test(text)) return { type: "memory-save" };
  const amount = `(${numberToken})`;
  const shifts = [
    { expression: `^(?:start|end) (?:the )?(?:voice|audio) excerpt ${amount} seconds? (sooner|earlier|later)$`, edge: /^end/.test(text) ? "out" as const : "in" as const, sign: /later$/.test(text) ? 1 : -1 },
    { expression: `^bring (?:the )?(?:start|beginning|end) of (?:the )?(?:voice|audio) excerpt back by ${amount} seconds?$`, edge: /\b(?:start|beginning)\b/.test(text) ? "in" as const : "out" as const, sign: -1 },
    { expression: `^cut ${amount} seconds? from (?:the )?(?:beginning|start|end) of (?:the )?(?:voice|audio)$`, edge: /\b(?:beginning|start)\b/.test(text) ? "in" as const : "out" as const, sign: /\b(?:beginning|start)\b/.test(text) ? 1 : -1 },
    { expression: `^leave out (?:the )?last ${amount} seconds? of (?:voice|audio)$`, edge: "out" as const, sign: -1 },
  ];
  for (const shift of shifts) {
    const match = text.match(new RegExp(shift.expression));
    const seconds = match?.[1] ? parseNumberWords(match[1]) : null;
    if (seconds !== null) return { type: "memory-audio-trim", edge: shift.edge, deltaMs: seconds * 1000 * shift.sign };
  }
  return null;
}
