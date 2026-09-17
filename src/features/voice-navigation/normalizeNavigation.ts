import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { genericSurfaceNouns, navigationFrames } from "./navigationLexicon";
import { navigationRoleFrame } from "./navigationRoleFrame";

const politePrefixes = ["please", "actually", "uh", "um", "hey flow"];
const politeSuffixes = ["please", "for me", "right now", "now", "thanks", "thank you"];

function stripEdgePhrases(value: string, phrases: readonly string[], edge: "start" | "end") {
  let result = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const phrase = [...phrases].sort((a, b) => b.length - a.length).find((candidate) => edge === "start"
      ? result === candidate || result.startsWith(`${candidate} `)
      : result === candidate || result.endsWith(` ${candidate}`));
    if (!phrase) break;
    result = edge === "start" ? result.slice(phrase.length).trim() : result.slice(0, -phrase.length).trim();
  }
  return result;
}

export interface NormalizedNavigation {
  sourceText: string;
  normalizedText: string;
  framed: boolean;
  destinationText: string;
}

export function normalizeNavigation(sourceText: string): NormalizedNavigation {
  let normalizedText = normalizeTranscript(sourceText).replace(/\blet's\b/g, "let s");
  normalizedText = stripEdgePhrases(normalizedText, politePrefixes, "start");
  normalizedText = stripEdgePhrases(normalizedText, politeSuffixes, "end");
  normalizedText = navigationRoleFrame(normalizedText) ?? normalizedText;
  const frame = [...navigationFrames].sort((a, b) => b.length - a.length)
    .find((candidate) => normalizedText === candidate || normalizedText.startsWith(`${candidate} `));
  let destinationText = frame ? normalizedText.slice(frame.length).trim() : normalizedText;
  if (frame) {
    // Speech recognition and generated phrase variation can occasionally
    // stack harmless determiners ("open the my journal"). Treat them as
    // navigation framing rather than allowing the phrase to fall into an
    // unrelated domain.
    destinationText = destinationText.replace(/^(?:(?:the|my|our)\s+)+/, "");
    const surfacePattern = new RegExp(`\\s+(?:${genericSurfaceNouns.join("|")})$`);
    destinationText = destinationText.replace(surfacePattern, "").trim();
  }
  return { sourceText, normalizedText, framed: Boolean(frame), destinationText };
}

export function isMutationShapedNavigationCollision(text: string) {
  return /^(?:add|schedule|block|book|move|shift|push|reschedule|make|rename|label|protect|unprotect|delete|remove|cancel|defer|extend|shorten|split|merge|combine|complete|finish|capture|remember|note|start a|start focus|stop focus)\b/.test(text)
    || /\b(?:at|by|before|after|for)\s+(?:\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text);
}
