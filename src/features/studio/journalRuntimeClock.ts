let active: { entryId: string; positionMs: number } | undefined;
let acoustic: { entryId: string; startMs: number; samples: Array<{ text: string; at: number }> } | undefined;
let final: { entryId: string; text: string; ranges: Array<{ text: string; startMs: number; endMs: number; alignment: "segment-estimate" }> } | undefined;

export function setJournalRuntimePosition(entryId: string | undefined, positionMs: number) {
  if (active?.entryId !== entryId) { acoustic = undefined; final = undefined; }
  active = entryId ? { entryId, positionMs: Math.max(0, positionMs) } : undefined;
}

/** Pause-aware recorder time, sampled from native speech onset and interim
 * observations. These are segment estimates, never invented word timings. */
export function beginRecordingUtterance() {
  if (active && !acoustic) acoustic = { entryId: active.entryId, startMs: active.positionMs, samples: [] };
}
export function discardRecordingUtterance() { acoustic = undefined; final = undefined; }
export function sampleRecordingUtterance(text: string) {
  if (!active || !text.trim()) return;
  beginRecordingUtterance();
  acoustic?.samples.push({ text: text.trim(), at: active.positionMs });
}
export function finishRecordingUtterance(text: string) {
  if (!active) return;
  const onset = acoustic?.entryId === active.entryId ? acoustic : undefined;
  const sentenceParts = text.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  // When Chrome omits punctuation, retain measured stable-prefix boundaries
  // before a new clause. We never distribute words evenly across a recording.
  const cuts = sentenceParts.length === 1 ? (onset?.samples ?? []).flatMap((sample) => {
    const prefix = sample.text.replace(/[.!?]+$/, "").trim();
    if (!text.toLowerCase().startsWith(prefix.toLowerCase())) return [];
    const rest = text.slice(prefix.length).trimStart();
    return /^(?:bring|send|pick up|are you|can you|could you|we should|we decided|i recommend|i['’]ll|i will)\b/i.test(rest) ? [prefix.length] : [];
  }) : [];
  const boundaries = [...new Set([0, ...cuts, text.length])].sort((a, b) => a - b);
  const sentences = cuts.length ? boundaries.slice(1).map((end, index) => text.slice(boundaries[index], end).trim()).filter(Boolean) : sentenceParts;
  let startMs = onset?.startMs ?? active.positionMs;
  const ranges = sentences.map((sentence) => {
    const observed = onset?.samples.find((sample) => sample.text.toLowerCase().includes(sentence.replace(/[.!?]+$/, "").toLowerCase()));
    const endMs = Math.max(startMs, Math.min(active!.positionMs, observed?.at ?? active!.positionMs));
    const range = { text: sentence, startMs, endMs, alignment: "segment-estimate" as const };
    startMs = endMs;
    return range;
  });
  final = { entryId: active.entryId, text: text.trim(), ranges };
  acoustic = undefined;
}
export function recordingTranscriptRanges(entryId: string, text: string, positionMs: number, source: "voice" | "typed" = "typed") {
  if (source === "voice" && final?.entryId === entryId && final.text === text.trim()) return final.ranges;
  return [{ text: text.trim(), startMs: positionMs, endMs: positionMs, alignment: "untimed" as const }];
}

export function journalRuntimePosition(entryId: string) {
  return active?.entryId === entryId ? active.positionMs : undefined;
}
