import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LifeContext } from "../../domain/life-model";
import { globalActionManifest, globalIntentRegistry, resolveGlobalCommand, type GlobalIntent, type IntentDomain } from "../../shared/command/globalInterpreter";
import { createLifeSnapshot } from "../../domain/life-storage";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { languageInventory, languageReleaseMinimums, type LanguageCase, type LanguageDialogue, type ResolutionExpectation } from "./languageDatabase";

const evidenceRoot = "artifacts/voice-intelligence";
const evaluationNow = Date.parse("2026-09-05T12:00:00Z");
const destructiveSafetyUtterances = [
  "remove the noisy thought", "delete this someday", "erase the memory of winter", "cancel the idea of leaving",
  "drop the subject for now", "remove doubt from the conversation", "delete that word from the sentence",
  "cancel culture is complicated", "erase the line between work and rest", "remove the red stain",
  "delete this concept from the essay", "cancel the noise in my headphones", "drop the old assumption",
  "remove the pressure to decide", "delete the metaphor about time", "erase yesterday from the story",
  "cancel my subscription someday", "remove clutter from the room", "delete unused code later",
  "drop everything and breathe", "remove the fear of starting", "delete this thought after I reflect",
  "cancel the trip in the novel", "erase the chalk from the board", "remove the duplicate paragraph",
  "delete the empty page", "drop the volume a little", "cancel the echo in this recording",
  "remove the background hiss", "delete my search history", "erase the sketch and begin again",
  "cancel that claim in the draft", "remove the last adjective", "delete the red fox from the picture",
  "drop the beat during the chorus", "remove the label from the jar", "erase the boundary in the diagram",
  "cancel the animation in the prototype", "delete the cached file", "remove the watermark from the scan",
  "drop the key one semitone", "erase the answer before checking", "cancel the print job downstairs",
  "delete the browser bookmark later", "remove the shadow from the photograph", "drop the quotation marks",
  "erase the pencil note", "cancel the rehearsal if it rains", "delete this sentence when editing",
  "remove the noisy thought from my journal entry",
] as const;

function resolutionFor(intent: GlobalIntent): ResolutionExpectation {
  return intent.type === "unsupported" ? "unsupported" : intent.type === "clarification" ? "clarify" : "execute";
}

interface Evaluation {
  row: LanguageCase;
  actualIntent: GlobalIntent["type"];
  actualResolution: ResolutionExpectation;
  expectedDomain: string;
  predictedDomain: IntentDomain;
  confidence?: string;
  score?: number;
  calendarActionTypes?: string[];
  passed: boolean;
}

function domainForIntent(intent?: GlobalIntent["type"]): string {
  if (!intent) return "unsupported";
  if (intent.startsWith("journal")) return "journal";
  if (intent.startsWith("atmosphere")) return "atmosphere";
  if (intent.startsWith("memory")) return "memory";
  if (intent.startsWith("commitment") || intent === "people-query") return "commitment";
  if (intent.startsWith("instinct")) return "insight";
  if (intent === "calendar" || intent === "calendar-inspect") return "calendar";
  if (intent === "navigate" || intent === "navigate-temporal" || intent === "global-sequence") return "navigation";
  if (intent === "temporal") return "temporal";
  if (["history", "session", "confirm", "cancel", "what-changed", "help"].includes(intent)) return "system";
  return "life";
}

function evaluate(row: LanguageCase): Evaluation {
  const result = resolveGlobalCommand(row.utterance, row.context, "2026-09-05");
  const actualResolution = resolutionFor(result.intent);
  const passed = actualResolution === row.expected.resolution
    && (!row.expected.intent || row.expected.intent === result.intent.type);
  return {
    row,
    actualIntent: result.intent.type,
    actualResolution,
    expectedDomain: row.expected.domain ?? domainForIntent(row.expected.intent),
    predictedDomain: result.selected?.domain ?? (result.intent.type === "unsupported" ? "unsupported" : domainForIntent(result.intent.type) as IntentDomain),
    confidence: result.selected?.confidence,
    score: result.selected?.score,
    calendarActionTypes: result.intent.type === "calendar" ? result.intent.request.actions.map(({ type }) => type) : undefined,
    passed,
  };
}

function evaluateDialogue(dialogue: LanguageDialogue): Evaluation[] {
  let context = dialogue.initialContext;
  return dialogue.turns.map((turn) => {
    const contextualTurn = { ...turn, context };
    const result = resolveGlobalCommand(turn.utterance, context, "2026-09-05");
    const evaluation = evaluate(contextualTurn);
    const intent = result.intent;
    if (intent.type === "navigate" && intent.route !== "back") {
      const route = intent.route;
      context = { ...context, route, topic: route === "journal" ? "journal" : route === "atmosphere" ? "atmosphere" : route === "memories" ? "memory" : route === "plans" ? "outcome" : route === "people" ? "commitment" : context.topic, peopleView: intent.target?.world === "people" ? intent.target.view ?? "default" : context.peopleView, pendingIntent: undefined };
    } else if (intent.type === "temporal" || intent.type === "navigate-temporal") {
      context = { ...context, route: "calendar", topic: "calendar", currentTimeScope: intent.scope, pendingIntent: undefined };
    } else if (intent.type === "journal-create") {
      context = { ...context, route: "journal", topic: "journal", activeJournalEntryId: `evaluated-journal-${dialogue.id}`, voiceMode: intent.beginRecording ? "journal-longform" : "command" };
    } else if (intent.type === "journal-recording") {
      context = { ...context, topic: "journal", voiceMode: intent.mode === "pause" || intent.mode === "stop" ? "command" : "journal-longform" };
    } else if (intent.type === "clarification" && intent.continuation) {
      context = { ...context, pendingIntent: { ...intent.continuation, expiresAt: evaluationNow + 120_000 } };
    } else if (intent.type === "commitment-create") {
      context = { ...context, pendingIntent: undefined, topic: "commitment" };
    } else if (intent.type === "atmosphere-play") {
      context = { ...context, route: "atmosphere", topic: "atmosphere" };
    } else if (intent.type === "outcome-create") {
      context = { ...context, route: "plans", topic: "outcome", activePlanId: `evaluated-plan-${dialogue.id}` };
    }
    return evaluation;
  });
}

/** Keep the large deterministic passes cooperative with Vitest's worker RPC.
 * Cases stay in their original order and logical partitions; the zero-delay
 * yield only lets the parent runner receive task updates between bounded CPU
 * batches instead of mistaking useful synchronous work for a dead worker. */
async function evaluateRows(rows: readonly LanguageCase[], batchSize = 250) {
  const evaluations: Evaluation[] = [];
  for (let start = 0; start < rows.length; start += batchSize) {
    evaluations.push(...rows.slice(start, start + batchSize).map(evaluate));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return evaluations;
}

async function evaluateDialogues(dialogues: readonly LanguageDialogue[], batchSize = 25) {
  const evaluations: Evaluation[] = [];
  for (let start = 0; start < dialogues.length; start += batchSize) {
    evaluations.push(...dialogues.slice(start, start + batchSize).flatMap(evaluateDialogue));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return evaluations;
}

function increment(record: Record<string, number>, key: string) {
  record[key] = (record[key] ?? 0) + 1;
}

function editorialFingerprint(row: LanguageCase) {
  const semantic = normalizeTranscript(row.utterance)
    .replace(/^(?:(?:please|actually|uh|um|erm|hey flow)\s+)+/, "")
    .replace(/^(?:can|could|would) you (?:please )?/, "")
    .replace(/^(?:open|show|go to|take me to|bring up|switch to|head to|navigate to|let me see|i want to see|return(?: to)?) (?:my |the )?/, "")
    .replace(/^(?:capture|remember(?: that| to)?|note(?: that)?|jot down|write down|save for later)\s+/, "")
    .replace(/\s+please$/, "");
  return semantic;
}

function editorialSemanticCore(row: LanguageCase) {
  return `${row.family}:${editorialFingerprint(row)}`
    .replace(/\s+(?:before|after|when|during|once)\s+.+$/, "")
    .replace(/\s+(?:by|until)\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/, "")
    .replace(/\b(?:twenty|twenty five|thirty|forty|forty five|half an|one)\s+(?:minute|minutes|hour)\b/g, "[duration]")
    .replace(/\s+at\s+(?:nine|eleven|two|four|six)(?:\s+(?:am|pm))?$/, "")
    .replace(/^(?:schedule|add|block)\s+(?:a\s+)?(?:\[duration\]\s+)?(?:for\s+)?/, "");
}

/** Sentence-edge shells catch the common padding technique where a fixed
 * command frame is cycled across slot values. Days and scalar values are
 * normalized before the three-word opening and five-word ending are compared. */
function editorialTemplateSkeleton(row: LanguageCase) {
  const words = normalizeTranscript(row.utterance)
    .replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow)\b/g, "[day]")
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|\d+)\b/g, "[value]")
    .split(" ");
  return `${row.expected.intent}:${words.slice(0, 3).join(" ")}:${words.slice(-5).join(" ")}`;
}

/** A stricter shape signature deliberately forgets the easy sources of fake
 * diversity: polite wrappers, synonyms, names, event titles, dates, clocks,
 * and scalar values. What remains is the grammatical shape a reviewer would
 * hear. This catches Cartesian slot rotation even when vocabulary changes. */
function editorialCanonicalSkeleton(row: LanguageCase) {
  const functionWords = new Set([
    "a", "an", "the", "my", "your", "our", "this", "that", "it", "me", "i", "we", "you", "they", "he", "she",
    "am", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did", "have", "has", "had", "will", "would", "should", "could", "can", "may", "might", "must",
    "to", "for", "from", "at", "on", "in", "into", "out", "of", "with", "without", "about", "around", "through", "over", "under", "before", "after", "between", "until", "by", "during", "when", "while", "once", "if", "than",
    "and", "or", "but", "so", "then", "because", "as", "where", "what", "which", "who", "how", "not", "again", "later", "earlier", "back", "over", "instead", "more", "less", "another", "next", "last", "first", "second", "all", "anything", "something", "somewhere", "here", "there", "now",
  ]);
  const actionWords = new Set([
    "add", "create", "schedule", "block", "book", "move", "shift", "push", "reschedule", "put", "change", "make", "shorten", "extend", "reduce", "stretch", "trim", "give", "protect", "lock", "fix", "keep", "unlock", "unprotect", "release", "remove", "fit", "defer", "capture", "remember", "note", "jot", "write", "save", "need", "want", "prepare", "promise", "promised", "told", "owe", "waiting", "open", "show", "return", "play", "pause", "resume", "stop", "rename", "call", "use", "hide", "restore", "focus", "start", "mark", "finish", "complete", "undo", "redo",
  ]);
  const hasPoliteFrame = /^(?:(?:please|actually|uh|um|erm|hey flow)\b|(?:can|could|would) you\b)/i.test(row.utterance.trim());
  const normalized = `${hasPoliteFrame ? "[polite] " : ""}${normalizeTranscript(row.utterance)}`
    .replace(/\b(?:half past|quarter (?:to|past))\s+[a-z-]+\b/g, "[time]")
    .replace(/\b(?:\d{1,2}(?::\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:am|pm|oclock)?\b/g, "[time]")
    .replace(/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|weekend)\b/g, "[time]")
    .replace(/\b(?:twenty|twenty-five|twenty five|thirty|forty|forty-five|forty five|fifty|half an|one)\s+(?:minute|minutes|hour|hours)\b/g, "[duration]");
  const shape = normalized.split(/\s+/).map((token) => {
    const plain = token.replace(/[^a-z[\]-]/g, "");
    if (!plain) return "";
    if (plain.startsWith("[")) return plain;
    if (actionWords.has(plain)) return "[verb]";
    if (functionWords.has(plain)) return plain;
    return "[slot]";
  }).filter(Boolean).join(" ")
    .replace(/(?:\[slot\]\s*){2,}/g, "[slot] ")
    .replace(/(?:\[verb\]\s*){2,}/g, "[verb] ")
    .trim();
  return `${row.family}:${shape}`;
}

function editorialRotationSignature(rows: readonly LanguageCase[]) {
  return rows.map(({ family, context }) => `${family}:${context.route}`).join("|");
}

const curatedGrammarRules = [
  { id: "one-takes-singular-unit", pattern: /\b(?:1|one) (?:seconds|minutes|hours|days|weeks)\b/i },
  { id: "many-takes-plural-unit", pattern: /\b(?:[2-9]|\d{2,}|two|three|four|five|six|seven|eight|nine|ten) (?:second|minute|hour|day|week)\b(?=\s+(?:earlier|later|from|after|before|long)|[,.!?]?$)/i },
  { id: "article-cannot-determine-plural-object", pattern: /\b(?:a|an) (?:[a-z-]+ ){0,3}(?:figures|documents|keys|notes|photographs|results|slides|drafts|requirements|details)\b/i },
  { id: "a-before-vowel-sound", pattern: /\ba (?:answer|agenda|email|event|invitation|outline|update)\b/i },
  { id: "an-before-consonant-sound", pattern: /\ban (?:reviewed|finished|clear|signed|revised|updated|edited|completed)\b/i },
  { id: "infinitive-cannot-own-that-clause", pattern: /\b(?:remember|need|want|plan|hope|try) to (?:that|those|when|where|before|after|during|once)\b/i },
  { id: "promise-object-determiner-number", pattern: /\b(?:promised|owe|told)\s+[a-z][\w'-]*\s+(?:a|an)\s+(?:[a-z-]+\s+){0,3}(?:figures|documents|keys|notes|photographs|results|slides|drafts|requirements|details)\b/i },
  { id: "adjective-object-semantic-incompatibility", pattern: /\b(?:(?:completed|reviewed|finished|latest|final version of)\s+(?:the\s+)?apartment keys|finish(?:ed)?(?: reviewing)?\s+(?:the\s+)?apartment keys)\b/i },
] as const;

function curatedGrammarViolations(rows: readonly LanguageCase[]) {
  return rows.flatMap((row) => curatedGrammarRules.flatMap(({ id, pattern }) => pattern.test(row.utterance)
    ? [{ id: row.id, utterance: row.utterance, rule: id }]
    : []));
}

function groupedAccuracy(evaluations: Evaluation[], keyFor: (evaluation: Evaluation) => string) {
  const groups: Record<string, { total: number; passed: number; accuracy: number }> = {};
  for (const evaluation of evaluations) {
    const key = keyFor(evaluation);
    const group = groups[key] ??= { total: 0, passed: 0, accuracy: 0 };
    group.total += 1;
    if (evaluation.passed) group.passed += 1;
  }
  for (const group of Object.values(groups)) group.accuracy = Number((group.passed / group.total).toFixed(6));
  return groups;
}

function writeReports(evaluations: Evaluation[]) {
  mkdirSync(evidenceRoot, { recursive: true });
  const cases = [...languageInventory.curated, ...languageInventory.generated, ...languageInventory.negatives];
  const bySource: Record<string, number> = {};
  const byIntent: Record<string, number> = {};
  const intentConfusion: Record<string, Record<string, number>> = {};
  const domainConfusion: Record<string, Record<string, number>> = {};
  for (const row of cases) {
    increment(bySource, row.source);
    increment(byIntent, row.expected.intent ?? row.expected.resolution);
  }
  for (const result of evaluations) {
    const expected = `${result.row.expected.resolution}:${result.row.expected.intent ?? "any"}`;
    const actual = `${result.actualResolution}:${result.actualIntent}`;
    const intentRow = intentConfusion[expected] ??= {};
    increment(intentRow, actual);
    const domainRow = domainConfusion[result.expectedDomain] ??= {};
    increment(domainRow, result.predictedDomain);
  }
  const failures = evaluations.filter(({ passed }) => !passed);
  const clusters = Object.values(failures.reduce<Record<string, { key: string; count: number; examples: string[] }>>((all, result) => {
    const key = `${result.row.expected.intent ?? result.row.expected.resolution}->${result.actualIntent}`;
    const cluster = all[key] ??= { key, count: 0, examples: [] };
    cluster.count += 1;
    if (cluster.examples.length < 8) cluster.examples.push(result.row.utterance);
    return all;
  }, {})).sort((left, right) => right.count - left.count);
  const passed = evaluations.length - failures.length;
  const required = evaluations.filter(({ row }) => row.requiredCore);
  const requiredPassed = required.filter(({ passed: didPass }) => didPass).length;
  const calendarPlan = createLifeSnapshot("2026-09-05").document.calendar;
  const destructiveSafety = destructiveSafetyUtterances.flatMap((utterance) => ["home", "calendar", "journal", "people", "plans"].map((route) => {
    const result = resolveGlobalCommand(utterance, { route: route as LifeContext["route"], nowMs: evaluationNow, activeMode: "command" }, "2026-09-05", [], 17 * 60, calendarPlan);
    const destructive = result.intent.type === "capture-delete"
      || result.intent.type === "commitment-delete"
      || result.intent.type === "plan-delete"
      || result.intent.type === "step-delete"
      || (result.intent.type === "calendar" && result.intent.request.actions.some(({ type }) => type === "delete"));
    return { utterance, route, intent: result.intent.type, destructive };
  }));
  const accuracy = {
    generatedAt: new Date().toISOString(),
    evaluator: "production resolveGlobalCommand registry",
    totalEvaluated: evaluations.length,
    passed,
    failed: failures.length,
    accuracy: Number((passed / evaluations.length).toFixed(6)),
    requiredCore: { total: required.length, passed: requiredPassed, accuracy: required.length ? Number((requiredPassed / required.length).toFixed(6)) : 1 },
    destructiveFalsePositives: destructiveSafety.filter(({ destructive }) => destructive).length,
    destructiveSafetyProbes: { total: destructiveSafety.length, passed: destructiveSafety.filter(({ destructive }) => !destructive).length, failures: destructiveSafety.filter(({ destructive }) => destructive) },
    byDomain: groupedAccuracy(evaluations, ({ expectedDomain }) => expectedDomain),
    byAction: groupedAccuracy(evaluations, ({ row }) => row.expected.intent ?? row.expected.resolution),
    byRoute: groupedAccuracy(evaluations, ({ row }) => row.context.route),
    bySource: groupedAccuracy(evaluations, ({ row }) => row.source),
    provenance: {
      curated: `${languageInventory.curated.filter(({ source }) => source === "editorial_product").length} static product-editorial-review rows; local drafting assistance, review policy, family samples, and admission limits are disclosed in CURATED_EDITORIAL_REVIEW.md; generated transformations are excluded and none are claimed as observed user speech or physical-microphone evidence`,
      generated: "deterministic navigation and explicit-capture grammars with semantic task/context vocabulary; no numbered utterance padding and not claimed as authored language",
      dialogues: "five product-journey families expanded into 1,000 distinct four-turn conversations whose context is advanced from prior production results, not injected per turn",
      adversarial: "10 directly reviewed cross-domain collisions, six exact release-regression utterances, and distinct grammar-generated unsupported language; no numbered utterance copies",
      physicalMicrophone: "not represented in this database",
    },
  };
  const reports = {
    "coverage-report.json": {
      generatedAt: accuracy.generatedAt,
      totalCases: cases.length,
      dialogueCount: languageInventory.dialogues.length,
      contextualTurnCount: languageInventory.dialogues.reduce((sum, dialogue) => sum + dialogue.turns.length, 0),
      bySource,
      byExpectedIntent: byIntent,
      requiredCoreCount: cases.filter(({ requiredCore }) => requiredCore).length,
      registry: {
        intentDefinitionCount: globalIntentRegistry.length,
        actionManifestCount: globalActionManifest.length,
      },
      curatedEditorialAudit: (() => {
        const semanticCoreCounts = Object.values(languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
          const key = editorialSemanticCore(row);
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}));
        const edgeSkeletonCounts = Object.values(languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
          const key = editorialTemplateSkeleton(row);
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}));
        const canonicalSkeletonCounts = Object.values(languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
          const key = editorialCanonicalSkeleton(row);
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}));
        const windows = Array.from({ length: languageInventory.curated.length - 39 }, (_, index) => languageInventory.curated.slice(index, index + 40));
        return {
          origin: "product-editorial-review",
          normalizedUnique: new Set(languageInventory.curated.map(({ utterance }) => normalizeTranscript(utterance))).size,
          editorialFingerprintUnique: new Set(languageInventory.curated.map(editorialFingerprint)).size,
          familyCount: new Set(languageInventory.curated.map(({ family }) => family)).size,
          languageFeatureCount: new Set(languageInventory.curated.map(({ editorial }) => editorial?.languageFeature)).size,
          maxSemanticCoreFrequency: Math.max(...semanticCoreCounts),
          maxSentenceEdgeSkeletonFrequency: Math.max(...edgeSkeletonCounts),
          maxCanonicalSkeletonFrequency: Math.max(...canonicalSkeletonCounts),
          minFamiliesPerFortyRows: Math.min(...windows.map((rows) => new Set(rows.map(({ family }) => family)).size)),
          minIntentsPerFortyRows: Math.min(...windows.map((rows) => new Set(rows.map(({ expected }) => expected.intent)).size)),
          minRoutesPerFortyRows: Math.min(...windows.map((rows) => new Set(rows.map(({ context }) => context.route)).size)),
          grammarQualityRuleCount: curatedGrammarRules.length,
          grammarQualityViolations: curatedGrammarViolations(languageInventory.curated),
          reviewArtifact: "src/features/voice-intelligence/CURATED_EDITORIAL_REVIEW.md",
        };
      })(),
    },
    "confusion-matrix.json": {
      generatedAt: accuracy.generatedAt,
      domainMatrix: domainConfusion,
      intentMatrix: intentConfusion,
      failures: failures.map(({ row, expectedDomain, predictedDomain, actualIntent, actualResolution, confidence, score }) => ({
        id: row.id, utterance: row.utterance, route: row.context.route, expectedDomain, predictedDomain,
        expectedIntent: row.expected.intent, actualIntent, expectedResolution: row.expected.resolution, actualResolution, confidence, score,
      })),
    },
    "failure-clusters.json": { generatedAt: accuracy.generatedAt, clusterCount: clusters.length, clusters, note: "Clusters contain deterministic utterance examples only; no synthetic item is represented as real-user evidence." },
    "resolver-accuracy-report.json": accuracy,
  };
  for (const [name, report] of Object.entries(reports)) writeFileSync(`${evidenceRoot}/${name}`, `${JSON.stringify(report, null, 2)}\n`);
}

describe("production voice-intelligence language database", () => {
  const collected: Evaluation[] = [];

  it.each(Object.entries(languageReleaseMinimums))("meets the September 8 admitted %s release minimum of %s", (bucket, minimum) => {
    expect(languageInventory[bucket as keyof typeof languageInventory].length, `${bucket}: drafts and unexecuted proposals do not count`).toBeGreaterThanOrEqual(minimum);
  });

  it("keeps the requested corpus sizes and provenance categories explicit", () => {
    // The new release minima above supersede old fixed sizes. Linguistic
    // admission rules below remain unchanged as the inventories grow.
    expect(languageInventory.dialogues.flatMap(({ turns }) => turns).length).toBeGreaterThanOrEqual(4_200);
    expect(new Set(languageInventory.generated.map(({ utterance }) => utterance)).size).toBe(languageInventory.generated.length);
    expect(new Set(languageInventory.negatives.map(({ utterance }) => utterance)).size).toBe(languageInventory.negatives.length);
    expect(new Set(languageInventory.dialogues.map(({ turns }) => turns.map(({ utterance }) => utterance).join(" → "))).size).toBe(languageInventory.dialogues.length);
    expect(languageInventory.curated.every(({ source }) => source === "editorial_product")).toBe(true);
    expect(languageInventory.curated.every(({ editorial, context, expected, contractMigration }) => editorial?.origin === "product-editorial-review"
      && editorial.reviewScope === `${context.route}:${contractMigration?.previousIntent ?? expected.intent}`)).toBe(true);
    const normalizedRows = languageInventory.curated.reduce<Record<string, string[]>>((rows, { id, utterance }) => {
      const normalized = normalizeTranscript(utterance);
      rows[normalized] = [...(rows[normalized] ?? []), `${id}: ${utterance}`];
      return rows;
    }, {});
    const normalizedDuplicates = Object.entries(normalizedRows).filter(([, rows]) => rows.length > 1);
    if (normalizedDuplicates.length) throw new Error(`Duplicate normalized editorial utterances: ${JSON.stringify(normalizedDuplicates)}`);
    expect(Object.keys(normalizedRows)).toHaveLength(languageInventory.curated.length);
    expect(new Set(languageInventory.curated.map(editorialFingerprint)).size).toBe(languageInventory.curated.length);
    expect(languageInventory.curated.some(({ utterance }) => /\b(?:case|fragment|example|language reliability note)\s*#?\d+\b/i.test(utterance))).toBe(false);
    const grammarViolations = curatedGrammarViolations(languageInventory.curated);
    if (grammarViolations.length) throw new Error(`Editorial grammar violations: ${JSON.stringify(grammarViolations.slice(0, 40))}`);
    expect(grammarViolations).toEqual([]);
    expect(new Set(languageInventory.curated.map(({ family }) => family)).size).toBeGreaterThanOrEqual(20);
    expect(new Set(languageInventory.curated.map(({ expected }) => expected.intent)).size).toBeGreaterThanOrEqual(40);
    expect(new Set(languageInventory.curated.map(({ editorial }) => editorial?.languageFeature)).size).toBeGreaterThanOrEqual(50);
    const featureCounts = Object.values(languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
      const key = row.editorial!.languageFeature;
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}));
    expect(Math.max(...featureCounts)).toBeLessThanOrEqual(150);
    const semanticCoreCounts = Object.values(languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
      const key = editorialSemanticCore(row);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}));
    expect(Math.max(...semanticCoreCounts)).toBeLessThanOrEqual(10);
    const templateSkeletonInventory = languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
      const key = editorialTemplateSkeleton(row);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const skeletonCounts = Object.values(templateSkeletonInventory);
    const dominantTemplateSkeletons = Object.entries(templateSkeletonInventory).sort((left, right) => right[1] - left[1]).slice(0, 8);
    if (Math.max(...skeletonCounts) > 10) throw new Error(`Dominant sentence-edge editorial skeletons: ${JSON.stringify(dominantTemplateSkeletons)}`);
    expect(Math.max(...skeletonCounts)).toBeLessThanOrEqual(10);
    const canonicalSkeletonInventory = languageInventory.curated.reduce<Record<string, number>>((counts, row) => {
      const key = editorialCanonicalSkeleton(row);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    const canonicalSkeletonCounts = Object.values(canonicalSkeletonInventory);
    const dominantSkeletons = Object.entries(canonicalSkeletonInventory).sort((left, right) => right[1] - left[1]).slice(0, 8);
    if (Math.max(...canonicalSkeletonCounts) > 20) throw new Error(`Dominant canonical editorial skeletons: ${JSON.stringify(dominantSkeletons)}`);
    expect(Math.max(...canonicalSkeletonCounts)).toBeLessThanOrEqual(20);
    expect(languageInventory.curated.slice(1).every((row, index) => row.family !== languageInventory.curated[index]!.family)).toBe(true);
    const fortyRowWindows = Array.from({ length: languageInventory.curated.length - 39 }, (_, index) => languageInventory.curated.slice(index, index + 40));
    expect(Math.min(...fortyRowWindows.map((rows) => new Set(rows.map(({ family }) => family)).size))).toBeGreaterThanOrEqual(9);
    expect(Math.min(...fortyRowWindows.map((rows) => new Set(rows.map(({ expected }) => expected.intent)).size))).toBeGreaterThanOrEqual(5);
    expect(Math.min(...fortyRowWindows.map((rows) => new Set(rows.map(({ context }) => context.route)).size))).toBeGreaterThanOrEqual(4);
    const rotationSignatures = Array.from({ length: languageInventory.curated.length - 7 }, (_, index) => editorialRotationSignature(languageInventory.curated.slice(index, index + 8)));
    expect(new Set(rotationSignatures).size).toBe(rotationSignatures.length);
    expect(new Set(languageInventory.curated.map(({ context }) => context.route)).size).toBeGreaterThanOrEqual(8);
    expect(languageInventory.curated.filter(({ context }) => context.voiceMode === "journal-longform").length).toBeGreaterThanOrEqual(250);
    expect(languageInventory.generated.some(({ utterance }) => /language reliability note \d+/.test(utterance))).toBe(false);
    expect(languageInventory.negatives.some(({ utterance }) => /unrelated conversational fragment \d+/.test(utterance))).toBe(false);
  });

  it("executes all 2,500 direct curated rows through the production registry", async () => {
    const evaluations = await evaluateRows(languageInventory.curated);
    collected.push(...evaluations);
    expect(evaluations.filter(({ passed }) => !passed).map(({ row, actualIntent }) => `${row.utterance} -> ${actualIntent}`)).toEqual([]);
  }, 120_000);

  it.each([0, 1] as const)("executes generated grammar partition %s through the production registry", async (partition) => {
    const halfway = Math.ceil(languageInventory.generated.length / 2);
    const start = partition * halfway;
    collected.push(...await evaluateRows(languageInventory.generated.slice(start, start + halfway)));
  }, 120_000);

  it("executes all 2,000 negative and confusion rows through the production registry", async () => {
    const evaluations = await evaluateRows(languageInventory.negatives);
    collected.push(...evaluations);
    const destructiveFalsePositives = evaluations.filter(({ row, actualIntent, calendarActionTypes }) => row.expected.resolution === "unsupported"
      && (["capture-delete", "commitment-delete", "plan-delete", "step-delete"].includes(actualIntent) || calendarActionTypes?.includes("delete")));
    const calendarPlan = createLifeSnapshot("2026-09-05").document.calendar;
    const directDestructiveFailures = destructiveSafetyUtterances.flatMap((utterance) => ["home", "calendar", "journal", "people", "plans"].flatMap((route) => {
      const intent = resolveGlobalCommand(utterance, { route: route as LifeContext["route"], nowMs: evaluationNow, activeMode: "command" }, "2026-09-05", [], 17 * 60, calendarPlan).intent;
      const destructive = intent.type === "capture-delete" || intent.type === "commitment-delete" || intent.type === "plan-delete" || intent.type === "step-delete"
        || (intent.type === "calendar" && intent.request.actions.some(({ type }) => type === "delete"));
      return destructive ? [`${route}: ${utterance}`] : [];
    }));
    expect(destructiveFalsePositives.map(({ row, actualIntent }) => `${row.utterance} -> ${actualIntent}`)).toEqual([]);
    expect(directDestructiveFailures).toEqual([]);
  }, 120_000);

  it("executes 1,000 distinct dialogues while advancing production context turn by turn", async () => {
    const evaluations = await evaluateDialogues(languageInventory.dialogues);
    collected.push(...evaluations);
    expect(evaluations.filter(({ passed }) => !passed).map(({ row, actualIntent }) => `${row.utterance} -> ${actualIntent}`)).toEqual([]);
  }, 120_000);

  it("writes complete coverage, confusion, failure, and accuracy reports", () => {
    writeReports(collected);
    const failures = collected.filter(({ passed }) => !passed);
    expect((collected.length - failures.length) / collected.length).toBeGreaterThanOrEqual(0.995);
    collected.length = 0;
  });
});
