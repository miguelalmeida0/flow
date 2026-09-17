import type { LifeContext } from "../../../domain/life-model";
import { normalizeTranscript } from "../../day-planner/interpretation/normalize";
import { literalValue } from "../../../shared/command/literalValue";
import { journalRoleFrame } from "./journalRoleFrames";
import { journalBookmarkAnchor } from "../journalBookmark";

export type JournalEditingIntent = (
  | { type: "journal-delete" }
  | { type: "journal-text-edit"; unit: "sentence" | "paragraph" | "text"; operation: "replace" | "remove" | "append"; target?: "selection"; value?: string }
  | { type: "journal-tags"; operation: "set" | "add" | "remove"; tags: string[]; preserveTags?: string[] }
  | { type: "journal-clear-drawing" }
  | { type: "journal-rename"; title: string }
  | { type: "journal-create"; initialText?: string; beginRecording: boolean }
  | { type: "journal-recording"; mode: "start" | "pause" | "resume" | "stop" }
  | { type: "journal-bookmark"; anchor: "current" | "recent" | "selection" | "last-sentence" }
) & { journalSource?: "memory" };

export function parseJournalCapability(source: string, context: LifeContext): JournalEditingIntent | null {
  const text = normalizeTranscript(source);
  const active = context.route === "journal" || context.topic === "journal" || Boolean(context.activeJournalEntryId && context.voiceMode === "journal-longform");
  if (/^(?:delete|remove|discard) (?:the |my )?(?:this |current |active )?(?:journal(?: entry)?|entry)(?: i(?:'m| am) writing)?$/.test(text)
    || /^throw (?:this|the|my) (?:journal(?: entry)?|entry) away$/.test(text)) return { type: "journal-delete" };
  if (/^(?:create (?:a )?journal|another journal|let me write|record a thought|write this down in my journal|i want to journal|i want to write)$/.test(text)) return { type: "journal-create", beginRecording: false };
  const explicit = /\bjournal\b/.test(text);
  if (active || explicit) {
    const raw = source.trim();
    const role = journalRoleFrame(raw);
    if (role) return role;
    const fullText = raw.match(/^(?:replace|change|set)\s+(?:the )?(?:journal )?(?:text|words)\s+(?:with|to)\s+([\s\S]+)$/i)
      ?? raw.match(/^make (?:the )?entry's (?:text|words) say\s+([\s\S]+)$/i);
    if (fullText) return { type: "journal-text-edit", unit: "text", operation: "replace", value: literalValue(fullText[1]!) };
    const tags = raw.match(/^(set|add|remove)\s+(?:the )?(?:journal )?tags?(?:\s+to)?\s+([\s\S]+)$/i);
    if (tags) return { type: "journal-tags", operation: tags[1]!.toLowerCase() as "set" | "add" | "remove", tags: literalValue(tags[2]!).split(",").map((value) => value.trim()).filter(Boolean) };
    const removeTag = raw.match(/^remove (?:the )?(.+?) tag from (?:this|the) journal$/i);
    if (removeTag) return { type: "journal-tags", operation: "remove", tags: [literalValue(removeTag[1]!)] };
    if (/^(?:clear|erase) (?:the |this )?(?:journal )?(?:sketch|drawing|marks)$/.test(text)) return { type: "journal-clear-drawing" };
    const rename = raw.match(/^(?:rename|call|name)\s+(?:(?:this|the|my|current)\s+)?(?:journal|entry)\s+(?:to\s+)?(.+)$/i)
      ?? raw.match(/^(?:change|set)\s+(?:(?:this|the|my|current)\s+)?(?:journal|entry)(?:'s|’s)?\s+(?:heading|name|title)\s+to\s+(.+)$/i)
      ?? raw.match(/^(?:change (?:its|the) title to|call (?:this|it)|rename (?:this|it)(?: to)?)\s+(.+)$/i);
    if (rename?.[1]) return { type: "journal-rename", title: literalValue(rename[1]) };
    const replace = raw.match(/^(?:change|replace)\s+(?:the )?(last sentence|last paragraph|this paragraph|selected paragraph|paragraph)\s+(?:to|with)\s+([\s\S]+)$/i);
    if (replace) return { type: "journal-text-edit", unit: /sentence/i.test(replace[1]!) ? "sentence" : "paragraph", operation: "replace", ...(/^(?:this|selected)/i.test(replace[1]!) ? { target: "selection" as const } : {}), value: literalValue(replace[2]!) };
    const remove = text.match(/^(?:delete|remove) (?:the )?last (sentence|paragraph)$/);
    if (remove) return { type: "journal-text-edit", unit: remove[1] as "sentence" | "paragraph", operation: "remove" };
    const append = raw.match(/^add\s+(?:a )?paragraph\s+(?:saying|that says)\s+([\s\S]+)$/i);
    if (append) return { type: "journal-text-edit", unit: "paragraph", operation: "append", value: literalValue(append[1]!) };
    if (/^(?:start recording|begin recording|start with my voice|use my voice|record me|listen to me|i am going to talk|let me speak|start listening|record this|take this down)$/.test(text)) return context.activeJournalEntryId
      ? { type: "journal-recording", mode: "start" } : { type: "journal-create", beginRecording: true };
    if (/^(?:pause|hold on(?: for a second)?|pause for a second|stop listening for a moment|pause recording)$/.test(text)) return { type: "journal-recording", mode: "pause" };
    if (/^(?:resume|keep going|keep recording|continue recording|let's carry on recording|let us carry on recording|start listening again|resume recording)$/.test(text)) return { type: "journal-recording", mode: "resume" };
    if (/^(?:stop|finish|stop recording|finish recording|i am finished|i am done|that's all|that s all|end recording)$/.test(text)) return { type: "journal-recording", mode: "stop" };
    if (/^(?:(?:bookmark|mark) (?:that|this|here|this moment)|save that moment|keep that (?:bit|part)|keep the part i just said|mark what i just said|remember that line|save the last sentence|put a marker here)$/.test(text)) return { type: "journal-bookmark", anchor: journalBookmarkAnchor(text) };
  }
  return null;
}
