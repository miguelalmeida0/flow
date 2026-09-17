export type FinalSegmentClass = "CONTENT" | "CONTROL" | "AMBIGUOUS";
export type FinalSegmentPartition = { status: "ready"; utterances: string[] } | { status: "clarification"; utterances: []; detail: string };

function openQuote(source: string) {
  let quote = false;
  for (const character of source) {
    if (character === '"') quote = !quote;
    if (character === "“") quote = true;
    if (character === "”") quote = false;
  }
  return quote;
}

/** Native-final boundaries are evidence, not execution triggers. Only after
 * the endpoint do we separate complete registered controls from prior prose.
 * A complete literal/edit request owns every segment of its value. */
export function partitionJournalFinals(segments: readonly string[], classify: (source: string) => FinalSegmentClass): FinalSegmentPartition {
  const joined = segments.join(" ");
  const whole = classify(joined);
  if (segments.length < 2 || whole === "CONTROL") return { status: "ready", utterances: [joined] };
  const utterances: string[] = [];
  let current = segments[0] ?? "";
  for (const next of segments.slice(1)) {
    if (openQuote(current)) { current += ` ${next}`; continue; }
    const nextClass = classify(next);
    const currentClass = classify(current);
    if (currentClass === "CONTROL" && nextClass !== "CONTROL") return { status: "clarification", utterances: [], detail: "I heard a control followed by an unfinished continuation. Please repeat the complete request. Nothing changed." };
    if (nextClass === "CONTROL") {
      const reportedIntro = /\b(?:said|wrote|named|called|words|phrase|told (?:me|us|her|him|them) to)\s*$/i.test(current);
      if (reportedIntro) { current += ` ${next}`; continue; }
      if (currentClass === "CONTENT" && !/[.!?][”"]?$/.test(current)) return { status: "clarification", utterances: [], detail: "Was that a journal passage or a separate control? Please repeat the complete request. Nothing changed." };
      utterances.push(current); current = next;
    }
    else current += ` ${next}`;
  }
  utterances.push(current);
  if (utterances.some((text) => classify(text) === "AMBIGUOUS")) return { status: "clarification", utterances: [], detail: "I couldn't safely separate that request from the journal passage. Please repeat the control. Nothing changed." };
  return { status: "ready", utterances };
}
