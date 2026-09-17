import type { GlobalIntentResolution } from "./globalInterpreter";

export interface JournalSegmentEvidence {
  classification: "CONTENT" | "CONTROL" | "AMBIGUOUS";
  reason: string;
  destination: "journal-prose" | "global-command" | "clarification";
}

/** Eligibility only. The global registry still parses and resolves every
 * control. Narrative speech never inherits command authority from a verb. */
export function journalSegmentDecision(normalized: string, resolution: GlobalIntentResolution): JournalSegmentEvidence {
  const intent = resolution.intent;
  const requestFrame = /^i (?:want|need|would like|d like) to\s+(?:go|open|show|scroll|page|pause|resume|stop|start|delete|rename|replace|bookmark)\b/.test(normalized)
    || /^i'd like to\s+(?:go|open|show|scroll|page|pause|resume|stop|start|delete|rename|replace|bookmark)\b/.test(normalized);
  const narrative = /^(?:i |we |she |he |they |if |do not |don't |my |our |the |today |yesterday )/.test(normalized)
    && !requestFrame && !/^(?:i am (?:done|finished)|i m (?:done|finished)|i want to (?:journal|write))$/.test(normalized);
  const quoted = /[“”"]/.test(normalized);
  const metaphorical = /\b(?:from|in|inside) (?:my|our|the) (?:mind|thoughts?|imagination|dreams?)\b/.test(normalized)
    && !/\b(?:journal|entry|sentence|paragraph|meeting|event)\b/.test(normalized)
    || /^call it .+[,;]\s*(?:but|and)\s+(?:i|we|she|he|they)\s+/.test(normalized);
  // Quotes are expected inside an explicitly requested title or replacement;
  // only the outer command receives authority, never the quoted value.
  const explicitValueEdit = ["journal-rename", "journal-text-edit", "journal-tags", "memory-edit"].includes(intent.type);
  if (!narrative && !metaphorical && (!quoted || explicitValueEdit)) {
    const navigation = intent.type === "navigate" || intent.type === "navigate-temporal" || intent.type === "global-sequence" || intent.type === "scroll";
    const registeredStudioControl = intent.type !== "journal-append" && intent.type !== "clarification" && intent.type !== "unsupported"
      && ["journal", "atmosphere", "memory", "workspace"].includes(resolution.selected?.domain ?? "");
    const explicitControl = registeredStudioControl || intent.type === "recording-marker" || intent.type === "friend-marker-answer" || intent.type === "friend-voice" && intent.operation !== "append" || ["history", "what-changed", "session", "confirm", "cancel", "pending-choice"].includes(intent.type)
      || intent.type === "calendar" && /\b(?:meeting|event|appointment|calendar)\b/.test(normalized);
    const studioControlCompound = intent.type === "studio-compound" && intent.steps.every((step) => ["navigate", "journal-bookmark", "journal-recording", "journal-save"].includes(step.type));
    if (navigation || explicitControl || studioControlCompound) return { classification: "CONTROL", reason: "complete registered navigation or explicit session/journal control", destination: "global-command" };
    if (intent.type === "clarification" && resolution.candidates.some(({ domain, score }) => domain === "navigation" && score >= 52)) return { classification: "AMBIGUOUS", reason: "registered control has multiple destinations", destination: "clarification" };
    if (/^(?:delete|remove|rename|replace|edit|change|move|pause|resume|stop)\s+(?:this|that|it|the|my|current|last|recording|journal|entry)\b/.test(normalized)) return { classification: "AMBIGUOUS", reason: "command-shaped request lacks a complete compatible capability", destination: "clarification" };
  }
  return { classification: "CONTENT", reason: narrative || quoted ? "narrative or quoted speech has no command authority" : "no complete registered interruption", destination: "journal-prose" };
}
