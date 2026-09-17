import type { LifeContext, LifeRoute } from "../../domain/life-model";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import { generatePositiveNavigationCorpus } from "../voice-navigation/generatedNavigationCorpus";
import curatedLanguageSeeds from "./curatedLanguageSeeds.json";
import type { AcceptanceFixtureId } from "./acceptanceFixtures";
import type { SemanticExpectation } from "./semanticExpectation";
import { reviewedLanguageAdmission } from "./reviewedLanguageAdmission";
import { proposedVoiceRebuildCases } from "./voiceRebuildEditorial";
import { applyLegacySemanticOverlay } from "./legacySemanticOverlay";
import type { CalendarEvent } from "../day-planner/model";
import type { AtmospherePreset } from "../../domain/studio-model";

export type LanguageSource = "editorial_product" | "manual_adversarial" | "ui_copy" | "regression" | "grammar_generated" | "speech_variant" | "contextual_dialogue";
export type ResolutionExpectation = "execute" | "clarify" | "unsupported";

export interface LanguageCase {
  id: string;
  utterance: string;
  context: LifeContext;
  expected: { domain?: string; intent?: GlobalIntent["type"]; resolution: ResolutionExpectation; route?: LifeRoute };
  source: LanguageSource;
  family?: string;
  requiredCore?: boolean;
  confusionPair?: string;
  fixtureId?: AcceptanceFixtureId;
  fixtureSpec?: { calendarTarget?: CalendarEvent; playingPreset?: AtmospherePreset; collections?: SemanticExpectation["collections"] };
  provenance?: { authoringMethod: "assisted-editorial" | "repository-test-extraction" | "independent-legacy-review" | "grammar-generated" | "asr-transformation"; baseCaseId: string; transformations: string[]; reviewStatus: "pending" | "admitted"; contractVersion: "2026-09-08"; reviewNote?: string; sourceLocation?: { file: string; line: number; sha256: string } };
  semantic?: SemanticExpectation;
  contractMigration?: { previousIntent: GlobalIntent["type"]; reason: string; version: "2026-09-08" };
  editorial?: {
    origin: "product-editorial-review";
    languageFeature: string;
    reviewScope: string;
  };
}

export interface LanguageDialogue {
  id: string;
  fixtureId?: "calendar-next-day";
  initialContext: LifeContext;
  turns: LanguageCase[];
}

const fixedNow = Date.parse("2026-09-05T12:00:00Z");
const baseContext = (route: LifeRoute = "home", patch: Partial<LifeContext> = {}): LifeContext => ({ route, nowMs: fixedNow, activeMode: "command", ...patch });

export function buildCuratedLanguageCases(): LanguageCase[] {
  const legacy = curatedLanguageSeeds.map((seed): LanguageCase => applyLegacySemanticOverlay({
    id: seed.id,
    utterance: seed.utterance,
    context: baseContext(seed.route as LifeRoute, {
      ...(seed.topic ? { topic: seed.topic as NonNullable<LifeContext["topic"]> } : {}),
      ...(seed.peopleView ? { peopleView: seed.peopleView as NonNullable<LifeContext["peopleView"]> } : {}),
      ...(seed.voiceMode ? { voiceMode: seed.voiceMode as NonNullable<LifeContext["voiceMode"]> } : {}),
      ...(seed.activeJournalEntryId ? { activeJournalEntryId: seed.activeJournalEntryId } : {}),
      ...(seed.activeMemoryId ? { activeMemoryId: seed.activeMemoryId } : {}),
      ...(seed.selectedInsightId ? { selectedInsightId: seed.selectedInsightId } : {}),
    }),
    // Preserve every old goal utterance as a safety regression. The September
    // 8 contract withdraws implicit creation authority, not test coverage.
    expected: seed.intent === "outcome-create"
      ? { intent: "unsupported", resolution: "unsupported" }
      : seed.utterance === "never mind" ? { intent: "history", resolution: "execute" }
      : seed.id === "curated-1532" ? { intent: "unsupported", resolution: "unsupported" }
      : { intent: seed.intent as GlobalIntent["type"], resolution: "execute" },
    ...(seed.intent === "outcome-create" || seed.utterance === "never mind" || seed.id === "curated-1532" ? { contractMigration: {
      previousIntent: seed.intent as GlobalIntent["type"], version: "2026-09-08" as const,
      reason: seed.intent === "outcome-create" ? "Explicit creation authority required; original goal preserved as a negative."
        : seed.utterance === "never mind" ? "Cancel pending action, otherwise undo, per new conversational contract."
          : "The old top-level Calendar assertion hid a zero-length six-to-six range. Invalid range must not create data.",
    } } : {}),
    source: "editorial_product",
    family: seed.family,
    requiredCore: true,
    editorial: seed.editorial as LanguageCase["editorial"],
  }));
  return [...legacy, ...reviewedLanguageAdmission(proposedVoiceRebuildCases)];
}

const generatedCaptureObjects = [
  "renew the passport", "book the dentist", "call the embassy", "replace the bicycle light", "buy oat milk", "send the reimbursement form", "check the train timetable", "order printer paper", "return the library books", "water the balcony herbs",
  "ask Maya about the proposal", "confirm Daniel's delivery", "find the blue notebook", "schedule the annual checkup", "pick up the repaired shoes", "compare the insurance renewal", "download the tax statement", "charge the camera battery", "measure the guest room", "reserve a table for dinner",
  "write the thank-you note", "cancel the unused subscription", "scan the signed contract", "collect the dry cleaning", "replace the smoke alarm battery", "look up the museum hours", "pack the travel adapter", "request the school transcript", "update the emergency contact", "choose a birthday present",
  "clean the coffee grinder", "send the meeting notes", "check the passport photos", "call the apartment manager", "bring the umbrella", "print the boarding passes", "refill the prescription", "review the electricity bill", "repair the loose button", "donate the winter coats",
] as const;
const generatedCaptureContexts = [
  "before breakfast", "after the morning walk", "before the next trip", "when the office opens", "after lunch", "before Friday", "this weekend", "when I get home", "before the rain starts", "after the client call",
  "before the school run", "during the quiet hour", "after the package arrives", "before the renewal date", "when the shop reopens", "after the train ride", "before the family visit", "during tomorrow's break", "after the appointment", "before the month ends",
  "when Maya replies", "after Daniel confirms", "before the evening class", "during the next free slot", "after the weekly review", "before the holiday", "when I reach the office", "after the gym", "before the library closes", "during the afternoon",
  "after the design review", "before the early train", "when the documents arrive", "after the weather clears", "before dinner", "during the lunch break", "after the school meeting", "before the warranty expires", "when the bank opens", "after the morning meeting",
  "before the weekend", "during the commute", "after the delivery", "before the guests arrive", "when I have the receipt", "after the doctor's call", "before the next invoice", "during the planning block", "after the repair", "before the concert",
  "when the confirmation lands", "after the workshop", "before the registration closes", "during the open hour", "after the application is reviewed", "before the flight", "when the parcel is ready", "after the team check-in", "before the deadline", "during tomorrow morning",
] as const;

export function buildGeneratedLanguageCases(): LanguageCase[] {
  const navigation = generatePositiveNavigationCorpus().map((row, index): LanguageCase => ({
    id: `generated-navigation-${index + 1}`,
    utterance: row.utterance,
    context: baseContext(),
    expected: {
      intent: "navigate",
      resolution: "execute",
      route: row.target.world === "today" ? "calendar" : row.target.world === "capture" ? "inbox" : row.target.world === "outcomes" ? "plans" : row.target.world,
    },
    source: "grammar_generated",
  }));
  const needed = 25_000 - navigation.length;
  const captures = ["Capture", "Remember to", "Note to", "Jot down", "Write down"].flatMap((prefix) => generatedCaptureObjects.flatMap((object) => generatedCaptureContexts.map((tail) => ({ prefix, object, tail })))).slice(0, needed).map(({ prefix, object, tail }, index): LanguageCase => ({
    id: `generated-capture-${index + 1}`,
    utterance: `${prefix} ${object} ${tail}`,
    context: baseContext(["home", "calendar", "capture", "outcomes", "people"][index % 5] as LifeRoute),
    expected: { intent: "capture-create", resolution: "execute" },
    source: "grammar_generated",
  }));
  return [...navigation, ...captures];
}

const confusionCases: LanguageCase[] = [
  { id: "confusion-journal-voice", utterance: "start with my voice", context: baseContext("journal", { topic: "journal" }), expected: { intent: "journal-create", resolution: "execute" }, source: "manual_adversarial", confusionPair: "journal-v-calendar" },
  { id: "confusion-journal-entry", utterance: "new entry", context: baseContext("journal", { topic: "journal" }), expected: { intent: "journal-create", resolution: "execute" }, source: "manual_adversarial", confusionPair: "journal-v-calendar" },
  { id: "confusion-atmosphere-rain", utterance: "less rain", context: baseContext("atmosphere", { topic: "atmosphere" }), expected: { intent: "atmosphere-adjust", resolution: "execute" }, source: "manual_adversarial", confusionPair: "atmosphere-v-calendar" },
  { id: "confusion-journal-bookmark", utterance: "bookmark that", context: baseContext("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "journal-longform" }), expected: { intent: "journal-bookmark", resolution: "execute" }, source: "manual_adversarial", confusionPair: "journal-control-v-dictation" },
  { id: "confusion-week", utterance: "show my whole week", context: baseContext(), expected: { intent: "temporal", resolution: "execute" }, source: "manual_adversarial", confusionPair: "temporal-v-person" },
  { id: "confusion-commitment", utterance: "add Miguel", context: baseContext("people", { peopleView: "commitments", topic: "commitment" }), expected: { intent: "clarification", resolution: "clarify" }, source: "manual_adversarial", confusionPair: "commitment-v-capture-calendar" },
  { id: "confusion-calendar-anaphor", utterance: "move this", context: baseContext("home"), expected: { intent: "clarification", resolution: "clarify" }, source: "manual_adversarial", confusionPair: "calendar-v-unsupported" },
  { id: "confusion-insight", utterance: "put this in motion", context: baseContext("good-to-know", { topic: "recommendation", selectedInsightId: "clear-focus-window" }), expected: { intent: "instinct-act", resolution: "execute" }, source: "manual_adversarial", confusionPair: "insight-v-calendar" },
  { id: "confusion-recording-stop", utterance: "stop", context: baseContext("journal", { topic: "journal", activeJournalEntryId: "journal-1", voiceMode: "journal-longform" }), expected: { intent: "journal-recording", resolution: "execute" }, source: "manual_adversarial", confusionPair: "journal-control-v-session" },
  { id: "confusion-unknown-nav", utterance: "open sesame", context: baseContext(), expected: { resolution: "unsupported" }, source: "manual_adversarial", confusionPair: "navigation-v-unsupported" },
  { id: "regression-home-see-full-day", utterance: "See full day", context: baseContext("home", { topic: "calendar" }), expected: { intent: "navigate", resolution: "execute", route: "calendar" }, source: "regression", family: "release-route" },
  { id: "regression-typed-journal-bookmark", utterance: "Bookmark here", context: baseContext("journal", { topic: "journal", activeJournalEntryId: "journal-1" }), expected: { intent: "journal-bookmark", resolution: "execute" }, source: "regression", family: "release-journal" },
  { id: "regression-atmosphere-authored-name", utterance: "Save this as Sunday evening studio", context: baseContext("atmosphere", { topic: "atmosphere" }), expected: { intent: "atmosphere-save", resolution: "execute" }, source: "regression", family: "release-atmosphere" },
  { id: "regression-put-journal-away", utterance: "Put the journal away", context: baseContext("journal", { topic: "journal", activeJournalEntryId: "journal-1" }), expected: { intent: "workspace", resolution: "execute", route: "home" }, source: "regression", family: "release-workspace" },
  { id: "regression-end-day-boundary", utterance: "I'm done at six today", context: baseContext("calendar", { topic: "calendar" }), expected: { intent: "calendar", resolution: "execute" }, source: "regression", family: "release-calendar" },
  { id: "regression-batch-admin", utterance: "Batch all three admin tasks", context: baseContext("calendar", { topic: "calendar" }), expected: { intent: "calendar", resolution: "execute" }, source: "regression", family: "release-calendar" },
];

export function buildNegativeLanguageCases(): LanguageCase[] {
  const openers = ["Tell me about", "I wonder about", "Let's discuss", "Could we think about", "I was considering", "I have a question about", "What do you think of", "Let's imagine", "I keep noticing", "I am curious about"];
  const subjects = ["the old oak tree", "a distant lighthouse", "the color of fog", "a quiet river", "the shape of clouds", "an antique telescope", "a stone bridge", "the northern wind", "a forgotten melody", "a paper kite", "the ocean at night", "a field of lavender", "the history of maps", "a red fox", "the moon's reflection", "a mountain path", "an empty theatre", "a glass sculpture", "the sound of snow", "a garden gate"];
  const endings = ["in winter", "at sunrise", "from a distance", "without changing anything", "as a metaphor", "in an old story", "for a moment", "in another language", "during a storm", "on a quiet afternoon"];
  const negatives = openers.flatMap((opener) => subjects.flatMap((subject) => endings.map((ending) => `${opener} ${subject} ${ending}`))).slice(0, 2_000 - confusionCases.length).map((utterance, index): LanguageCase => ({
    id: `negative-unsupported-${index + 1}`,
    utterance,
    context: baseContext(["home", "calendar", "journal", "people", "memories"][index % 5] as LifeRoute),
    expected: { resolution: "unsupported" },
    source: "grammar_generated",
    confusionPair: "unsupported-safety",
  }));
  return [...confusionCases, ...negatives];
}

export function buildContextualDialogues(): LanguageDialogue[] {
  const journalOpen = ["open my journal", "take me to journal", "show the journal page", "bring up my journal", "go to the journal area", "show my journal", "open journal", "let me open my journal", "head to journal", "journal please"];
  const journalNew = ["new entry", "new journal entry", "start a new entry", "make a new entry", "create a journal entry", "another entry", "write a new entry", "start writing", "let me get something down", "make a journal entry"];
  const journalStart = ["start with my voice", "start recording", "use my voice", "begin the recording", "record me"];
  const journalMark = ["bookmark that", "mark that part", "keep that bit", "save the last sentence", "remember that moment"];
  const weekOpen = ["show my whole week", "show me the entire week", "open this week", "show the week", "full week", "week view", "show my week", "bring up this week", "take me to the whole week", "what does this week look like"];
  const nextDay = ["tomorrow", "show tomorrow", "show me tomorrow", "open tomorrow", "tomorrow's schedule", "what do I have tomorrow", "what's happening tomorrow", "take me to tomorrow", "show my calendar tomorrow", "tomorrow please"];
  const calendarMove = ["move deep work to three", "move my workout to six", "move the roadmap to tomorrow morning", "shift email to four", "reschedule lunch to one", "push the interview to five", "move deep work before lunch", "move roadmap after lunch", "shift the meeting at two to four", "reschedule the dentist appointment to nine"];
  const names = ["Miguel", "Maya", "Daniel", "Sarah", "Priya", "Ana", "Luis", "Noah", "Elena", "Jonas", "Sofia", "Amir", "Nina", "Leo", "Clara", "Hugo", "Marta", "Iris", "Omar", "Eva"];
  const deliverables = ["send the proposal", "review the contract", "share the budget", "confirm the booking", "deliver the draft", "return the keys", "check the figures", "book the venue", "send the photographs", "approve the design", "call the supplier", "prepare the agenda", "forward the receipt", "finish the outline", "collect the documents", "reply to the invitation", "update the schedule", "sign the form", "test the prototype", "send the notes"];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const atmosphereOpen = ["open atmosphere", "sound room", "shape sound", "open the sound room", "bring up atmosphere", "go to atmosphere", "show the listening room", "take me to sound", "open my sound room", "atmosphere please"];
  const atmospherePlay = ["play Sunday evening", "start Sunday evening", "put on Sunday evening", "use Sunday evening", "play my Sunday evening atmosphere"];
  const atmosphereAdjust = ["less rain", "more rain", "turn the rain down", "make the rain softer", "remove the rain", "bring the rain back", "make the piano quieter", "lower the music", "slow the pulse", "make everything quieter"];
  const goals = ["renew my passport before Senegal", "prepare the client presentation", "organize the house move", "complete the job application", "plan the family reunion", "replace the old bicycle", "prepare for the language exam", "finish the portfolio", "arrange the visa documents", "launch the community workshop", "restore the garden", "publish the research note", "move to the new studio", "learn conversational French", "prepare the annual review", "organize the charity event", "complete the certification", "renovate the spare room", "plan the summer trip", "finish the grant application"];
  const firstSteps = ["check the requirements", "gather the forms", "call the office", "compare the options", "write the outline", "book the appointment", "collect the documents", "ask for estimates", "review the deadline", "make the checklist", "confirm the budget", "find the application", "contact the coordinator", "download the guide", "choose the date", "prepare the questions", "request the records", "check the eligibility", "invite the team", "create the first draft"];
  const pick = <T,>(values: readonly T[], index: number, stride = 1) => values[Math.floor(index / stride) % values.length]!;
  return Array.from({ length: 1_000 }, (_, index): LanguageDialogue => {
    const family = Math.floor(index / 200);
    const local = index % 200;
    const row = (turn: number, utterance: string, intent: GlobalIntent["type"], resolution: ResolutionExpectation = "execute"): LanguageCase => ({ id: `d${index}-${turn}`, utterance, context: baseContext(), expected: { intent, resolution }, source: "contextual_dialogue" });
    if (family === 0) return { id: `dialogue-journal-${local + 1}`, initialContext: baseContext(), turns: [
      row(1, pick(journalOpen, local), "navigate"), row(2, pick(journalNew, local, 10), "journal-create"), row(3, pick(journalStart, local, 20), "journal-recording"), row(4, pick(journalMark, local, 40), "journal-bookmark"),
    ] };
    if (family === 1) return { id: `dialogue-calendar-${local + 1}`, fixtureId: "calendar-next-day", initialContext: baseContext(), turns: [
      row(1, pick(weekOpen, local), "temporal"),
      row(2, pick(nextDay, local, 10), /\b(?:calendar|schedule)\b/.test(pick(nextDay, local, 10)) ? "navigate-temporal" : "temporal"),
      row(3, pick(calendarMove, local, 20), "calendar"), row(4, local % 2 ? "redo" : "undo that", "history"),
    ] };
    if (family === 2) {
      const person = pick(names, local); const deliverable = pick(deliverables, local, 10); const day = pick(days, local, 40);
      return { id: `dialogue-commitment-${person}-${local + 1}`, initialContext: baseContext(), turns: [
        row(1, "open commitments", "navigate"), row(2, `add ${person}`, "clarification", "clarify"), row(3, `${deliverable} ${day}`, "commitment-create"), row(4, "what am I waiting on", "people-query"),
      ] };
    }
    if (family === 3) return { id: `dialogue-atmosphere-${local + 1}`, initialContext: baseContext(), turns: [
      row(1, pick(atmosphereOpen, local), "navigate"), row(2, pick(atmospherePlay, local, 10), "atmosphere-play"), row(3, pick(atmosphereAdjust, local, 20), "atmosphere-adjust"), row(4, local % 2 ? "return home" : "go back home", "navigate"),
    ] };
    return { id: `dialogue-outcome-${local + 1}`, initialContext: baseContext(), turns: [
      row(1, local % 2 ? "open outcomes" : "what am I working toward", "navigate"), row(2, `I need to ${pick(goals, local)}`, "unsupported", "unsupported"), row(3, `Create an outcome called ${pick(goals, local)}`, "outcome-create"), row(4, `the first step is ${pick(firstSteps, local, 10)}`, "step-set-first"), row(5, local % 2 ? "undo" : "undo that", "history"),
    ] };
  });
}

export const languageInventory = {
  curated: buildCuratedLanguageCases(),
  generated: buildGeneratedLanguageCases(),
  negatives: buildNegativeLanguageCases(),
  dialogues: buildContextualDialogues(),
  asr: [] as LanguageCase[],
};

export const languageReleaseMinimums = { curated: 4_000, generated: 50_000, negatives: 5_000, dialogues: 2_000, asr: 2_000 } as const;
