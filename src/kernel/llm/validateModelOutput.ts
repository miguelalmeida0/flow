import type { CapabilityRegistry } from "../registry";
import type { JsonSchema } from "../types";
import type { LifeDocument } from "../../domain/life-model";
import { allCalendarEvents } from "../../domain/life-calendar-world";
import type { ConversationSession } from "../session";
import type { PlanStepInput } from "../planner";
import { extractClockTime, extractRelativeDate, timeToMinutes } from "./temporalExtraction";
import { describeCapabilitiesForModel } from "./capabilityModel";

/**
 * The boundary where the model's JSON stops being trusted and starts being
 * checked against real data. Nothing past this module ever executes a step
 * this file didn't approve. Three separate failure classes exist on
 * purpose, because they mean different things to the caller:
 *   - "rejected": the output itself is malformed/unsafe — try another round
 *     or give up, never execute anything from it.
 *   - a validated ModelTurnOutput whose "plan" steps have been REWRITTEN
 *     (never merely trusted) wherever a deterministic source of truth
 *     exists — see applyTemporalOverrides and the entity-existence checks.
 */

const MAX_TEXT_LENGTH = 2000;
const MAX_CHOICES = 6;
const MAX_PLAN_STEPS = 8;
const ENTITY_ID_FIELDS: Record<string, "event" | "person" | "journal-entry"> = {
  eventId: "event",
  personId: "person",
  subjectPersonId: "person",
  entryId: "journal-entry",
};

export interface ValidationInput {
  raw: string;
  registry: CapabilityRegistry;
  session: ConversationSession;
  document: LifeDocument;
  rawTranscript: string;
  now: Date;
  todayDateKey: string;
}

export type ValidatedTurn =
  | { kind: "answer"; text: string; sources: string[] }
  | { kind: "clarify"; question: string; choices: string[] }
  | { kind: "plan"; steps: PlanStepInput[]; summary: string; conditions: string[] }
  | { kind: "lookup"; capabilityId: string; args: Record<string, unknown> }
  | { kind: "unavailable"; explanation: string }
  | { kind: "rejected"; reason: string };

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (!isString(value)) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function isRefValue(value: unknown): value is { $ref: string } {
  return typeof value === "object" && value !== null && "$ref" in value && typeof (value as { $ref: unknown }).$ref === "string";
}

const REF_KEYS = new Set(["selected", "lastMentioned", "lastCreated", "person"]);

/** Checks one arg value against its declared JsonSchema property. Entity-id
 * fields get an EXTRA check below (entityExists) beyond plain type/range —
 * this function only enforces shape, never existence. */
function valueMatchesSchema(value: unknown, schema: JsonSchema): boolean {
  switch (schema.type) {
    case "string":
      if (!isString(value)) return false;
      if (schema.minLength !== undefined && value.length < schema.minLength) return false;
      if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
      if (schema.enum && !schema.enum.includes(value)) return false;
      return true;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) return false;
      if (schema.minimum !== undefined && value < schema.minimum) return false;
      if (schema.maximum !== undefined && value > schema.maximum) return false;
      return true;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (schema.minimum !== undefined && value < schema.minimum) return false;
      if (schema.maximum !== undefined && value > schema.maximum) return false;
      return true;
    case "boolean":
      return typeof value === "boolean";
    default:
      return true;
  }
}

function entityExists(document: LifeDocument, fieldKind: "event" | "person" | "journal-entry", id: string): boolean {
  switch (fieldKind) {
    case "event":
      return allCalendarEvents(document).some((event) => event.id === id);
    case "person":
      return document.people.some((person) => person.id === id);
    case "journal-entry":
      return document.studio.journalEntries.some((entry) => entry.id === id);
  }
}

interface StepValidationResult {
  ok: boolean;
  args?: Record<string, unknown>;
  reason?: string;
}

/** Validates and sanitizes one step's args against its capability's own
 * argsSchema: unknown fields are dropped (never passed through), every
 * declared field is type/range-checked, every *Id field is either a $ref
 * the kernel's own resolver understands or a real, currently-existing
 * entity id — an id the model invented is rejected outright, not "trusted
 * because it looked like an id". */
function validateStepArgs(schema: JsonSchema, rawArgs: Record<string, unknown>, document: LifeDocument): StepValidationResult {
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);
  const sanitized: Record<string, unknown> = {};

  for (const key of required) {
    if (!(key in rawArgs)) return { ok: false, reason: `missing required field "${key}"` };
  }

  for (const [key, value] of Object.entries(rawArgs)) {
    const propSchema = properties[key];
    if (!propSchema) continue; // Unknown field: silently dropped, never forwarded to the capability.
    if (value === null || value === undefined) continue;

    const fieldKind = ENTITY_ID_FIELDS[key];
    if (fieldKind) {
      if (isRefValue(value)) {
        if (!REF_KEYS.has(value.$ref)) return { ok: false, reason: `"${key}" used an unknown $ref "${value.$ref}"` };
        sanitized[key] = value;
        continue;
      }
      if (!isString(value) || !entityExists(document, fieldKind, value)) {
        return { ok: false, reason: `"${key}" does not refer to a real, currently-existing ${fieldKind}` };
      }
      sanitized[key] = value;
      continue;
    }

    if (!valueMatchesSchema(value, propSchema)) return { ok: false, reason: `"${key}" failed validation against its schema` };
    sanitized[key] = value;
  }

  return { ok: true, args: sanitized };
}

const EXCLUSION_CUES = /\b(leave|except|excluding|don'?t|do not|instead|alone|unchanged|untouched)\b/i;
const CONDITION_STOPWORDS = new Set([
  "the", "and", "but", "to", "of", "in", "on", "at", "for", "with", "my", "this", "that", "it", "its",
  "alone", "leave", "except", "not", "excluding", "dont", "do", "instead", "keep", "unchanged", "untouched", "anything", "else",
]);

function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z']+/g) ?? []).map((w) => w.replace(/'/g, "")).filter((w) => w.length > 2 && !CONDITION_STOPWORDS.has(w));
}

/**
 * Mechanical, deterministic cross-check between the model's OWN stated
 * `conditions` (see promptBuilder's "state your conditions before planning"
 * instruction) and the plan it actually proposed — catches the exact
 * failure class from FINAL REPORT Phase 4/1 (a compound request whose
 * excluded entity gets silently swept into the plan anyway). This only
 * catches a condition the model itself already identified and then
 * contradicted; it is not a general constraint solver, and a condition the
 * model never mentions at all is not covered by this check.
 */
function conditionViolatedByPlan(conditions: string[], steps: PlanStepInput[]): string | null {
  for (const condition of conditions) {
    if (!EXCLUSION_CUES.test(condition)) continue;
    const conditionWords = new Set(significantWords(condition));
    if (conditionWords.size === 0) continue;
    for (const step of steps) {
      const args = step.args as Record<string, unknown>;
      const text = [args.title, args.query].filter((v): v is string => typeof v === "string").join(" ");
      if (!text) continue;
      if (significantWords(text).some((word) => conditionWords.has(word))) return condition;
    }
  }
  return null;
}

/** Deterministically overrides any calendar step's time/date fields from the
 * RAW transcript rather than trusting the model's arithmetic — see
 * temporalExtraction.ts's module doc for why. Returns null (meaning "ask,
 * don't execute") when the transcript's time expression is genuinely
 * ambiguous. */
function applyTemporalOverrides(capabilityId: string, args: Record<string, unknown>, rawTranscript: string, now: Date, todayDateKey: string): { args: Record<string, unknown> } | { ambiguous: true } {
  if (!capabilityId.startsWith("calendar.")) return { args };
  const next = { ...args };

  if ("startMinutes" in args) {
    const extracted = extractClockTime(rawTranscript);
    if (extracted) {
      if (extracted.confidence === "ambiguous") return { ambiguous: true };
      next.startMinutes = timeToMinutes(extracted);
    }
    // No time expression found in the transcript at all: keep the model's
    // own value (e.g. relative moves resolved via a prior lookup).
  }

  if ("dateKey" in args || capabilityId === "calendar.move" || capabilityId === "calendar.create") {
    const dateInfo = extractRelativeDate(rawTranscript, now);
    next.dateKey = dateInfo.dateKey;
  } else if (!("dateKey" in args)) {
    next.dateKey = todayDateKey;
  }

  return { args: next };
}

export function validateModelOutput(input: ValidationInput): ValidatedTurn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.raw);
  } catch {
    return { kind: "rejected", reason: "invalid-json" };
  }
  if (typeof parsed !== "object" || parsed === null) return { kind: "rejected", reason: "not-an-object" };
  const obj = parsed as Record<string, unknown>;
  const kind = obj.kind;

  if (kind === "answer") {
    const text = boundedString(obj.text, MAX_TEXT_LENGTH);
    if (!text) return { kind: "rejected", reason: "answer missing text" };
    const sources = Array.isArray(obj.sources) ? obj.sources.filter(isString).slice(0, MAX_CHOICES) : [];
    return { kind: "answer", text, sources };
  }

  if (kind === "clarify") {
    const question = boundedString(obj.question, MAX_TEXT_LENGTH);
    if (!question) return { kind: "rejected", reason: "clarify missing question" };
    const choices = Array.isArray(obj.choices) ? obj.choices.filter(isString).slice(0, MAX_CHOICES) : [];
    return { kind: "clarify", question, choices };
  }

  if (kind === "unavailable") {
    const explanation = boundedString(obj.explanation, MAX_TEXT_LENGTH);
    if (!explanation) return { kind: "rejected", reason: "unavailable missing explanation" };
    return { kind: "unavailable", explanation };
  }

  const exposed = new Map(describeCapabilitiesForModel(input.registry).map((capability) => [capability.id, capability]));

  if (kind === "lookup") {
    const capabilityId = obj.capabilityId;
    if (!isString(capabilityId)) return { kind: "rejected", reason: "lookup missing capabilityId" };
    const capability = exposed.get(capabilityId);
    if (!capability) return { kind: "rejected", reason: `"${capabilityId}" is not an exposed capability` };
    if (capability.mutates) return { kind: "rejected", reason: `"${capabilityId}" mutates state and cannot be used as a lookup` };
    const rawArgs = typeof obj.args === "object" && obj.args !== null ? (obj.args as Record<string, unknown>) : {};
    const validated = validateStepArgs(capability.argsSchema, rawArgs, input.document);
    if (!validated.ok) return { kind: "rejected", reason: `lookup args invalid: ${validated.reason}` };
    return { kind: "lookup", capabilityId, args: validated.args! };
  }

  if (kind === "plan") {
    const summary = boundedString(obj.summary, MAX_TEXT_LENGTH) ?? "";
    const conditions = Array.isArray(obj.conditions) ? obj.conditions.filter(isString).map((c) => c.trim()).filter(Boolean).slice(0, MAX_CHOICES) : [];
    const rawSteps = obj.steps;
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) return { kind: "rejected", reason: "plan has no steps" };
    if (rawSteps.length > MAX_PLAN_STEPS) return { kind: "rejected", reason: `plan exceeds the ${MAX_PLAN_STEPS}-step limit` };

    const steps: PlanStepInput[] = [];
    for (const rawStep of rawSteps) {
      if (typeof rawStep !== "object" || rawStep === null) return { kind: "rejected", reason: "malformed plan step" };
      const stepObj = rawStep as Record<string, unknown>;
      const capabilityId = stepObj.capabilityId;
      if (!isString(capabilityId)) return { kind: "rejected", reason: "plan step missing capabilityId" };
      const capability = exposed.get(capabilityId);
      if (!capability) return { kind: "rejected", reason: `"${capabilityId}" is not an exposed capability — invented capability id` };
      const rawArgs = typeof stepObj.args === "object" && stepObj.args !== null ? (stepObj.args as Record<string, unknown>) : {};
      const validated = validateStepArgs(capability.argsSchema, rawArgs, input.document);
      if (!validated.ok) return { kind: "rejected", reason: `plan step "${capabilityId}" args invalid: ${validated.reason}` };

      const overridden = applyTemporalOverrides(capabilityId, validated.args!, input.rawTranscript, input.now, input.todayDateKey);
      if ("ambiguous" in overridden) {
        return { kind: "clarify", question: "What time did you mean — could you say it with am/pm, like \"8pm\"?", choices: [] };
      }
      steps.push({ capabilityId, args: overridden.args, utterance: input.rawTranscript });
    }
    const violated = conditionViolatedByPlan(conditions, steps);
    if (violated) return { kind: "rejected", reason: `plan violates its own stated condition: "${violated}"` };
    return { kind: "plan", steps, summary, conditions };
  }

  return { kind: "rejected", reason: `unknown or missing kind: ${String(kind)}` };
}
