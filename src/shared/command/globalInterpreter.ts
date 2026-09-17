import type { FriendGroup } from "../../domain/friends-model";
import { interpretTranscript } from "../../features/day-planner/parser";
import { parseExplicitCapture } from "./capturePayload";
import type { CalendarAction, CalendarRequest, DayPlan, EventSelector, EventClarificationRequest } from "../../features/day-planner/model";
import { normalizeTranscript } from "../../features/day-planner/interpretation/normalize";
import { dateKeyAfter, parseDurationExpression } from "../../features/day-planner/interpretation/temporal";
import { parseSourceEventReference } from "../../features/day-planner/interpretation/references";
import { resolveEventReference } from "../../features/day-planner/scheduling/resolution";
import type { LifeContext, LifeRoute, Person, PlanStep, TemporalScope } from "../../domain/life-model";
import type { NavigationTarget } from "../../features/voice-navigation/model";
import { voiceDebug } from "../../features/day-planner/voice/voiceDebug";
import { normalizeNavigation } from "../../features/voice-navigation/normalizeNavigation";
import { captureRoleFrame } from "../../features/inbox/captureRoleFrames";
import { outcomeRoleFrame } from "../../features/plans/outcomeRoleFrames";
import { commitmentQueryRoleFrame, commitmentRoleFrame } from "../../features/people/commitmentRoleFrames";
import { assertedObligation, genericRecipient } from "../../features/people/recipientAuthority";
import { matchNavigationIntent, matchSystem } from "./globalMatchers";
import { bindRequestDestinations } from "../../features/day-planner/interpretation/sourceDates";
import { dateKeyFromClock, nearestWeekday, weekendScope, weekScope } from "../../features/elite/temporal";
import { interpretStudioCommandCandidates, type StudioIntent } from "../../features/studio/interpretation/studioInterpreter";
import { withoutWakePrefix } from "../../features/voice-home/wakeEnvelope";
import { journalSegmentDecision, type JournalSegmentEvidence } from "./journalSegmentDecision";
import { correctedTranscript } from "./selfCorrection";
import { isUncommittedGoalStatement } from "./creationAuthority";
import { parseScrollCommand, type ScrollIntent } from "./viewportCapability";
import { leadingQuotedValue, literalValue } from "./literalValue";
import { parseCommitmentView } from "../../features/people/parseCommitmentView";
import type { CommitmentViewIntent } from "../../features/people/commitmentView";
import { parseEntityView } from "../../features/entity-navigation/parseEntityView";
import type { EntityViewIntent } from "../../features/entity-navigation/entityView";
import { parsePresentationCapability, type PresentationIntent } from "./presentationCapability";
import { calendarCreationTimeAnswer, creationTimingHint, type CalendarCreationContinuation } from "./calendarCreationContext";
import { parseFriendIntent, type FriendIntent } from "../../features/friends/friendIntents";
import { bindCalendarParticipants } from "../../features/friends/calendarParticipants";
import { isJournalCreateCommand, isJournalDeleteCommand, isJournalRenameMissingTitle } from "../../features/studio/interpretation/journalSynonyms";

export type GlobalSequenceStep =
  | { type: "temporal"; scope: { kind: "day" | "week"; dateKey: string; endDateKey?: string } }
  | { type: "navigate-temporal"; route: "calendar"; scope: TemporalScope }
  | { type: "navigate"; route: LifeRoute | "back"; target?: NavigationTarget; recovered?: boolean };

export type GlobalIntent =
  | FriendIntent
  | PresentationIntent
  | EntityViewIntent
  | CommitmentViewIntent
  | ScrollIntent
  | StudioIntent
  | { type: "global-sequence"; steps: GlobalSequenceStep[] }
  | { type: "temporal"; scope: { kind: "day" | "week"; dateKey: string; endDateKey?: string } }
  | { type: "navigate-temporal"; route: "calendar"; scope: TemporalScope }
  | { type: "focus-request"; minutes?: number; beforeQuery?: string; subjectQuery?: string }
  | { type: "focus-refine"; minutes: number }
  | { type: "focus-stop" }
  | { type: "focus-extend"; minutes: number }
  | { type: "focus-availability" }
  | { type: "outfit-query"; dateKey?: string }
  | { type: "weather-query"; dateKey?: string }
  | { type: "umbrella-query"; dateKey?: string }
  | { type: "daylight-query"; dateKey?: string }
  | { type: "next-query"; queryKind?: "event" | "meeting" | "anchor" }
  | { type: "calendar-inspect"; selector: EventSelector }
  | { type: "person-query"; query: string; prepare: boolean; dateKey?: string }
  | { type: "people-query"; mode: "relevant" | "at-risk" | "waiting" | "owed-by" | "i-owe"; person?: string; personId?: string }
  | { type: "instinct-query" }
  | { type: "instinct-why" }
  | { type: "instinct-dismiss" }
  | { type: "instinct-act"; instinctId?: string; dateKey?: string }
  | { type: "navigate"; route: LifeRoute | "back"; target?: NavigationTarget; recovered?: boolean }
  | { type: "navigate-plan"; query: string }
  | { type: "history"; direction: "undo" | "redo" }
  | { type: "what-changed" }
  | { type: "session"; mode: "start" | "sleep" }
  | { type: "capture-mode" }
  | { type: "help" }
  | { type: "query-now"; excluded: string[]; maxMinutes?: number }
  | { type: "why-now" }
  | { type: "keep-free" }
  | { type: "capture-create"; title: string }
  | { type: "capture-selected" }
  | { type: "capture-answer"; title: string }
  | { type: "capture-convert"; query?: string }
  | { type: "capture-convert-event"; query?: string; scheduleText: string; durationMinutes: number }
  | { type: "capture-convert-commitment"; query?: string; person: string; direction: "i-owe" | "waiting-on" | "next-conversation" }
  | { type: "capture-batch-archive" }
  | { type: "capture-edit"; title: string; query?: string }
  | { type: "capture-archive"; query?: string }
  | { type: "capture-delete"; query?: string }
  | { type: "outcome-create"; title: string; targetCondition?: string }
  | { type: "plan-rename"; title: string; query?: string; requiredStatus?: "active" | "paused" }
  | { type: "plan-status"; status: "active" | "paused" | "completed"; query?: string; excludedQuery?: string }
  | { type: "plan-delete"; query?: string }
  | { type: "step-add"; title: string; minutes?: number; afterQuery?: string }
  | { type: "step-set-first"; title: string }
  | { type: "step-set-next"; query: string }
  | { type: "step-duration"; query: string; minutes: number }
  | { type: "step-find-time"; query: string }
  | { type: "step-delete"; query: string }
  | { type: "step-add-schedule"; title: string; minutes: number; anchorQuery: string }
  | { type: "step-rename"; query: string; title: string }
  | { type: "step-complete"; query?: string; reopen?: boolean }
  | { type: "step-reorder"; query: string; beforeQuery: string; planQuery?: string }
  | { type: "step-defer"; query: string; dateKey?: string }
  | { type: "step-unschedule"; query: string }
  | { type: "step-schedule"; query: string; dateKey: string; minutes: number; protect: boolean }
  | { type: "commitment-create"; person: string; title: string; direction: "i-owe" | "waiting-on" | "next-conversation"; status: "open"; dueAt?: string }
  | { type: "commitment-find-time"; person?: string; query: string }
  | { type: "commitment-schedule"; person?: string; query: string; dateKey: string; minutes: number; durationMinutes: number }
  | { type: "commitment-complete"; person?: string; query?: string; excluded?: { person?: string; query: string } }
  | { type: "commitment-delete"; person?: string; query?: string }
  | { type: "commitment-defer"; person?: string; query?: string; dateKey: string; reason?: string; requiredStatus?: "open" }
  | { type: "commitment-link-plan"; person: string; planQuery: string }
  | { type: "commitment-due"; query: string; dueAt: string; excluded?: { person?: string; query: string } }
  | { type: "calendar"; request: CalendarRequest }
  | { type: "clarification"; title: string; detail: string; captureQuestion?: true; calendarChoice?: { request: CalendarRequest; clarification: EventClarificationRequest }; continuation?: CalendarCreationContinuation | { type: "commitment-create"; person: string } | { type: "commitment-recipient"; title: string; direction: "i-owe" | "waiting-on" | "next-conversation"; status: "open"; dueAt?: string } | { type: "instinct-act"; instinctId: string } }
  | { type: "confirm" | "cancel" }
  | { type: "pending-choice"; choiceId: string }
  | { type: "unsupported"; title: string; detail: string };

function clean(value: string) {
  return value.replace(/[.!?]+$/g, "").trim();
}

function titleCase(value: string) {
  return value.replace(/^./, (letter) => letter.toUpperCase());
}

function selectorNeedsContext(selector: EventSelector, transactionHasTarget: boolean): boolean {
  if (selector.type === "selected") return true;
  if (selector.type === "anaphor") return !transactionHasTarget;
  if (selector.type === "multi") return selector.selectors.some((item) => selectorNeedsContext(item, transactionHasTarget));
  if (selector.type === "relativeEvent") return selectorNeedsContext(selector.anchor, transactionHasTarget);
  return false;
}

function requestNeedsContext(request: CalendarRequest) {
  // Anaphors after a concrete action bind to that action's resolved result in
  // the Calendar engine. They do not require stale UI selection. A leading
  // “it/this” still needs fresh conversational context.
  if (request.constraints.some(({ selector }) => selectorNeedsContext(selector, false))) return true;
  let transactionHasTarget = false;
  for (const action of request.actions) {
    if ("selector" in action && selectorNeedsContext(action.selector, transactionHasTarget)) return true;
    if ((action.type === "move" || action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom")
      && action.destination.type === "relative"
      && selectorNeedsContext(action.destination.anchor, transactionHasTarget)) return true;
    if ("selector" in action || action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom") {
      transactionHasTarget = true;
    }
  }
  return false;
}

function hasFreshCalendarContext(context: LifeContext) {
  const nowMs = context.nowMs ?? Date.now();
  return [context.selected, context.lastReferenced, context.lastChanged, context.lastCreated, ...(context.lastTargets ?? [])]
    .some((reference) => reference?.kind === "calendar-event" && nowMs - reference.at <= 120_000);
}

function inspectCalendarSelector(normalized: string) {
  const contextualName = normalized.match(/^(?:the |that )(.+?) one$/);
  if (contextualName && !/^(?:new|other|previous|next|first|second|third)$/.test(contextualName[1]!)) return { type: "title" as const, query: contextualName[1]! };
  const match = normalized.match(/^(?:show(?: me)?|open)\s+(?:the\s+)?(.+)$/);
  if (!match) return null;
  const subject = match[1]!;
  if (/\banchor\b/.test(subject)) return null;
  // "Entry"/"note"/"journal" are Journal's object nouns, not Calendar's.
  // Without this, "open the last entry" was swallowed by Calendar's bare
  // current/next/previous/last fallback before Journal ever saw it.
  if (/\b(?:entry|note|journal)\b/.test(subject)) return null;
  if (!/\b(?:meeting|event|appointment|call|block)\b/.test(subject)
    && !/\b(?:current|next|previous|last)\b/.test(subject)) return null;
  return parseSourceEventReference(subject);
}

function pendingFocusMinutes(normalized: string, context: LifeContext) {
  if (context.pending !== "confirmation") return null;
  const match = normalized.match(/^(?:make|change) it(?: to)?\s+(.+?)(?:\s+minutes?)?$/)
    ?? normalized.match(/^(?:give me|use)\s+(.+?)(?:\s+minutes?)?\s+instead$/);
  if (!match) return null;
  return parseDurationExpression(`${match[1]} minutes`);
}

function freshFocusedPersonId(context: LifeContext) {
  const nowMs = context.nowMs ?? Date.now();
  const reference = [context.selected, context.lastReferenced]
    .find((item) => item?.kind === "person" && nowMs - item.at <= 120_000);
  return reference?.id ?? (context.topic === "person" ? context.focusedPersonId : undefined);
}

function dateKeyForWeekday(base: string, weekday: string) {
  const target = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(weekday);
  const date = new Date(`${base}T12:00:00`);
  let offset = (target - date.getDay() + 7) % 7;
  if (offset === 0) offset = 7;
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const clockWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

function clockMinutes(hourValue: string, minuteValue?: string, meridiemValue?: string) {
  let hour = clockWords[hourValue.toLowerCase()] ?? Number(hourValue);
  const meridiem = meridiemValue?.toLowerCase().replaceAll(".", "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && hour >= 1 && hour <= 7) hour += 12;
  return hour * 60 + Number(minuteValue ?? 0);
}

function parseSchedule(text: string, dateKey: string, workdayEndMinutes: number): GlobalIntent | null {
  const afterWork = text.match(/^(?:schedule|put|add)\s+(?:the\s+)?(.+?)\s+(?:step\s+)?(?:to\s+calendar\s+|to\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+after work$/i);
  if (afterWork) {
    const rawQuery = clean(afterWork[1]!).replace(/\s+step$/i, "");
    return { type: "step-schedule", query: /^(?:it|this|that|selected|current)$/.test(rawQuery.toLowerCase()) ? "this" : rawQuery, dateKey: dateKeyForWeekday(dateKey, afterWork[2]!.toLowerCase()), minutes: workdayEndMinutes, protect: false };
  }
  const match = text.match(/(?:(?:schedule|put|add)\s+(?:the\s+)?|move scheduled\s+)(.+?)\s+(?:step\s+)?(?:to\s+calendar\s+|to\s+|on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:morning\s+)?(?:at\s+)?(?:about\s+)?(ten|eleven|twelve|one|two|three|four|five|six|seven|eight|nine|\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
  if (!match) return null;
  const rawQuery = clean(match[1]!).replace(/\s+step$/i, "");
  const query = /^(?:it|this|that|selected|current)$/.test(rawQuery.toLowerCase()) ? "this" : rawQuery;
  return { type: "step-schedule", query, dateKey: dateKeyForWeekday(dateKey, match[2]!.toLowerCase()), minutes: clockMinutes(match[3]!, match[4], match[5]), protect: /\band protect it\b/i.test(text) };
}

type StepIdentity = Pick<PlanStep, "id" | "planId" | "title">;

function resolveStepSchedule(
  intent: Extract<GlobalIntent, { type: "step-schedule" }>,
  transcript: string,
  context: LifeContext,
  steps: readonly StepIdentity[],
): GlobalIntent | null {
  const contextual = /^(?:this|selected|current)(?: step)?$/i.test(intent.query);
  const nowMs = context.nowMs ?? Date.now();
  const contextualId = [context.selected, context.lastReferenced, context.lastChanged, context.lastCreated]
    .find((reference) => reference?.kind === "plan-step" && nowMs - reference.at <= 120_000)?.id
    ?? (context.route === "plans" || context.route === "outcomes" ? context.focusedEntityId : undefined);
  const planPool = context.activePlanId ? steps.filter(({ planId }) => planId === context.activePlanId) : steps;
  const normalizedQuery = normalizeTranscript(intent.query);
  const exact = contextual ? planPool.filter(({ id }) => id === contextualId) : planPool.filter(({ title }) => normalizeTranscript(title) === normalizedQuery);
  const matches = exact.length ? exact : contextual ? [] : planPool.filter(({ title }) => normalizeTranscript(title).includes(normalizedQuery));
  if (matches.length === 1) return intent;
  if (matches.length > 1) {
    return { type: "clarification", title: `Which ${titleCase(intent.query)} step do you mean?`, detail: matches.slice(0, 3).map(({ title }) => title).join(" · ") };
  }
  const explicitStepLanguage = /\bstep\b|\bto (?:the )?calendar\b|^move scheduled\b|^(?:schedule|put|add)\s+(?:it|this|that)\b/i.test(transcript);
  if (explicitStepLanguage) {
    return { type: "clarification", title: `I can't find the ${titleCase(intent.query)} step.`, detail: "Name a step in an active plan." };
  }
  return null;
}

function parseCommitmentSchedule(text: string, dateKey: string): GlobalIntent | null {
  const findTime = text.match(/^find time for (?:the )?(.+?) (?:promise|commitment)(?:\s+(?:to|with)\s+([a-z][\w'-]*))?$/i);
  if (findTime) return { type: "commitment-find-time", query: clean(findTime[1]!), ...(findTime[2] ? { person: titleCase(findTime[2]) } : {}) };
  const match = text.match(/^(?:reserve|schedule|block)\s+(?:(\w+)\s+minutes?\s+)?(?:for\s+)?(?:the\s+)?(.+?)\s+promise(?:\s+to\s+([a-z][\w'-]*))?\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?(ten|eleven|twelve|one|two|three|four|five|six|seven|eight|nine|\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!match) return null;
  return {
    type: "commitment-schedule",
    query: clean(match[2]!),
    ...(match[3] ? { person: titleCase(match[3]) } : {}),
    dateKey: dateKeyForWeekday(dateKey, match[4]!.toLowerCase()),
    minutes: clockMinutes(match[5]!, match[6], match[7]),
    durationMinutes: parseDurationExpression(`${match[1] ?? "30"} minutes`) ?? 30,
  };
}

function parseCommitment(text: string, dateKey: string): GlobalIntent | null {
  const deadlineNormalized = text.replace(/\bno later than\b/gi, "by");
  // Only an outer asserted obligation grants creation authority. Reported
  // words, quoted examples and negated assertions must not match a substring.
  const mine = deadlineNormalized.match(/^(?:i promised|i owe|add (?:a )?promise to)\s+([a-z][\w'-]*)\s+(?:i(?:'d| would| will|'ll)?\s+|to\s+)?(.+?)(?:\s+(?:by\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow))?$/i)
    ?? deadlineNormalized.match(/^i told\s+([a-z][\w'-]*)\s+i(?: would| will|'d|'ll)\s+(.+?)(?:\s+(?:by\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow))?$/i);
  const possessiveWaiting = text.match(/^(?:i am\s+)?waiting (?:on|for)\s+([a-z][\w'-]*)'s\s+(.+)$/i);
  if (possessiveWaiting) return { type: "commitment-create", person: titleCase(possessiveWaiting[1]!), title: titleCase(clean(possessiveWaiting[2]!)), direction: "waiting-on", status: "open" };
  const nextConversation = text.match(/^(?:next time i (?:see|speak (?:with|to))|for my next conversation with)\s+([a-z][\w'-]*)\s+(?:i need to\s+|remember to\s+)?(.+)$/i);
  if (nextConversation) return { type: "commitment-create", person: titleCase(nextConversation[1]!), title: titleCase(clean(nextConversation[2]!)), direction: "next-conversation", status: "open" };
  const theirs = deadlineNormalized.match(/^(?:waiting on\s+([a-z][\w'-]*)\s+(?:for|to)\s+|([a-z][\w'-]*)\s+(?:promised\s+(?:(?:she|he|they)\s*)?(?:(?:would|'d|will)\s+)?|said\s+(?:she|he|they)(?:\s+(?:would|will)|'(?:d|ll))\s+))(.+?)(?:\s+(?:by\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow))?$/i);
  const match = mine ?? theirs;
  if (!match) return null;
  const person = titleCase(mine ? match[1]! : (match[1] ?? match[2])!);
  const title = clean(mine ? match[2]! : match[3]!);
  if (/^(?:not|never|no longer)\b/i.test(title)) return null;
  const dueWord = mine ? match[3] : match[4];
  let dueAt: string | undefined;
  if (dueWord) {
    const dueKey = dueWord.toLowerCase() === "tomorrow" ? (() => { const d = new Date(`${dateKey}T12:00:00`); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })() : dateKeyForWeekday(dateKey, dueWord.toLowerCase());
    dueAt = `${dueKey}T17:00:00.000Z`;
  }
  return { type: "commitment-create", person, title: titleCase(title.replace(/^the\s+/, "").replace(/^she\s+|^he\s+|^they\s+/i, "")), direction: mine ? "i-owe" : "waiting-on", status: "open", dueAt };
}
/** Independent feature adapters. Each adapter owns one bounded product
 * grammar and may propose at most one intent. The global registry evaluates
 * all proposals; no adapter can suppress a proposal from another domain. */
function normalizedFeatureInput(transcript: string) {
  return {
    normalized: normalizeTranscript(transcript),
    spoken: clean(transcript)
      .replace(/^(?:(?:uh|um|erm|actually|please),?\s+)+/i, "")
      .replace(/^(?:could|can|would)\s+you\s+(?:please\s+)?/i, "")
      .replace(/^i\s+(?:need|want)\s+you\s+to\s+/i, "")
      .trim(),
  };
}

function systemFeatureProposal(transcript: string, context: LifeContext): GlobalIntent | null {
  const normalized = normalizeTranscript(transcript);
  if (normalized === "pause" && (context.topic === "journal" || context.route === "journal" || context.topic === "atmosphere" || context.route === "atmosphere")) return null;
  const system = matchSystem(normalized);
  if (system) return system;
  if (!context.pending || !context.pendingChoices?.length) return null;
  const response = normalized.replace(/^no[,\s]+/, "");
  const ordinal = response.match(/^(?:(?:choose|use|pick) )?(?:the )?(?:option )?(one|first|1|two|second|2|three|third|3)(?: (?:one|option))?$/)?.[1];
  const ordinalIndex = ordinal && ["one", "first", "1"].includes(ordinal) ? 0
    : ordinal && ["two", "second", "2"].includes(ordinal) ? 1 : ordinal ? 2 : -1;
  const answer = response.replace(/^(?:choose|use|pick)\s+/, "").replace(/^the\s+/, "").replace(/\s+one$/, "");
  const matches = context.pendingChoices?.filter(({ label }) => normalizeTranscript(label) === answer || normalizeTranscript(label).includes(answer));
  const choice = ordinalIndex >= 0 ? context.pendingChoices?.[ordinalIndex] : matches?.length === 1 ? matches[0] : undefined;
  return choice ? { type: "pending-choice", choiceId: choice.id } : null;
}

function attentionFeatureProposals(transcript: string, context: LifeContext): GlobalIntent[] {
  const framedQuery = commitmentQueryRoleFrame(transcript);
  if (framedQuery) return [framedQuery];
  const proposals: GlobalIntent[] = [];
  const { normalized } = normalizedFeatureInput(transcript);
  const realToday = dateKeyFromClock(new Date(context.nowMs ?? Date.now()));
  const explicitDay = normalized.match(/\b(?:(next)\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/);
  const queryDateKey = explicitDay?.[2] === "today" ? realToday
    : explicitDay?.[2] === "tomorrow" ? dateKeyAfter(realToday, 1)
      : explicitDay?.[2] ? nearestWeekday(realToday, weekdayIndex[explicitDay[2]]!, Boolean(explicitDay[1])) : undefined;
  const refinedFocusMinutes = pendingFocusMinutes(normalized, context);
  if (refinedFocusMinutes) proposals.push({ type: "focus-refine", minutes: refinedFocusMinutes });
  const prefixedWeather = normalized.match(/^(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday),?\s+(what should i wear|what do i wear|what is the weather|what s the weather|do i need an umbrella)$/);
  if (prefixedWeather) {
    const dayWord = prefixedWeather[1]!;
    const dateKey = dayWord === "today" ? realToday
      : dayWord === "tomorrow" ? dateKeyAfter(realToday, 1)
        : nearestWeekday(realToday, weekdayIndex[dayWord]!);
    const query = prefixedWeather[2]!;
    if (/wear/.test(query)) proposals.push({ type: "outfit-query", dateKey });
    else if (/umbrella/.test(query)) proposals.push({ type: "umbrella-query", dateKey });
    else proposals.push({ type: "weather-query", dateKey });
  }
  if (/^(?:what should i wear|what do i wear|help me dress)(?:\s+(?:(?:next)\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))?$/.test(normalized)) proposals.push({ type: "outfit-query", ...(queryDateKey ? { dateKey: queryDateKey } : {}) });
  if (/^(?:(?:do i need|will i need|should i take) (?:an )?umbrella|is rain going to catch me)(?:\s+(?:when i leave|after work|today|tomorrow|(?:(?:next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)))?$/.test(normalized)) proposals.push({ type: "umbrella-query", ...(queryDateKey ? { dateKey: queryDateKey } : {}) });
  if (/^(?:(?:what is|what s|how is) (?:the )?weather|weather forecast|how cold will it be(?: when i come home)?|will it rain)(?:\s+(?:today|tomorrow|(?:(?:next)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)))?$/.test(normalized)) proposals.push({ type: "weather-query", ...(queryDateKey ? { dateKey: queryDateKey } : {}) });
  if (/^(?:when does the sun set|what time is sunset|can i walk before sunset)$/.test(normalized)) proposals.push({ type: "daylight-query" });
  if (/^(?:what is|what s|what's) next|what is my next meeting|show my next anchor$/.test(normalized)) proposals.push({ type: "next-query", queryKind: /\bmeeting\b/.test(normalized) ? "meeting" : /\banchor\b/.test(normalized) ? "anchor" : "event" });
  if (/^(?:how much focus time do i have|how much time do i have|how much clear time do i have)$/.test(normalized)) proposals.push({ type: "focus-availability" });
  if (/^(?:stop focus|pause focus|end (?:the )?(?:focus )?session)$/.test(normalized)) proposals.push({ type: "focus-stop" });
  const focusExtension = normalized.match(/^(?:add|extend focus by|keep going for)\s+(.+?)(?:\s+minutes?)?$/)
    ?? normalized.match(/^give me\s+(.+?)\s+more\s+minutes?$/);
  if (focusExtension && (context.topic === "focus" || context.route === "focus")) {
    const minutes = parseDurationExpression(`${focusExtension[1]} minutes`);
    if (minutes) proposals.push({ type: "focus-extend", minutes });
  }
  const focusPrefix = /^(?:give me\b|i need\b|can i get\b|start(?: a)?\b)/.test(normalized) || /^focus on .+? for /.test(normalized);
  const focusMinutes = parseDurationExpression(normalized) ?? undefined;
  const focusSubject = normalized.match(/^focus on (.+?) for\s+/)?.[1];
  const focusAnchor = normalized.match(/\s+before\s+(.+)$/)?.[1];
  const asksForCalendarReflow = /\b(?:move|reflow|rearrange|shift)\b[^.]*\b(?:anything|everything|work|events?)\b[^.]*\bflexible\b/.test(normalized)
    || /\b(?:move|reflow|rearrange|shift)\b[^.]*\bflexible\b/.test(normalized);
  const extendsSelectedCalendarItem = /\b(?:another|more)\b.*\b(?:on|for)\s+(?:this|that|it|the selected event)$/.test(normalized);
  if ((normalized === "start focus" || (focusPrefix && focusMinutes)) && !asksForCalendarReflow && !extendsSelectedCalendarItem && !/^(?:it|this|that|the selected event)$/.test(focusAnchor ?? "")) {
    proposals.push({ type: "focus-request", ...(focusMinutes ? { minutes: focusMinutes } : {}), ...(focusSubject ? { subjectQuery: focusSubject } : {}), ...(focusAnchor ? { beforeQuery: focusAnchor } : {}) });
  }
  if (/^(?:what did you notice|what should i know|anything i should know)$/.test(normalized)) proposals.push({ type: "instinct-query" });
  if (/^(?:why this|why that|how do you know)$/.test(normalized)) proposals.push({ type: "instinct-why" });
  if (/^(?:not now|dismiss that|hide that)$/.test(normalized)) proposals.push({ type: "instinct-dismiss" });
  if (/^(?:do that|act on (?:that|this|the .+)|use that|start that)$/.test(normalized)) proposals.push({ type: "instinct-act" });
  if (/^(?:who do i need to follow up with|who needs me|show relevant people)$/.test(normalized)) proposals.push({ type: "people-query", mode: "relevant" });
  if (/^(?:what promises are at risk|which promises are at risk)$/.test(normalized)) proposals.push({ type: "people-query", mode: "at-risk" });
  if (/^(?:who am i waiting on|what am i waiting on)$/.test(normalized)) proposals.push({ type: "people-query", mode: "waiting" });
  if (/^what do i owe (?:her|him|them)$/.test(normalized)) {
    const personId = freshFocusedPersonId(context);
    proposals.push(personId ? { type: "people-query", mode: "i-owe", personId }
      : { type: "clarification", title: "Who do you mean?", detail: "Show one person first. Nothing changed." });
  }
  const owedBy = normalized.match(/^what does ([a-z][a-z '-]+) owe me$/);
  if (owedBy) proposals.push({ type: "people-query", mode: "owed-by", person: titleCase(owedBy[1]!) });
  const person = normalized.match(/^(show|prepare(?: me)? for)\s+([a-z][a-z '-]+?)(?:\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday))?$/);
  if (person && !/^(?:me|what|why|how|where|when|whether|only|the|all)\b/.test(person[2]!)) {
    const dayWord = person[3];
    const target = dayWord === "tomorrow" ? dateKeyAfter(realToday, 1)
      : dayWord && weekdayIndex[dayWord] !== undefined ? nearestWeekday(realToday, weekdayIndex[dayWord]!) : undefined;
    proposals.push({ type: "person-query", query: titleCase(person[2]!), prepare: person[1] !== "show", ...(target ? { dateKey: target } : {}) });
  }
  if (/^(?:why these|why these recommendations|why .+)$/.test(normalized)) proposals.push({ type: "why-now" });
  if (/^(?:keep (?:the )?time free|leave (?:the )?time free)$/.test(normalized)) proposals.push({ type: "keep-free" });
  if (/nothing administrative|no calls/.test(normalized)) proposals.push({ type: "query-now", excluded: /calls/.test(normalized) ? ["call"] : ["admin", "email", "documents"] });
  if (/^(?:what am i forgetting|what now)$/.test(normalized) || /what (?:fits|can i do)(?: right)? now|what (?:needs|requires) me now|what needs my attention|what fits before (?:the )?next meeting|something under|\bi have .+ minutes.*what fits/.test(normalized)) {
    const duration = parseDurationExpression(normalized);
    const maxMinutes = duration === null ? undefined : /\bunder\b/.test(normalized) ? Math.max(0, duration - 1) : duration;
    proposals.push({ type: "query-now", excluded: [], ...(maxMinutes !== undefined ? { maxMinutes } : {}) });
  }
  return proposals;
}

function commitmentFeatureProposals(transcript: string, dateKey: string): GlobalIntent[] {
  const asserted = assertedObligation(normalizedFeatureInput(transcript).spoken, dateKey);
  if (asserted) return [asserted];
  const framed = commitmentRoleFrame(normalizedFeatureInput(transcript).spoken, dateKey);
  if (framed) return [framed];
  const proposals: GlobalIntent[] = [];
  // The required ditransitive obligation has a recipient plus a distinct
  // object phrase. Verb particles/determiners aren't person identities, and
  // an omitted object boundary must not create a guessed contact.
  const delivery = transcript.trim().match(/^i need to send\s+([\p{L}][\p{L}'’-]*)\s+((?:the|a|an|my|your|our|their|his|her|this|that|these|those|some)\s+.+?)\s*[.!?]?$/iu);
  if (delivery) {
    if (/^(?:someone|somebody|him|her|them)$/i.test(delivery[1]!)) return [{ type: "clarification", title: "Who should receive it?", detail: "Name the person. Nothing was created." }];
    if (!/^(?:out|in|up|down|back|over|off|around|across|through|on|to|for|the|a|an|my|your|our|their|this|that|some)$/i.test(delivery[1]!)) {
      const obligation = delivery[2]!;
      const due = obligation.match(/\s+by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)$/i);
      const dueDate = due ? due[1]!.toLowerCase() === "tomorrow" ? dateKeyAfter(dateKey, 1) : dateKeyForWeekday(dateKey, due[1]!.toLowerCase()) : undefined;
      proposals.push({ type: "commitment-create", person: titleCase(delivery[1]!), title: `Send ${due ? obligation.slice(0, due.index) : obligation}`, direction: "i-owe", status: "open", ...(dueDate ? { dueAt: `${dueDate}T17:00:00.000Z` } : {}) });
    }
  }
  const { normalized, spoken } = normalizedFeatureInput(transcript);
  const scheduled = parseCommitmentSchedule(normalized, dateKey);
  if (scheduled) proposals.push(scheduled);
  const created = parseCommitment(normalized, dateKey);
  if (created?.type === "commitment-create" && /^(?:someone|somebody|anyone|anybody|nobody|him|her|them)$/i.test(created.person)) proposals.push({ type: "clarification", title: "Who is this promise with?", detail: "Name the person. Nothing was created." });
  else if (created) proposals.push(created);
  const complete = spoken.match(/^mark (?:the )?(.+?) promise(?: to ([a-z][\w'-]*))? (?:done|complete)$/i);
  if (/^mark (?:this|that|the current) (?:promise|commitment) as (?:done|complete)$/i.test(spoken)) proposals.push({ type: "commitment-complete" });
  if (complete) proposals.push({ type: "commitment-complete", query: clean(complete[1]!), ...(complete[2] ? { person: complete[2] } : {}) });
  const link = spoken.match(/link ([a-z][\w'-]*) promise to (?:the )?(.+?) plan$/i);
  if (link) proposals.push({ type: "commitment-link-plan", person: link[1]!, planQuery: clean(link[2]!) });
  const deadline = spoken.match(/^move (?:the )?(.+?) deadline (?:to )?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:,?\s+not the meeting time)?$/i);
  if (deadline) proposals.push({ type: "commitment-due", query: clean(deadline[1]!), dueAt: `${dateKeyForWeekday(dateKey, deadline[2]!.toLowerCase())}T17:00:00.000Z` });
  const remove = spoken.match(/(?:delete|remove) (?:the )?(.+?)?\s*promise(?: to ([a-z][\w'-]*))?$/i);
  if (remove) proposals.push({ type: "commitment-delete", ...(remove[1] ? { query: clean(remove[1]) } : {}), ...(remove[2] ? { person: remove[2] } : {}) });
  const defer = spoken.match(/^defer (?:the )?(.+?) (?:promise|commitment)(?: (?:with|to|from) ([a-z][\w'-]*))? until (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)(?: because (.+))?$/i);
  if (defer) proposals.push({ type: "commitment-defer", query: clean(defer[1]!), ...(defer[2] ? { person: defer[2] } : {}), dateKey: defer[3]!.toLowerCase() === "tomorrow" ? dateKeyAfter(dateKey, 1) : dateKeyForWeekday(dateKey, defer[3]!.toLowerCase()), ...(defer[4] ? { reason: clean(defer[4]) } : {}) });
  return proposals;
}

function captureFeatureProposals(transcript: string, context: LifeContext): GlobalIntent[] {
  const proposals: GlobalIntent[] = [];
  const role = captureRoleFrame(transcript, context);
  if (role) proposals.push(role);
  const { normalized, spoken } = normalizedFeatureInput(transcript);
  const event = spoken.match(/^turn (?:this|that|the selected)(?: capture| note)? into (?:a |an )?(?:(.+?)\s+)?event\s+(.+)$/i);
  if (event) proposals.push({ type: "capture-convert-event", scheduleText: clean(event[2]!), durationMinutes: parseDurationExpression(event[1] ?? "") ?? 30 });
  const commitment = spoken.match(/^turn (?:this|that|the selected)(?: capture| note)? into (?:a )?(?:(waiting on|next conversation) )?commitment (?:with|to|from) ([a-z][\w'-]*)$/i);
  if (commitment) proposals.push({ type: "capture-convert-commitment", person: titleCase(commitment[2]!), direction: commitment[1]?.toLowerCase() === "waiting on" ? "waiting-on" : commitment[1]?.toLowerCase() === "next conversation" ? "next-conversation" : "i-owe" });
  // "Make a note"/"create a note" is a bare Journal creation command, not a
  // request to convert something into a note — guard it out before the loose
  // conversion-verb match below, which would otherwise treat any sentence
  // containing "note" or "plan" as a conversion.
  if (!isJournalCreateCommand(normalized) && /^(?:turn|make|convert|create (?:plan|outcome) from|plan)\b.*\b(?:plan|outcome|capture|note|item)\b|^turn that into (?:a |an )?(?:plan|outcome)$/.test(normalized)) {
    const query = normalized.match(/^turn (?:the )?(.+?) (?:item|capture|note) into (?:a |an )?(?:plan|outcome)$/)?.[1]
      ?? normalized.match(/(?:from|convert)\s+(.+?)(?:\s+(?:capture|note))?(?:\s+into (?:a |an )?(?:plan|outcome))?$/)?.[1];
    const resolvedQuery = /\blatest capture\b/.test(normalized) ? "latest" : query && !/^(?:that|this|latest)$/.test(query) ? query : undefined;
    proposals.push({ type: "capture-convert", ...(resolvedQuery ? { query: resolvedQuery } : {}) });
  }
  if (/^(?:archive|clear) all (?:the )?(?:unresolved )?(?:captures|capture items|inbox items)(?:,? not the calendar)?$/.test(normalized)) proposals.push({ type: "capture-batch-archive" });
  const edit = spoken.match(/^(?:edit|change|rename) (?:(?:this|that|the) )?capture(?: we (?:were|are) (?:just )?discussing)? to ([\s\S]+)$/i);
  if (edit) proposals.push({ type: "capture-edit", title: literalValue(edit[1]!) });
  if (/^archive (?:(?:this|that|the) )?(?:capture|note)(?:,? but keep its wording)?$/.test(normalized)) proposals.push({ type: "capture-archive" });
  const remove = normalized.match(/^(?:delete|remove)\s+(?:this |the )?(?:capture|(.+?)\s+(?:note|capture))(?: from capture)?$/);
  if (remove) proposals.push({ type: "capture-delete", ...(remove[1] ? { query: remove[1] } : {}) });
  const explicit = parseExplicitCapture(spoken);
  if (explicit) proposals.push({ type: "capture-create", title: explicit });
  if (context.captureMode && normalized.length > 1) proposals.push({ type: "capture-create", title: clean(transcript) });
  return proposals;
}

function planFeatureProposals(transcript: string, context: LifeContext, dateKey: string, steps: readonly StepIdentity[], workdayEndMinutes: number): GlobalIntent[] {
  const proposals: GlobalIntent[] = [];
  const { normalized, spoken } = normalizedFeatureInput(transcript);
  const framed = outcomeRoleFrame(spoken, context);
  if (framed) return [framed];
  const operationText = spoken
    .replace(/,?\s+without putting it on the calendar$/i, "")
    .replace(/,?\s+but keep it in (?:the )?(?:outcome|plan)$/i, "")
    .replace(/,?\s+including its reserved time$/i, "")
    .replace(/\s+in this plan$/i, "");
  const open = normalized.match(/^(?:open|show me) (?:the )?(.+?) plan$/)
    ?? normalized.match(/^open plans and (?:show|open) (?:the )?(.+?) plan$/);
  if (open) proposals.push({ type: "navigate-plan", query: open[1]! });
  const schedule = parseSchedule(spoken, dateKey, workdayEndMinutes);
  if (schedule?.type === "step-schedule") {
    const resolved = resolveStepSchedule(schedule, spoken, context, steps);
    if (resolved) proposals.push(resolved);
  }
  const incompleteNamed = normalized.match(/^(?:schedule|put) (?:the )?(.+)$/)?.[1];
  if (incompleteNamed && steps.filter(({ title }) => normalizeTranscript(title) === incompleteNamed).length === 1) proposals.push({ type: "clarification", title: `When should I schedule ${titleCase(incompleteNamed)}?`, detail: "Name a day and time." });
  const incomplete = normalized.match(/^(?:(?:schedule|put) (?:the )?(.+?) step|add (?:the )?(.+?)(?: step)? to calendar)$/);
  if (incomplete) proposals.push({ type: "clarification", title: `When should I schedule ${titleCase(clean((incomplete[1] ?? incomplete[2])!))}?`, detail: "Name a day and time." });
  const first = spoken.match(/^(?:the\s+)?first step (?:is|should be|will be)\s+(.+)$/i);
  if (first) proposals.push({ type: "step-set-first", title: titleCase(clean(first[1]!)) });
  const renamePlan = spoken.match(/^rename (?:(?:this|the) )?(?:plan|outcome)(?: we(?:'re| are) working on)? to ([\s\S]+)$/i);
  if (renamePlan) proposals.push({ type: "plan-rename", title: literalValue(renamePlan[1]!) });
  const status = normalized.match(/^(pause|resume|complete|finish) (?:(?:this|the) (?:plan|outcome)|(.+?) (?:plan|outcome))$/);
  if (status) proposals.push({ type: "plan-status", status: status[1] === "pause" ? "paused" : status[1] === "resume" ? "active" : "completed", ...(status[2] ? { query: status[2] } : {}) });
  const deletePlan = spoken.match(/^(?:delete|remove) (?:(?:this|the) (?:plan|outcome)|(.+?) (?:plan|outcome))$/i);
  if (deletePlan) proposals.push({ type: "plan-delete", ...(deletePlan[1] ? { query: clean(deletePlan[1]) } : {}) });
  const pool = context.activePlanId ? steps.filter(({ planId }) => planId === context.activePlanId) : steps;
  const known = (query: string) => pool.some(({ title }) => normalizeTranscript(title).includes(normalizeTranscript(query)));
  const next = operationText.match(/^(?:make|set) (?:the )?(.+?)(?: step)? (?:as (?:the )?|the )?next step$/i);
  if (next) proposals.push({ type: "step-set-next", query: clean(next[1]!) });
  const duration = operationText.match(/^(?:make|set) (?:the )?(.+?) step (.+?)(?: long)?$/i)
    ?? operationText.match(/^(?:make|set) (?:the )?(.+?)(?: step)? (.+?(?:minutes?|hours?|half an hour))(?: long)?$/i);
  if (duration && (/\bstep\b/i.test(spoken) || known(duration[1]!))) {
    const minutes = parseDurationExpression(duration[2]!);
    if (minutes) proposals.push({ type: "step-duration", query: clean(duration[1]!), minutes });
  }
  const find = spoken.match(/^find time for (?:the )?(.+?)(?: step)?(?: this week)?$/i);
  if (find) proposals.push({ type: "step-find-time", query: clean(find[1]!) });
  const remove = operationText.match(/^(?:delete|remove) (?:the )?(.+?)(?: step)$/i);
  if (remove) proposals.push({ type: "step-delete", query: clean(remove[1]!) });
  const reorder = operationText.match(/^move (?:the )?(.+?)(?: step)? before (?:the )?(.+?)(?: step)?$/i);
  if (reorder && (/\bstep\b/i.test(spoken) || (known(reorder[1]!) && known(reorder[2]!)))) proposals.push({ type: "step-reorder", query: clean(reorder[1]!), beforeQuery: clean(reorder[2]!) });
  const defer = spoken.match(/defer (?:the )?(.+?)(?: step)?(?: until (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow))?$/i);
  if (defer && (/\bstep\b/i.test(spoken) || known(defer[1]!))) proposals.push({ type: "step-defer", query: clean(defer[1]!), ...(defer[2] ? { dateKey: defer[2].toLowerCase() === "tomorrow" ? dateKeyAfter(dateKey, 1) : dateKeyForWeekday(dateKey, defer[2].toLowerCase()) } : {}) });
  const unschedule = operationText.match(/^unschedule (?:the )?(.+?)(?: step)?$/i);
  if (unschedule) proposals.push({ type: "step-unschedule", query: clean(unschedule[1]!) });
  const addAndSchedule = spoken.match(/add (?:a |an |the )?(.+?)\s+and schedule (?:it )?after (?:the )?(.+)$/i);
  if (addAndSchedule) proposals.push({ type: "step-add-schedule", title: clean(addAndSchedule[1]!.replace(/^.+?\s+minutes?\s+/i, "").replace(/\s+step$/i, "")), minutes: parseDurationExpression(addAndSchedule[1]!) ?? 25, anchorQuery: clean(addAndSchedule[2]!) });
  const rename = spoken.match(/rename (?:the )?(.+?)(?: step)? to (.+)$/i);
  if (rename && (/\bstep\b/i.test(spoken) || known(rename[1]!))) proposals.push({ type: "step-rename", query: clean(rename[1]!), title: clean(rename[2]!) });
  const add = spoken.match(/add (?:a |an |the )?(.+?)(?: step)?(?: after (.+?))?(?: to (?:this |the )?plan)?$/i);
  if (add && (Boolean(context.activePlanId) || /\b(?:step|to (?:this|the) plan)\b/i.test(spoken))) {
    const withDuration = add[1]!.match(/^(\d+)\s*minute\s+(.+)$/i);
    proposals.push({ type: "step-add", title: clean(withDuration?.[2] ?? add[1]!), minutes: withDuration ? Number(withDuration[1]) : 25, ...(add[2] ? { afterQuery: clean(add[2]) } : {}) });
  }
  const complete = spoken.match(/(?:mark|finish|complete) (?:the )?(.+?)(?: step)?(?: complete| done)?$/i);
  if (complete && (Boolean(context.activePlanId) || /\bstep\b/i.test(spoken))) proposals.push({ type: "step-complete", query: clean(complete[1]!) });
  if (/^reopen\b/.test(normalized) && (Boolean(context.activePlanId) || /\bstep\b/.test(normalized))) proposals.push({ type: "step-complete", query: clean(normalized.replace(/^reopen\s+/, "")), reopen: true });
  return proposals;
}

function fallbackFeatureProposal(transcript: string, dateKey: string): GlobalIntent {
  const normalized = normalizeTranscript(transcript);
  if (/^add\s+.+/.test(normalized)) return { type: "clarification", title: "Should I capture that in Inbox or schedule it?", detail: "Say “Capture…” or include a duration and time." };
  if (/^[a-z][\w'-]*\s+by\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)$/.test(normalized)) return { type: "clarification", title: `What did you promise ${titleCase(normalized.split(" ")[0]!)}?`, detail: "Also say whether you owe it or are waiting on them." };
  const calendar = interpretTranscript(transcript, dateKey);
  if (calendar.status === "unsupported" && !/couldn't resolve an action from/i.test(calendar.detail)) {
    return { type: "unsupported", title: "Nothing changed", detail: calendar.detail };
  }
  return { type: "unsupported", title: "Nothing changed", detail: /^(?:open|show|go|take|bring|pull|switch|change|jump|head|navigate|enter|visit|display|launch|let me see|i want to see|i would like to see)\b/.test(normalized) ? "Which place should I open? Nothing was captured." : "What would you like to change? Name an action or say “Capture…” explicitly." };
}

type ProductionFeature = "system" | "attention" | "commitment" | "capture" | "plan" | "fallback";

export type IntentDomain = "system" | "navigation" | "temporal" | "journal" | "atmosphere" | "memory" | "workspace" | "commitment" | "insight" | "calendar" | "life" | "unsupported";

export interface GlobalIntentCandidate {
  definitionId: string;
  domain: IntentDomain;
  intent: GlobalIntent;
  score: number;
  positiveEvidence: string[];
  negativeEvidence: string[];
  confidence: "high" | "contextual" | "clarify" | "unsupported";
}

interface CandidateInput {
  people: readonly Person[];
  groups: readonly FriendGroup[];
  participantProblem?: { query: string; request: CalendarRequest };
  transcript: string;
  normalized: string;
  context: LifeContext;
  dateKey: string;
  steps: readonly StepIdentity[];
  workdayEndMinutes: number;
  navigation: ReturnType<typeof matchNavigationIntent>;
  studioIntents: readonly StudioIntent[];
  calendarParse: ReturnType<typeof interpretTranscript>;
  calendarPlan?: DayPlan;
}

/** Each feature grammar returns every independently matched semantic action.
 * Registry definitions select their own action from this set, so no earlier
 * match inside a domain can hide a competing action from the central scorer. */
function featureProposals(source: ProductionFeature, input: CandidateInput): GlobalIntent[] {
  if (source === "system") {
    const intent = systemFeatureProposal(input.transcript, input.context);
    return intent ? [intent] : [];
  }
  if (source === "attention") return attentionFeatureProposals(input.transcript, input.context);
  if (source === "commitment") return commitmentFeatureProposals(input.transcript, input.dateKey);
  if (source === "capture") return captureFeatureProposals(input.transcript, input.context);
  if (source === "plan") return planFeatureProposals(input.transcript, input.context, input.dateKey, input.steps, input.workdayEndMinutes);
  return [fallbackFeatureProposal(input.transcript, input.dateKey)];
}

export interface IntentDefinition {
  id: string;
  domain: IntentDomain;
  intentTypes: readonly GlobalIntent["type"][];
  calendarActionType?: CalendarAction["type"];
  examples: readonly string[];
  resolve: (input: CandidateInput) => GlobalIntentCandidate | readonly GlobalIntentCandidate[] | null;
}

function candidate(definitionId: string, domain: IntentDomain, intent: GlobalIntent, score: number, positiveEvidence: string[], negativeEvidence: string[] = []): GlobalIntentCandidate {
  const adjustedScore = score - negativeEvidence.length * 12;
  return {
    definitionId,
    domain,
    intent,
    score: adjustedScore,
    positiveEvidence,
    negativeEvidence,
    confidence: intent.type === "unsupported" ? "unsupported" : intent.type === "clarification" ? "clarify" : adjustedScore >= 90 ? "high" : "contextual",
  };
}

function routeForNavigation(target: NavigationTarget): LifeRoute {
  return target.world === "today" ? "calendar" : target.world === "capture" ? "inbox" : target.world === "outcomes" ? "plans" : target.world;
}

const numberDays: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const weekdayIndex: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function shiftedWeek(base: string, offsetWeeks: number, weekStartsOn: 0 | 1): TemporalScope {
  const shifted = dateKeyAfter(base, offsetWeeks * 7);
  return weekScope(shifted, weekStartsOn);
}

function temporalScopeFromText(normalized: string, context: LifeContext): TemporalScope | null {
  const today = dateKeyFromClock(new Date(context.nowMs ?? Date.now()));
  const weekStartsOn = context.weekStartsOn ?? 1;
  const text = normalizeNavigation(normalized).normalizedText
    .replace(/^see (?:the )?week in today$/, "whole week")
    .replace(/^see full day$/, "today")
    .replace(/^(?:what do i have|what is happening|what's happening|what is on|what's on)\s+/, "")
    .replace(/^(?:open|show(?: me)?|take me to|go to|bring up|switch to|jump to|head to|return to)\s+/, "")
    .replace(/^(?:my|the)\s+/, "")
    .replace(/^(?:calendar|schedule|agenda)(?:\s+(?:for|on))?\s+/, "")
    .replace(/^(?:my|the)\s+/, "")
    .trim();
  if (/^(?:today|tonight|my day|day view)$/.test(text)) return { kind: "day", dateKey: today };
  if (/^(?:previous|next) day$/.test(text)) return { kind: "day", dateKey: dateKeyAfter(context.currentTimeScope?.dateKey ?? today, text === "previous day" ? -1 : 1) };
  if (/^(?:tomorrow|tomorrow'?s schedule)(?:\s+(?:morning|afternoon|evening))?$/.test(text)) return { kind: "day", dateKey: dateKeyAfter(today, 1) };
  if (/^(?:what does|what s|what's) this week look like$/.test(text)) return weekScope(today, weekStartsOn);
  if (/^(?:day after tomorrow)$/.test(text)) return { kind: "day", dateKey: dateKeyAfter(today, 2) };
  const daysFrom = text.match(/^(one|two|three|four|five|six|seven|\d+)\s+days?\s+from\s+(?:now|today)$/);
  if (daysFrom) return { kind: "day", dateKey: dateKeyAfter(today, numberDays[daysFrom[1]!] ?? Number(daysFrom[1])) };
  if (/^(?:this |whole |entire |full |my )?week(?:ly calendar|ly view| view)?$/.test(text) || /^(?:this|the) whole week$/.test(text)) return weekScope(today, weekStartsOn);
  if (/^go back (?:one|a|1) week$/.test(text)) return shiftedWeek(context.currentTimeScope?.dateKey ?? today, -1, weekStartsOn);
  if (/^next week$/.test(text)) return shiftedWeek(today, 1, weekStartsOn);
  if (/^(?:previous|last) week$/.test(text)) return shiftedWeek(today, -1, weekStartsOn);
  if (/^this weekend$/.test(text)) return weekendScope(dateKeyAfter(today, -1));
  if (/^next weekend$/.test(text)) return weekendScope(today);
  const weekday = text.match(/^(?:(this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening))?$/);
  if (weekday) return { kind: "day", dateKey: nearestWeekday(today, weekdayIndex[weekday[2]!]!, weekday[1] === "next") };
  return null;
}

function surfaceTemporalIntent(input: CandidateInput): GlobalIntentCandidate | null {
  const explicitCalendarSurface = /\b(?:calendar|schedule|agenda)\b/.test(normalizeNavigation(input.normalized).normalizedText) || /^see (?:the )?week in today$/.test(input.normalized);
  if (!explicitCalendarSurface) return null;
  const scope = temporalScopeFromText(input.normalized, input.context);
  if (!scope) return null;
  return candidate("navigation.calendar-range", "navigation", { type: "navigate-temporal", route: "calendar", scope }, 134, ["explicit-calendar", `temporal-${scope.kind}`, "composed-destination-and-range"]);
}

function navigationCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  // “Today” is a temporal scope selection; framed Calendar navigation such as
  // “Open Today” remains owned by the bounded destination lexicon.
  if (/^(?:today|show(?: me)? today)$/.test(input.normalized)) return null;
  if (input.normalized === "enter the atmosphere"
    && (input.context.route === "atmosphere" || input.context.topic === "atmosphere")) return null;
  if (/^(?:now|open now|show (?:me )?(?:what needs me |the )?now|go to now|take me to now)$/.test(input.normalized)) {
    return candidate("navigation.now", "navigation", { type: "navigate", route: "now" }, 136, ["exact-now-destination"]);
  }
  if (input.normalized === "see full day") {
    return candidate("navigation.today-full-day", "navigation", { type: "navigate", route: "calendar" }, 136, ["speakable-ui-label", "explicit-today-destination"]);
  }
  if (/^(?:sound room|my sound room|open (?:my |the )?sound room)$/.test(input.normalized)) {
    return candidate("navigation.atmosphere-room", "navigation", { type: "navigate", route: "atmosphere" }, 112, ["bounded-sound-room-alias"]);
  }
  if (/^(?:what am i working toward|show what i am working toward)$/.test(input.normalized)) {
    return candidate("navigation.outcomes-query", "navigation", { type: "navigate", route: "plans" }, 112, ["explicit-outcomes-goal-query"]);
  }
  if (/^(?:return|back|go back) home$/.test(input.normalized)) {
    return candidate("navigation.home-return", "navigation", { type: "navigate", route: "home" }, 106, ["exact-home-return"]);
  }
  const parsed = input.navigation;
  if (!parsed) return null;
  if ("status" in parsed) return candidate("navigation.back", "navigation", { type: "navigate", route: "back" }, 104, ["navigation-frame", "history-route"]);
  if (parsed.kind === "clarify-navigation") {
    return candidate("navigation.clarify", "navigation", { type: "clarification", title: parsed.question, detail: parsed.choices.map(({ label }) => label).join(" · ") }, 76, ["bounded-destination-vocabulary"]);
  }
  const route = routeForNavigation(parsed.target);
  const intent: GlobalIntent = parsed.target.world === "people" && parsed.target.view === "commitments"
    ? { type: "navigate", route, target: parsed.target, ...(parsed.recovery === "fuzzy" ? { recovered: true } : {}) }
    : { type: "navigate", route, ...(parsed.recovery === "fuzzy" ? { recovered: true } : {}) };
  const framed = normalizeNavigation(input.transcript).framed;
  // Navigation is a shell-level intent and therefore outranks every data
  // mutation, including an alternative that happens to begin with “Capture”.
  // This score is also used to rank final browser recognition alternatives.
  return candidate("navigation.destination", "navigation", intent, parsed.recovery === "exact" ? 132 : 82, ["bounded-destination", parsed.recovery, ...(framed ? ["navigation-frame"] : [])], parsed.recovery === "fuzzy" ? ["fuzzy-recovery"] : []);
}

function temporalCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  if (/^(?:day view|my day)$/.test(input.normalized)) return null;
  const scope = temporalScopeFromText(input.normalized, input.context);
  if (!scope) return null;
  return candidate("temporal.scope", "temporal", { type: "temporal", scope }, 126, [`temporal-${scope.kind}`, "explicit-temporal-scope"]);
}

function studioDomain(intent: StudioIntent): IntentDomain {
  if (intent.type.startsWith("journal")) return "journal";
  if (intent.type.startsWith("atmosphere")) return "atmosphere";
  if (intent.type.startsWith("memory")) return "memory";
  return "workspace";
}

function studioCandidate(input: CandidateInput, intent: StudioIntent): GlobalIntentCandidate | null {
  const activeStudioSurface = ["journal", "atmosphere", "memories"].includes(input.context.route)
    || ["journal", "atmosphere", "memory"].includes(input.context.topic ?? "");
  if (!activeStudioSurface && input.navigation && !("status" in input.navigation) && input.navigation.kind === "navigate" && input.navigation.recovery === "exact") return null;
  const domain = studioDomain(intent);
  const active = (domain === "journal" && (input.context.route === "journal" || input.context.topic === "journal" || input.context.activeJournalEntryId))
    || (domain === "atmosphere" && (input.context.route === "atmosphere" || input.context.topic === "atmosphere"))
    || (domain === "memory" && (input.context.route === "memories" || input.context.topic === "memory"));
  const explicit = domain === "journal" ? /\b(?:journal|entry|voice|record|bookmark|write|talk|note)\b/.test(input.normalized)
    : domain === "atmosphere" ? /\b(?:atmosphere|sound|rain|tone|music|pulse|texture|sunday evening|room to think|deep focus)\b/.test(input.normalized)
      : domain === "memory" ? /\b(?:memory|photo|bookmark|passage|date)\b/.test(input.normalized) : true;
  const dictationOwnsTurn = input.context.voiceMode === "journal-longform" && Boolean(input.context.activeJournalEntryId);
  const exactWorkspaceControl = intent.type === "workspace" && /^(?:show less|show more|show everything again|go back to what i was doing|return to what i was doing)$/.test(input.normalized);
  const compoundSpecificity = intent.type === "studio-compound" ? 48 : 0;
  const completeMemorySource = (intent.type === "memory-create" || intent.type === "memory-source") && intent.source === "photo-bookmark" ? 12 : 0;
  return candidate(
    `studio.${domain}`,
    domain,
    intent,
    dictationOwnsTurn ? 140 : exactWorkspaceControl ? 128 : 85 + (active ? 30 : 0) + (explicit ? 18 : 0) + compoundSpecificity + completeMemorySource,
    [dictationOwnsTurn ? "journal-dictation-owner" : exactWorkspaceControl ? "exact-workspace-control" : active ? "active-surface" : "global-studio", explicit ? "explicit-domain-cue" : "contextual-phrase", ...(compoundSpecificity ? ["atomic-multi-clause"] : []), ...(completeMemorySource ? ["complete-photo-bookmark-source"] : [])],
  );
}

function outcomeCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  if (/^(?:new outcome|add an? outcome|create an? outcome)$/.test(input.normalized)) {
    return candidate("outcome.incomplete-create", "life", {
      type: "clarification",
      title: "What outcome do you want to make true?",
      detail: "Describe the result. Nothing was created yet.",
    }, 116, ["explicit-outcome", "missing-outcome-title"]);
  }
  const titled = input.transcript.match(/^(?:new|add|create|i want) (?:an? )?(?:new )?outcome(?:(?: (?:called|for|to))|:)?\s+(.+)$/i);
  if (titled?.[1]) {
    const title = titleCase(clean(titled[1]));
    const condition = title.match(/\bbefore\s+(.+)$/i);
    return candidate("outcome.create", "life", { type: "outcome-create", title, ...(condition ? { targetCondition: `Before ${condition[1]}` } : {}) }, 132, ["explicit-outcome", "outcome-title"]);
  }
  return null;
}

function pendingIsFresh(context: LifeContext) {
  return Boolean(context.pendingIntent && context.pendingIntent.expiresAt >= (context.nowMs ?? Date.now()));
}

function commitmentContextCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  const pending = input.context.pendingIntent;
  const resolvedNavigation = Boolean(input.navigation && ("status" in input.navigation || input.navigation.kind === "navigate"));
  const explicitReplacement = Boolean(matchSystem(input.normalized) || resolvedNavigation || /^(?:new|add|create) (?:an? )?outcome\b|^(?:open|show|go|take|bring|switch|move|shift|reschedule|delete|remove|defer|protect|lock|capture|play|start (?:the )?atmosphere)\b/.test(input.normalized));
  if (pending?.type === "commitment-recipient" && pendingIsFresh(input.context) && !explicitReplacement) {
    const raw = input.transcript.trim(), quoted = leadingQuotedValue(raw);
    const name = quoted && /^[.!?]?$/.test(quoted.suffix.trim()) ? quoted.value
      : raw.match(/^(?:(?:with|to)|(?:the name is))?\s*([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*)?)\s*[.!?]?$/iu)?.[1];
    if (name && !genericRecipient(name) && !/^(?:i|it|this|that|yes|no|maybe|never|nothing|send|return|call|write|start|stop|play|pause|make|change|rename|add|new|create|save|remember|cancel|undo|redo)\b/i.test(name)) {
      const { title, direction, status, dueAt } = pending;
      return candidate("commitment.recipient-answer", "commitment", { type: "commitment-create", person: name.replace(/^./, (letter) => letter.toUpperCase()), title, direction, status, ...(dueAt ? { dueAt } : {}) }, 118, ["typed-pending-recipient", "explicit-name-answer"]);
    }
  }
  if (pending?.type === "commitment-create" && pendingIsFresh(input.context) && !explicitReplacement
    && input.context.route === "people" && input.context.peopleView === "commitments") {
    const fragment = input.normalized.replace(/^(?:i (?:will|need to)|to)\s+/, "").trim();
    // A partial commitment is bounded context, not permission to turn the
    // next arbitrary sentence into user data. Continue only with a task-like
    // predicate; navigation, system, and unrelated prose fall through.
    const taskLike = /^(?:send|share|review|deliver|finish|prepare|call|email|reply|confirm|book|return|give|check|sign|complete|update|schedule|write|submit|pay|renew|pick|collect|forward|approve|test|meet)\b/.test(fragment);
    if (taskLike) {
      const due = fragment.match(/\s+(?:by\s+)?(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/)?.[1];
      const title = titleCase(clean(fragment.replace(/\s+(?:by\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/, "")));
      let dueAt: string | undefined;
      if (due) {
        const dueDate = due === "today" ? input.dateKey : due === "tomorrow" ? dateKeyAfter(input.dateKey, 1) : dateKeyForWeekday(input.dateKey, due);
        dueAt = `${dueDate}T17:00:00.000Z`;
      }
      return candidate("commitment.continuation", "commitment", { type: "commitment-create", person: pending.person, title, direction: "i-owe", status: "open", ...(dueAt ? { dueAt } : {}) }, 118, ["typed-pending-intent", "active-commitment-surface"]);
    }
  }
  const activeCommitments = input.context.route === "people" && input.context.peopleView === "commitments";
  if (activeCommitments && /^(?:add|new|create) (?:a )?(?:commitment|promise)$/.test(input.normalized)) {
    return candidate("commitment.incomplete", "commitment", {
      type: "clarification",
      title: "Who is this commitment with, and what is it about?",
      detail: "Say who owes what. Nothing was created yet.",
    }, 116, ["active-commitment-surface", "missing-person-and-content"]);
  }
  const addPerson = input.normalized.match(/^(?:add|new)\s+([a-z][a-z'-]*)$/);
  if (!activeCommitments || !addPerson) return null;
  if (["commitment", "promise", "outcome", "plan", "event", "entry"].includes(addPerson[1]!)) return null;
  const person = titleCase(addPerson[1]!);
  return candidate("commitment.incomplete-create", "commitment", {
    type: "clarification",
    title: `What are you committing to ${person}?`,
    detail: "Say what you owe them and optionally include a due day.",
    continuation: { type: "commitment-create", person },
  }, 114, ["active-commitment-surface", "person-fragment"]);
}

function pendingInsightCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  const pending = input.context.pendingIntent;
  if (pending?.type !== "instinct-act" || !pendingIsFresh(input.context) || matchSystem(input.normalized) || input.navigation) return null;
  const scope = temporalScopeFromText(input.normalized, input.context);
  if (!scope || scope.kind !== "day") return null;
  return candidate("insight.day-continuation", "insight", {
    type: "instinct-act",
    instinctId: pending.instinctId,
    dateKey: scope.dateKey,
  }, 140, ["typed-pending-intent", "explicit-day", "bounded-insight-continuation"]);
}

function insightCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  if (!/^(?:put (?:this|that|it) in motion|act on (?:this|that|it)|(?:do|start) (?:this|that))$/.test(input.normalized)) return null;
  if (input.context.route !== "good-to-know" && input.context.topic !== "recommendation" && !input.context.selectedInsightId) return null;
  if (input.context.currentTimeScope?.kind === "week") {
    return candidate("insight.day-required", "insight", {
      type: "clarification",
      title: "Which day should I use?",
      detail: `Choose a day between ${input.context.currentTimeScope.dateKey} and ${input.context.currentTimeScope.endDateKey ?? input.context.currentTimeScope.dateKey}. Nothing changed.`,
      continuation: { type: "instinct-act", instinctId: input.context.selectedInsightId ?? "clear-focus-window" },
    }, 114, ["speakable-ui-label", "week-scope-needs-day"]);
  }
  return candidate("insight.act", "insight", { type: "instinct-act", ...(input.context.selectedInsightId ? { instinctId: input.context.selectedInsightId } : {}) }, 112, ["speakable-ui-label", input.context.selectedInsightId ? "selected-insight" : "active-insight-surface"]);
}

function legacyDomain(intent: GlobalIntent): IntentDomain {
  if (intent.type === "calendar" || intent.type === "calendar-inspect") return "calendar";
  if (intent.type.startsWith("commitment") || intent.type === "people-query") return "commitment";
  if (intent.type.startsWith("instinct")) return "insight";
  if (intent.type === "unsupported") return "unsupported";
  if (["history", "session", "confirm", "cancel", "pending-choice", "what-changed", "help"].includes(intent.type)) return "system";
  if (intent.type === "navigate" || intent.type === "navigate-plan") return "navigation";
  if (intent.type === "temporal") return "temporal";
  return "life";
}

function calendarCandidate(input: CandidateInput, actionType: CalendarAction["type"]): GlobalIntentCandidate | null {
  if (/^(?:new|add|create|i want|start|begin|make|write) (?:an? )?(?:new )?(?:outcome|journal|memory|commitment|promise|note|entry)\b/.test(input.normalized)) return null;
  // "Rename/delete this entry" with no Calendar noun is never a Calendar
  // event operation — Calendar has no "entry" object type. Without this,
  // Calendar's generic pronoun grounding ("Which Today event do you mean?")
  // could otherwise answer a bare, title-less Journal command.
  if (isJournalRenameMissingTitle(input.normalized) || isJournalDeleteCommand(input.normalized, true)) return null;
  if (attentionFeatureProposals(input.transcript, input.context).some(({ type }) => type === "focus-request")) return null;
  if (input.studioIntents.length && /\b(?:journal|journaling|recording|rhythm|rain|piano|pulse|texture|note)\b/.test(input.normalized)
    && !/\b(?:meeting|event|appointment|calendar)\b/.test(input.normalized)) return null;
  const parsed = input.calendarParse;
  if (parsed.status !== "ready") return null;
  // Explicit object domains disqualify Calendar before scoring. A stale
  // event reference cannot lend destructive authority to a Journal request.
  if (parsed.request.actions.some((action) => "selector" in action && "query" in action.selector
    && /\b(?:journal|entry|outcome|commitment|promise|memory|atmosphere)\b/.test(action.selector.query ?? ""))) return null;
  if (!parsed.request.actions.some(({ type }) => type === actionType)) return null;
  const creation = parsed.request.actions.length === 1 && !parsed.request.constraints.length ? parsed.request.actions[0] : undefined;
  if (creation?.type === "create" && creation.destination.type === "relative" && input.calendarPlan) {
    const anchor = resolveEventReference(input.calendarPlan, creation.destination.anchor);
    if (anchor.status === "missing") {
      const title = creation.literalTitle ? creation.title : creation.title[0]!.toUpperCase() + creation.title.slice(1);
      const timingHint = creationTimingHint(input.transcript);
      return candidate("calendar.create.missing-anchor", "calendar", { type: "clarification",
        title: `Which date and time should I use for ${title}?`, detail: `I could not resolve ${timingHint}. Give a concrete date and time. Nothing changed.`,
        continuation: { type: "calendar-create", title, ...(creation.literalTitle ? { literalTitle: true } : {}), durationMinutes: creation.durationMinutes, timingHint },
      }, 116, ["explicit-calendar-creation", "missing-temporal-anchor"]);
    }
  }
  if (requestNeedsContext(parsed.request) && !hasFreshCalendarContext(input.context)) {
    return candidate(`calendar.${actionType}.context`, "calendar", {
      type: "clarification",
      title: "Which Today event do you mean?",
      detail: "Name its title, time, or use the current event. Nothing changed.",
    }, 96, ["calendar-action", "missing-fresh-reference"]);
  }
  const intent: GlobalIntent = { type: "calendar", request: parsed.request };
  const hasCalendarObject = /\b(?:calendar|event|meeting|appointment|interview|call|work|workout|lunch|dinner|roadmap|deep work|selected event)\b/.test(input.normalized);
  const hasCalendarAction = /^(?:what if|suppose|preview|do not move|i do not want|move|shift|push|reschedule|rebalance|batch|merge|combine|add|take|schedule|book|block|fit|find|protect|lock|fix|unlock|cancel|delete|remove|defer|resize|extend|shorten|reduce|stretch|trim|make|give|let|change|edit|rename|call|name|label|create|put|reopen|complete|finish|start|end)\b/.test(input.normalized)
    || /^(?:i am|i m) done at\b/.test(input.normalized)
    || /\b(?:behind|running late|save (?:the )?(?:day|morning|afternoon|evening))\b/.test(input.normalized);
  const hasTemporal = /\b(?:at|before|after|between|morning|afternoon|evening|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|minutes?|hours?|half an hour|\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty)\b/.test(input.normalized);
  const onCalendarSurface = input.context.route === "calendar" || input.context.route === "today" || input.context.topic === "calendar";
  const freshCalendarReference = hasFreshCalendarContext(input.context);
  // A bare “give me N minutes” is Flow's Focus request. Calendar only owns
  // this wording when the user also names a scheduling object or is already
  // working with a concrete Calendar reference.
  if (/^give me\s+(?:\d+|[a-z -]+)\s+minutes?$/.test(input.normalized)
    && !hasCalendarObject && !onCalendarSurface && !freshCalendarReference) return null;
  const statefulAction = parsed.request.actions.find((action) => action.type === actionType && ["protect", "unprotect", "delete", "defer"].includes(action.type));
  const requiresGroundedTarget = Boolean(statefulAction);
  let targetIsExplicitInLanguage = !requiresGroundedTarget;
  const temporallyGroundedDefer = parsed.request.actions.some(({ type }) => type === "defer")
    && /^(?:move|reschedule|defer)\b/.test(input.normalized) && hasTemporal;
  if (statefulAction && "selector" in statefulAction) {
    const statefulIndex = parsed.request.actions.indexOf(statefulAction);
    const transactionHasPriorTarget = parsed.request.actions.slice(0, statefulIndex).some((action) =>
      "selector" in action || action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom");
    const transactionBindsSelector = !selectorNeedsContext(statefulAction.selector, transactionHasPriorTarget);
    targetIsExplicitInLanguage = transactionBindsSelector;
    const selectedId = [input.context.selected, input.context.lastReferenced, input.context.lastChanged, input.context.lastCreated, ...(input.context.lastTargets ?? [])]
      .find((reference) => reference?.kind === "calendar-event" && (input.context.nowMs ?? Date.now()) - reference.at <= 120_000)?.id;
    if (input.calendarPlan && !transactionHasPriorTarget) {
      const resolution = resolveEventReference(input.calendarPlan, statefulAction.selector, selectedId, undefined, false, statefulAction.type === "delete");
      if (resolution.status !== "resolved") {
        const detail = resolution.status === "clarification" ? resolution.choices.map(({ label }) => label).join(" · ") : resolution.detail;
        return candidate(`calendar.${actionType}.grounding`, "calendar", {
          type: "clarification",
          title: resolution.status === "clarification" ? resolution.question : "Which calendar event do you mean?",
          detail: `${detail} Nothing changed.`,
          ...(resolution.status === "clarification" ? { calendarChoice: { request: parsed.request, clarification: { type: resolution.type, question: resolution.question, selector: resolution.selector, choices: resolution.choices } } } : {}),
        }, 102, ["stateful-calendar-action", "production-target-resolution"], [resolution.status === "missing" ? "target-not-found" : "target-ambiguous"]);
      }
    } else if (!transactionBindsSelector && !freshCalendarReference && !hasCalendarObject && !temporallyGroundedDefer) {
      return candidate(`calendar.${actionType}.grounding`, "calendar", {
        type: "clarification",
        title: "Which Today event do you mean?",
        detail: "Name its exact title or start time. Nothing changed.",
      }, 96, ["stateful-calendar-action"], ["unresolved-calendar-target"]);
    }
  }
  const positives = ["calendar-domain-parser"];
  const negatives: string[] = [];
  let score = 84;
  if (hasCalendarObject) { score += 14; positives.push("explicit-calendar-object"); }
  if (hasTemporal) { score += 8; positives.push("explicit-temporal-evidence"); }
  if (onCalendarSurface) { score += 4; positives.push("active-calendar-surface"); }
  if (freshCalendarReference) { score += 54; positives.push("fresh-calendar-reference"); }
  if (freshCalendarReference && !hasCalendarObject) negatives.push("implicit-event-reference");
  if (!hasCalendarObject && !hasTemporal) {
    if (!hasCalendarAction) negatives.push("no-calendar-object", "no-temporal-evidence");
    else positives.push("explicit-action-with-typed-selector");
    if (!freshCalendarReference && !onCalendarSurface && !hasCalendarAction) score = 42;
  }
  if (!hasCalendarObject && !hasCalendarAction && !freshCalendarReference) {
    score = Math.min(score, 36);
    negatives.push("no-calendar-action-evidence");
  }
  if (requiresGroundedTarget && !targetIsExplicitInLanguage && !temporallyGroundedDefer && !hasCalendarObject && !freshCalendarReference) {
    score = 18;
    negatives.push("ungrounded-calendar-target", "stateful-operation-without-calendar-evidence");
  }
  if (["system", "attention", "commitment", "capture", "plan"].some((source) => {
    return featureProposals(source as ProductionFeature, input)
      .some(({ type }) => !["calendar", "clarification", "unsupported"].includes(type));
  })) {
    score = Math.min(score, 72);
    negatives.push("more-specific-production-domain");
  }
  if ((input.context.route === "journal" || input.context.topic === "journal") && /\b(?:voice|recording|entry|bookmark)\b/.test(input.normalized)) negatives.push("contradicts-active-journal");
  if (input.context.route === "good-to-know" && /\bin motion\b/.test(input.normalized)) negatives.push("contradicts-active-insight");
  if (input.context.route === "people" && input.context.peopleView === "commitments" && /^add\s+[a-z'-]+$/.test(input.normalized)) negatives.push("contradicts-active-commitments");
  return candidate(`calendar.${actionType}`, "calendar", intent, score, [...positives, `calendar-action:${actionType}`], negatives);
}

function explicitCaptureCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  const activeStudioSurface = ["journal", "atmosphere", "memories"].includes(input.context.route)
    || ["journal", "atmosphere", "memory"].includes(input.context.topic ?? "");
  if (activeStudioSurface && input.studioIntents.length && /^save\b/i.test(input.transcript)) return null;
  if (/^(?:(?:capture|save|remember) (?:this|that|it)(?: for later)?)[.!?]*$/i.test(input.transcript)) {
    const hasContentContext = input.context.route === "people" && Boolean(input.context.activeMessageId || input.context.activeVoiceNoteId && input.context.selectedVoiceMarkerId)
      || input.context.route === "journal" && Boolean(input.context.selectedJournalPassage)
      || ["today", "calendar"].includes(input.context.route) && input.context.selected?.kind === "calendar-event";
    return candidate("capture.explicit-create", "life", hasContentContext ? { type: "capture-selected" } : {
      type: "clarification", captureQuestion: true, title: "What should I capture?", detail: "Say the words or select a message. Nothing has been captured.",
    }, 125, ["explicit-capture-verb", hasContentContext ? "contextual-source" : "missing-capture-content"]);
  }
  if (input.context.capturePrompt && !navigationCandidate(input) && !temporalScopeFromText(input.normalized, input.context) && !/^(?:(?:never mind|nevermind|cancel|no|yes|confirm|undo|redo)[.!?]*|(?:open|go to|take me to)\b)/i.test(input.transcript)) return candidate("capture.explicit-create", "life", { type: "capture-answer", title: input.transcript.trim() }, 180, ["pending-literal-capture-content"]);
  const title = parseExplicitCapture(input.transcript);
  if (!title) return null;
  if (activeStudioSurface && input.studioIntents.length) return null;
  return candidate("capture.explicit-create", "life", { type: "capture-create", title }, 120, ["explicit-capture-verb", "captured-content"]);
}

function calendarInspectCandidate(input: CandidateInput): GlobalIntentCandidate | null {
  const selector = inspectCalendarSelector(input.normalized);
  if (!selector) return null;
  return candidate("calendar.inspect", "calendar", { type: "calendar-inspect", selector }, 114, ["explicit-inspection-verb", "calendar-object", "source-time"]);
}

function productionDomainCandidate(definitionId: string, declaredDomain: IntentDomain, intent: GlobalIntent, input: CandidateInput): GlobalIntentCandidate | null {
  if (input.navigation && !("status" in input.navigation) && input.navigation.kind === "navigate" && input.navigation.recovery === "exact") return null;
  const domain = legacyDomain(intent);
  if (intent.type === "unsupported") return candidate("fallback.unsupported", domain, /resolve an action from|identify a calendar action|No calendar action found/i.test(intent.detail)
    ? { ...intent, detail: "Nothing was captured or changed. Name an action or place in Flow, or say “Capture…” explicitly." }
    : intent, 0, ["terminal-fallback"]);
  const negatives: string[] = [];
  const positives = ["production-domain-interpreter"];
  let score = domain === "system" ? 122
    : domain === "navigation" ? 116
      : domain === "temporal" ? 110
        : domain === "commitment" ? 114
          : domain === "calendar" ? 100
            : 110;
  const specificityBoost: Partial<Record<GlobalIntent["type"], number>> = {
    "capture-convert-event": 8,
    "capture-convert-commitment": 8,
    "step-schedule": 8,
    "step-add-schedule": 8,
    "instinct-why": 8,
  };
  score += specificityBoost[intent.type] ?? 0;
  if (definitionId.startsWith("fallback.") && intent.type === "clarification") score = 56;
  if (input.normalized === "pause" && ["journal", "atmosphere", "memories"].includes(input.context.route)) {
    score = 72;
    negatives.push("active-studio-pause-control");
  }
  if (domain === "calendar") {
    const hasCalendarObject = /\b(?:calendar|event|meeting|appointment|interview|call|workout|lunch|dinner|roadmap|deep work|selected event)\b/.test(input.normalized);
    const hasTemporal = /\b(?:at|before|after|between|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.test(input.normalized);
    const onCalendarSurface = input.context.route === "calendar" || input.context.route === "today" || input.context.topic === "calendar";
    const freshCalendarReference = hasFreshCalendarContext(input.context);
    const requiresGroundedTarget = intent.type === "calendar" && intent.request.actions.some(({ type }) => ["protect", "unprotect", "delete", "defer"].includes(type));
    if (!hasCalendarObject && !hasTemporal && !freshCalendarReference && !onCalendarSurface) {
      score = 42;
      negatives.push("no-calendar-object", "no-temporal-evidence");
    }
    if (requiresGroundedTarget && !hasCalendarObject && !freshCalendarReference && !onCalendarSurface) {
      score = 18;
      negatives.push("ungrounded-calendar-target", "stateful-operation-without-calendar-evidence");
    }
    if (freshCalendarReference) {
      score += 54;
      positives.push("fresh-calendar-reference");
    }
    if ((input.context.route === "journal" || input.context.topic === "journal") && /\b(?:voice|recording|entry|bookmark)\b/.test(input.normalized)) negatives.push("contradicts-active-journal");
    if (input.context.route === "good-to-know" && /\bin motion\b/.test(input.normalized)) negatives.push("contradicts-active-insight");
    if (input.context.route === "people" && input.context.peopleView === "commitments" && /^add\s+[a-z'-]+$/.test(input.normalized)) negatives.push("contradicts-active-commitments");
  }
  return candidate(definitionId, declaredDomain === "life" ? domain : declaredDomain, intent, score, positives, negatives);
}

function productionActionDefinitions(prefix: string, domain: IntentDomain, intentTypes: readonly GlobalIntent["type"][], examples: readonly string[]): IntentDefinition[] {
  return intentTypes.map((intentType) => ({
    id: `${prefix}.${intentType}`,
    domain,
    intentTypes: [intentType],
    examples,
    resolve: (input) => featureProposals(prefix as ProductionFeature, input)
      .filter((proposal) => proposal.type === intentType)
      .map((proposal, index) => productionDomainCandidate(`${prefix}.${intentType}${index ? `#${index + 1}` : ""}`, domain, proposal, input))
      .filter((proposal): proposal is GlobalIntentCandidate => Boolean(proposal)),
  }));
}

const studioIntentTypes = [
  "ritual-configure",
  "journal-playback", "journal-attach-photo", "journal-drawing-input", "journal-download-audio", "memory-export", "atmosphere-enable-sound",
  "studio-select", "studio-source-select",
  "journal-delete", "journal-text-edit", "journal-tags", "journal-clear-drawing",
  "studio-compound", "journal-create", "journal-recording", "journal-append", "journal-bookmark", "journal-save", "journal-rename",
  "atmosphere-play", "atmosphere-playback", "atmosphere-adjust", "atmosphere-set", "atmosphere-save", "memory-create", "memory-source",
  "memory-audio-trim", "memory-update", "memory-edit", "memory-composition", "memory-playback", "memory-save", "workspace", "ritual-home",
] as const satisfies readonly GlobalIntent["type"][];

const studioActionDefinitions: IntentDefinition[] = studioIntentTypes.map((intentType) => ({
  id: `studio.${intentType}`,
  domain: intentType.startsWith("journal") ? "journal" : intentType.startsWith("atmosphere") ? "atmosphere" : intentType.startsWith("memory") ? "memory" : "workspace",
  intentTypes: [intentType],
  examples: intentType === "journal-append" ? ["raw journal dictation"] : intentType === "atmosphere-play" ? ["play Sunday evening"] : [intentType.replaceAll("-", " ")],
  resolve: (input) => {
    return input.studioIntents.filter((proposal) => proposal.type === intentType).map((intent, index) => {
      const result = studioCandidate(input, intent);
      return result ? { ...result, definitionId: `studio.${intentType}${index ? `#${index + 1}` : ""}` } : null;
    }).filter((proposal): proposal is GlobalIntentCandidate => Boolean(proposal));
  },
}));

const systemTypes = ["history", "what-changed", "session", "capture-mode", "help", "confirm", "cancel", "pending-choice"] as const satisfies readonly GlobalIntent["type"][];
const captureTypes = ["capture-create", "capture-convert", "capture-convert-event", "capture-convert-commitment", "capture-batch-archive", "capture-edit", "capture-archive", "capture-delete"] as const satisfies readonly GlobalIntent["type"][];
const planTypes = ["navigate-plan", "outcome-create", "plan-rename", "plan-status", "plan-delete", "step-add", "step-set-first", "step-set-next", "step-duration", "step-find-time", "step-delete", "step-add-schedule", "step-rename", "step-complete", "step-reorder", "step-defer", "step-unschedule", "step-schedule", "clarification"] as const satisfies readonly GlobalIntent["type"][];
const commitmentTypes = ["commitment-create", "commitment-find-time", "commitment-schedule", "commitment-complete", "commitment-delete", "commitment-defer", "commitment-link-plan", "commitment-due", "clarification"] as const satisfies readonly GlobalIntent["type"][];
const attentionTypes = ["focus-request", "focus-refine", "focus-stop", "focus-extend", "focus-availability", "outfit-query", "weather-query", "umbrella-query", "daylight-query", "next-query", "query-now", "why-now", "keep-free", "instinct-query", "instinct-why", "instinct-dismiss", "instinct-act", "people-query", "person-query", "clarification"] as const satisfies readonly GlobalIntent["type"][];

const calendarActionTypes = [
  "create", "move", "shift", "resize", "protect", "unprotect", "fit", "recover", "defer", "delete", "update",
  "createBreathingRoom", "split", "merge", "complete", "reopen", "setDayBoundary", "reflow", "commitPreview",
  "cancelPreview", "adjustPreview", "undo", "redo", "reset", "whatChanged", "confirm", "cancel",
] as const satisfies readonly CalendarAction["type"][];

const calendarActionDefinitions: IntentDefinition[] = calendarActionTypes.map((calendarActionType) => ({
  id: `calendar.${calendarActionType}`,
  domain: "calendar",
  intentTypes: ["calendar", "clarification"],
  calendarActionType,
  examples: [`Calendar ${calendarActionType} request`],
  resolve: (input) => calendarCandidate(input, calendarActionType),
}));

/** One auditable registry owns global intent discovery. Every supported intent
 * is registered as its own action definition; the mature domain grammar is a
 * proposal producer and never gets a privileged catch-all candidate. */
export const globalIntentRegistry: readonly IntentDefinition[] = [
  { id: "calendar.participants", domain: "calendar", intentTypes: ["friend-calendar"], examples: ["Move my meeting with Sarah to Friday"], resolve: (input) => input.participantProblem ? candidate("calendar.participants", "calendar", { type: "friend-calendar", request: input.participantProblem.request, recipientQuery: input.participantProblem.query }, 168, ["explicit-participant-reference", "person-clarification-before-event-resolution"]) : null },
  { id: "friends.actions", domain: "life", intentTypes: ["friend-playback", "friend-plan", "friend-query", "friend-memory", "friend-group", "friend-open", "friend-person", "friend-message", "friend-draft", "friend-reply", "friend-voice", "recording-marker", "friend-marker-answer", "friend-plans"], examples: ["Add friend Sarah Miller", "Text Sarah I'll be there at six", "Add See you soon", "Send it"], resolve: (input) => {
    const intent = parseFriendIntent(input.transcript, input.context, input.people, input.groups);
    return intent ? candidate("friends.actions", "life", intent, 164, ["explicit-friends-action", "literal-message-payload"]) : null;
  } },
  { id: "atmosphere.amount-clarification", domain: "atmosphere", intentTypes: ["clarification"], examples: ["More"], resolve: (input) => input.normalized === "more" && (input.context.route === "atmosphere" || input.context.topic === "atmosphere")
    ? candidate("atmosphere.amount-clarification", "atmosphere", { type: "clarification", title: "More of which sound?", detail: "Name a layer and whether its volume or speed should increase." }, 100, ["incomplete-studio-adjustment"]) : null },
  // Journal error recovery: a rename with no new title is a recognizable,
  // incomplete Journal command, not unsupported speech. Ask for the missing
  // piece by voice instead of falling through to a generic failure or a
  // misfired Calendar clarification (see the calendarCandidate guard above).
  { id: "journal.rename-missing-title", domain: "journal", intentTypes: ["clarification"], examples: ["Rename this entry", "Rename my note"], resolve: (input) => isJournalRenameMissingTitle(input.normalized)
    ? candidate("journal.rename-missing-title", "journal", { type: "clarification", title: "What should I rename it to?", detail: "Say the new title. Nothing changed." }, 118, ["incomplete-journal-rename"]) : null },
  { id: "navigation.presentation", domain: "navigation", intentTypes: ["command-surface", "sensory-preference", "voice-retry"], examples: ["Open the command field", "Use reduced motion", "Open sensory settings"], resolve: (input) => {
    const intent = parsePresentationCapability(input.transcript);
    return intent ? candidate("navigation.presentation", "navigation", intent, 158, ["explicit-presentation-control", "no-business-mutation"]) : null;
  } },
  { id: "navigation.entity-view", domain: "navigation", intentTypes: ["entity-view", "editor-close"], examples: ["Edit Boiler receipt capture", "Select the first recommendation", "Cancel editing"], resolve: (input) => {
    const intent = parseEntityView(input.transcript, input.context);
    return intent ? candidate("navigation.entity-view", "navigation", intent, 156, ["explicit-entity-view", "no-business-mutation"]) : null;
  } },
  { id: "commitment.view", domain: "commitment", intentTypes: ["commitment-view"], examples: ["Show completed commitments", "Search commitments for Maya"], resolve: (input) => {
    const intent = parseCommitmentView(input.transcript, input.context);
    return intent ? candidate("commitment.view", "commitment", intent, 154, ["explicit-collection-view", "no-business-mutation"]) : null;
  } },
  { id: "navigation.viewport", domain: "navigation", intentTypes: ["scroll"], examples: ["scroll down", "page up", "go to the top"], resolve: (input) => {
    if (/^move (?:up|down)$/.test(input.normalized) && input.context.activeMemoryId) return null;
    if (input.normalized === "more") {
      const previous = input.context.lastViewportAction;
      return previous && previous.route === input.context.route && (input.context.nowMs ?? Date.now()) - previous.at <= 120_000
        ? candidate("navigation.viewport", "navigation", { type: "scroll", direction: previous.direction, fraction: previous.fraction }, 150, ["fresh-same-viewport-continuation", "non-mutating"]) : null;
    }
    const intent = parseScrollCommand(input.normalized);
    return intent ? candidate("navigation.viewport", "navigation", intent, 150, ["complete-viewport-command", "non-mutating"]) : null;
  } },
  { id: "navigation.calendar-range", domain: "navigation", intentTypes: ["navigate-temporal"], examples: ["open my calendar for the whole week"], resolve: surfaceTemporalIntent },
  { id: "navigation.destination", domain: "navigation", intentTypes: ["navigate"], examples: ["open the capture area", "sound room", "what am I working toward", "go home"], resolve: navigationCandidate },
  { id: "temporal.scope", domain: "temporal", intentTypes: ["temporal"], examples: ["show me two days from today", "show my whole week"], resolve: temporalCandidate },
  ...studioActionDefinitions,
  { id: "outcome.actions", domain: "life", intentTypes: ["outcome-create"], examples: ["new outcome", "add an outcome", "create an outcome for renewing my passport"], resolve: outcomeCandidate },
  { id: "commitment.context", domain: "commitment", intentTypes: ["clarification", "commitment-create"], examples: ["add a commitment", "add Miguel", "send the proposal Friday"], resolve: commitmentContextCandidate },
  { id: "calendar.creation-time", domain: "calendar", intentTypes: ["calendar"], examples: ["Tomorrow at four"], resolve: (input) => {
    const pending = input.context.pendingIntent;
    if (pending?.type !== "calendar-create" || !pendingIsFresh(input.context)) return null;
    const request = calendarCreationTimeAnswer(input.transcript, pending, input.dateKey);
    return request ? candidate("calendar.creation-time", "calendar", { type: "calendar", request }, 138, ["bounded-pending-creation", "complete-date-clock-answer"]) : null;
  } },
  { id: "insight.day-continuation", domain: "insight", intentTypes: ["instinct-act"], examples: ["Friday"], resolve: pendingInsightCandidate },
  { id: "insight.context", domain: "insight", intentTypes: ["instinct-act", "clarification"], examples: ["put this in motion"], resolve: insightCandidate },
  { id: "calendar.inspect", domain: "calendar", intentTypes: ["calendar-inspect"], examples: ["show the meeting at two"], resolve: calendarInspectCandidate },
  ...calendarActionDefinitions,
  { id: "capture.explicit-create", domain: "life", intentTypes: ["capture-create", "capture-selected", "capture-answer"], examples: ["remember to call the embassy", "write down buy oat milk", "capture that"], resolve: explicitCaptureCandidate },
  ...productionActionDefinitions("system", "system", systemTypes, ["undo", "pause listening", "confirm"]),
  ...productionActionDefinitions("capture", "life", captureTypes, ["capture buy milk", "archive this capture"]),
  ...productionActionDefinitions("plan", "life", planTypes, ["the first step is check requirements", "pause this outcome"]),
  ...productionActionDefinitions("commitment", "commitment", commitmentTypes, ["I promised Maya the proposal by Friday", "what am I waiting on"]),
  ...productionActionDefinitions("attention", "life", attentionTypes, ["what fits right now", "do I need an umbrella"]),
  ...productionActionDefinitions("fallback", "life", ["clarification"], ["incomplete supported request"]),
  ...productionActionDefinitions("fallback", "unsupported", ["unsupported"], ["unrelated speech"]),
] as const;

export interface GlobalActionManifestEntry {
  id: string;
  domain: IntentDomain;
  intentType: GlobalIntent["type"];
  calendarActionType?: CalendarAction["type"];
  examples: readonly string[];
}

/** Reviewable action-level contract for tooling, corpus quotas, and the command
 * inspector. Definitions own candidate production; this manifest makes every
 * supported semantic action—including Calendar sub-actions—individually
 * auditable instead of hiding capability behind a domain umbrella. */
export const globalActionManifest: readonly GlobalActionManifestEntry[] = [
  ...globalIntentRegistry.flatMap((definition) => definition.intentTypes.map((intentType) => ({
    id: `${definition.id}.${intentType}`,
    domain: definition.domain,
    intentType,
    ...(definition.calendarActionType ? { calendarActionType: definition.calendarActionType } : {}),
    examples: definition.examples,
  }))),
].filter((entry, index, all) => all.findIndex(({ id }) => id === entry.id) === index);

export interface GlobalIntentResolution {
  intent: GlobalIntent;
  candidates: GlobalIntentCandidate[];
  selected?: GlobalIntentCandidate;
  segment?: JournalSegmentEvidence;
}

function unwrapPoliteTranscript(transcript: string) {
  let value = withoutWakePrefix(transcript);
  if (!/(?:^|\b(?:and|then)\s+)(?:rename|call|name|change .*title|edit .*name|replace .*with|add .*paragraph)/i.test(value)) value = value.replace(/,?\s+please([.!?]*)$/i, "$1");
  value = value.replace(/^(?:(?:please|actually|okay|ok|hey|uh|um|erm|just|hey flow)\b[,\s]*)+/i, "");
  value = value.replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, "");
  value = value.replace(/^i(?:['’]d| would) like to\s+/i, "");
  value = value.replace(/^(?:(?:please|actually|just|quickly|uh|um|erm)\b[,\s]*)+/i, "");
  // Explicit negative destinations constrain a navigation command; they are
  // never free-form content or a second action to execute.
  if (/^(?:open|show|go|take|bring|return)\b/i.test(value)) value = value.replace(/,\s*not\s+(?:a new |the |my )?(?:calendar|capture|outcomes?|plans?|journal|memories|commitments?|home)[.!?]*$/i, "");
  return value.trim();
}

export function resolveGlobalCommand(transcript: string, context: LifeContext, dateKey: string, steps: readonly StepIdentity[] = [], workdayEndMinutes = 17 * 60, calendarPlan?: DayPlan, people: readonly Person[] = [], groups: readonly FriendGroup[] = []): GlobalIntentResolution {
  // Classify once BEFORE persistence, using the SAME global capability
  // registry as command mode. Exactly one destination owns a final segment.
  if (context.voiceMode === "journal-longform" && context.activeJournalEntryId || context.voiceMode === "voice-note-longform" && context.activeVoiceNoteId) {
    const normalized = normalizeTranscript(unwrapPoliteTranscript(transcript));
    const command = resolveGlobalCommand(transcript, { ...context, voiceMode: "command" }, dateKey, steps, workdayEndMinutes, calendarPlan, people, groups);
    const localControl = context.voiceMode === "journal-longform" && command.intent.type !== "recording-marker" ? interpretStudioCommandCandidates(transcript, context)[0] : undefined;
    const resolution = localControl && localControl.type !== "journal-append"
      ? { intent: localControl, selected: candidate(`studio.${localControl.type}`, "journal", localControl, 160, ["explicit-journal-control"]), candidates: command.candidates }
      : command;
    const segment = journalSegmentDecision(normalized, resolution);
    if (segment.classification === "AMBIGUOUS" && resolution.intent.type !== "clarification") return {
      intent: { type: "clarification", title: "What should I change?", detail: "That sounded like a command, so I did not add it to your Journal. Name the entry, sentence, or action." },
      candidates: resolution.candidates, segment,
    };
    if (segment.classification !== "CONTENT") return { ...resolution, segment };
    const intent = context.voiceMode === "voice-note-longform" ? { type: "friend-voice" as const, operation: "append" as const, noteId: context.activeVoiceNoteId, text: transcript.trim() } : { type: "journal-append" as const, text: transcript.trim() };
    const selected = candidate("studio.journal-append", "journal", intent, 160, [segment.reason]);
    return { intent, selected, candidates: [...command.candidates, selected], segment };
  }
  // An explicit message frame owns its body, including corrections and quoted controls.
  const friendFrame = parseFriendIntent(withoutWakePrefix(transcript), context, people, groups);
  const effectiveTranscript = friendFrame || context.capturePrompt ? withoutWakePrefix(transcript).trim() : unwrapPoliteTranscript(correctedTranscript(transcript));
  if (context.pendingMedia && /^(?:(?:the )?(audio|audio playback|playback|player|microphone|microphone recording|recording))[.!?]*$/i.test(effectiveTranscript)) {
    const choiceId = /audio|playback|player/i.test(effectiveTranscript) ? "playback" : "recording";
    return { intent: { type: "pending-choice", choiceId }, candidates: [] };
  }
  if (/^(?:(?:rename|call|name)\s+.+?\s+(?:to|as)|(?:change|edit|set)\s+.+?\s+(?:name|title)\s+to)\s*$/i.test(effectiveTranscript)) return {
    intent: { type: "clarification", title: "What should the new title be?", detail: "Tell me the complete new title. Nothing changed." }, candidates: [],
  };
  if (!friendFrame && isUncommittedGoalStatement(effectiveTranscript)) return {
    intent: { type: "unsupported", title: "Nothing changed", detail: "That sounds like an intention, not an instruction to change an item. Say the action, or explicitly ask to create an Outcome." },
    candidates: [],
  };
  const sequenceParts = effectiveTranscript.split(/\s+(?:and then|then)\s+/i).map((part) => part.trim()).filter(Boolean);
  if (!friendFrame && sequenceParts.length > 1) {
    const resolvedSteps = sequenceParts.map((part) => resolveGlobalCommand(part, context, dateKey, steps, workdayEndMinutes, calendarPlan, people, groups));
    const safeSteps = resolvedSteps.map(({ intent }) => intent).filter((intent): intent is GlobalSequenceStep => ["temporal", "navigate", "navigate-temporal"].includes(intent.type));
    if (safeSteps.length === resolvedSteps.length) {
      const intent: GlobalIntent = { type: "global-sequence", steps: safeSteps };
      const selected = candidate("global.safe-sequence", "navigation", intent, 122, ["ordered-clauses", "non-mutating-sequence"]);
      return { intent, selected, candidates: [selected, ...resolvedSteps.flatMap(({ candidates }) => candidates)] };
    }
  }
  const normalized = normalizeTranscript(effectiveTranscript);
  const navigation = matchNavigationIntent(effectiveTranscript);
  const studioIntents = interpretStudioCommandCandidates(effectiveTranscript, context);
  const exactWorkspaceControl = studioIntents.some((intent) => intent.type === "workspace"
    && /^(?:show less|show more|show everything again|go back to what i was doing|return to what i was doing)$/.test(normalized));
  const exactNavigation = Boolean(!friendFrame && navigation && !/^(?:today|show(?: me)? today|enter the atmosphere)$/.test(normalized)
    && !parseCommitmentView(effectiveTranscript, context)
    && !parseEntityView(effectiveTranscript, context)
    && !parsePresentationCapability(effectiveTranscript)
    && !exactWorkspaceControl
    && ("status" in navigation || navigation.kind === "navigate" && navigation.recovery === "exact"));
  const parsedCalendar = interpretTranscript(effectiveTranscript, dateKey, context.currentTimeScope?.kind === "week" ? context.currentTimeScope.dateKey : undefined);
  const participantBinding = parsedCalendar.status === "ready" ? bindCalendarParticipants(parsedCalendar.request, people) : undefined;
  const input: CandidateInput = {
    people, groups,
    ...(participantBinding && "question" in participantBinding && parsedCalendar.status === "ready" ? { participantProblem: { query: participantBinding.query, request: parsedCalendar.request } } : {}),
    transcript: effectiveTranscript,
    normalized,
    context,
    dateKey,
    steps,
    workdayEndMinutes,
    navigation,
    studioIntents: exactNavigation ? [] : studioIntents,
    calendarParse: (() => {
      const parsed = parsedCalendar;
      return parsed.status === "ready" ? { ...parsed, request: bindRequestDestinations(participantBinding && "request" in participantBinding ? participantBinding.request : parsed.request, dateKey) } : parsed;
    })(),
    calendarPlan,
  };
  const proposedCandidates = globalIntentRegistry.filter((definition) => {
    if (exactNavigation) return definition.id.startsWith("navigation.");
    if (definition.id.startsWith("studio.")) return input.studioIntents.some(({ type }) => definition.intentTypes.includes(type));
    return true;
  }).flatMap((definition) => {
    const resolved = definition.resolve(input);
    return resolved ? Array.isArray(resolved) ? resolved : [resolved] : [];
  });
  // A contextual name answer is only a fallback. It cannot consume a
  // complete independent command, regardless of relative ranking scores.
  const hasIndependentCommand = proposedCandidates.some(({ definitionId, score, intent }) => definitionId !== "commitment.recipient-answer"
    && !definitionId.startsWith("fallback.") && score >= 64 && intent.type !== "unsupported" && intent.type !== "clarification");
  const candidates = proposedCandidates.filter(({ definitionId }) => !hasIndependentCommand || definitionId !== "commitment.recipient-answer")
    .sort((left, right) => right.score - left.score || left.definitionId.localeCompare(right.definitionId));
  const selected = candidates.find(({ score, intent }) => score >= (intent.type === "clarification" ? 52 : 64));
  const runnerUp = candidates.find((item) => item !== selected && item.score >= 64 && item.domain !== selected?.domain);
  if (selected && runnerUp && selected.score - runnerUp.score < 4 && JSON.stringify(selected.intent) !== JSON.stringify(runnerUp.intent)) {
    return {
      intent: { type: "clarification", title: "What would you like Flow to do?", detail: `I heard both ${selected.domain} and ${runnerUp.domain}. Name the place or object.` },
      candidates,
    };
  }
  return { intent: selected?.intent ?? candidates.find(({ intent }) => intent.type === "unsupported")?.intent ?? { type: "unsupported", title: "Nothing changed", detail: "What would you like to change? Nothing was captured." }, candidates, selected };
}

export function interpretGlobalCommand(transcript: string, context: LifeContext, dateKey: string, steps: readonly StepIdentity[] = [], workdayEndMinutes = 17 * 60, calendarPlan?: DayPlan, people: readonly Person[] = [], groups: readonly FriendGroup[] = []): GlobalIntent {
  return resolveGlobalCommand(transcript, context, dateKey, steps, workdayEndMinutes, calendarPlan, people, groups).intent;
}

/** Native-end recovery is limited to exact, non-mutating destinations.
 * Fuzzy destination recovery must never turn a truncated word into authority. */
export function isCompleteNavigationAtNativeEnd(transcript: string): boolean {
  const navigation = matchNavigationIntent(transcript);
  voiceDebug("semantic.navigation", { transcript, navigation });
  return Boolean(navigation && !("status" in navigation) && navigation.kind === "navigate" && navigation.recovery === "exact");
}

/** Browser alternatives are ranked from the same candidate competition used
 * for execution, rather than scoring a result chosen by a waterfall. */
export function rankGlobalTranscript(transcript: string, context: LifeContext, dateKey: string, plan?: DayPlan, _selectedId?: string, steps: readonly StepIdentity[] = [], workdayEndMinutes = 17 * 60, people: readonly Person[] = [], groups: readonly FriendGroup[] = []) {
  const resolution = resolveGlobalCommand(transcript, context, dateKey, steps, workdayEndMinutes, plan, people, groups);
  voiceDebug("interpreter.result", { transcript, route: context.route, intent: resolution.intent, selected: resolution.selected });
  return Math.max(0, resolution.selected?.score ?? 0);
}
