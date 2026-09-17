import type { LifeContext } from "../../domain/life-model";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import { annotatedLiteralValue, leadingQuotedValue, literalAssignment } from "../../shared/command/literalValue";
import { normalizeTranscript } from "../day-planner/interpretation/normalize";
import { parseDurationExpression } from "../day-planner/interpretation/temporal";

/** Complete role frames for existing Outcome operations. Values retain their
 * raw spelling, while explicit subjects bind the following pronoun locally. */
export function outcomeRoleFrame(source: string, context: LifeContext): GlobalIntent | null {
  const raw = source.trim(), text = normalizeTranscript(raw).replace(/[.!?]$/, "").trim();
  const scoped = context.route === "plans" || context.topic === "outcome" || Boolean(context.activePlanId);
  const assignment = literalAssignment(raw);
  if (assignment && /^(?:this|that|the current) (?:plan|outcome)$/i.test(assignment.subject)) return { type: "plan-rename", title: assignment.value };
  if (/^bring (?:this|that|the current) (?:plan|outcome) back into progress$/.test(text)) return { type: "plan-status", status: "active" };
  const add = raw.match(/^add (?:a |an |the )?(?:next )?step (?:saying|called)\s+([\s\S]+)$/i)
    ?? (scoped ? raw.match(/^the next thing to do is\s+([\s\S]+)$/i) : null);
  if (add) { const title = annotatedLiteralValue(add[1]!); if (title !== null) return { type: "step-add", title }; }
  const pause = text.match(/^pause work on (.+?),? but leave its steps intact$/)
    ?? text.match(/^(.+?) should wait; set that (?:plan|outcome) to paused$/);
  if (pause) return { type: "plan-status", query: pause[1]!, status: "paused" };
  const reorder = text.match(/^in (.+?), (.+?) belongs ahead of (.+)$/);
  if (reorder) return { type: "step-reorder", planQuery: reorder[1]!, query: reorder[2]!, beforeQuery: reorder[3]! };
  const estimate = text.match(/^for (.+?), change the estimate to (.+)$/)
    ?? text.match(/^change only the estimate for (.+?) to (.+)$/);
  if (estimate) {
    const minutes = parseDurationExpression(estimate[2]!);
    if (minutes !== null) return { type: "step-duration", query: estimate[1]!, minutes };
  }
  const wording = raw.match(/^the (.+?) step is really ([\s\S]+)$/i);
  if (wording) {
    const value = leadingQuotedValue(wording[2]!);
    if (value && /^;\s*change the wording[.!?]?$/i.test(value.suffix)) return { type: "step-rename", query: wording[1]!, title: value.value };
  }
  const done = text.match(/^i(?: have|'ve) finished (.+?); tick that step off$/);
  if (done) return { type: "step-complete", query: done[1]! };
  const next = text.match(/^do not schedule anything yet; make (.+?) my next step$/)
    ?? text.match(/^the next step is (.+?), not a new event called (.+)$/);
  if (next) return { type: "step-set-next", query: next[1]! };
  const resume = text.match(/^bring (.+?) back into active work, not (.+)$/);
  if (resume && scoped) return { type: "plan-status", query: resume[1]!, status: "active", excludedQuery: resume[2]! };
  const preview = text.match(/^i want to remove (.+?), but ask me before doing it$/);
  if (preview && scoped) return { type: "plan-delete", query: preview[1]! };
  const rename = raw.match(/^keep (.+?) (active|paused), but rename it ([\s\S]+)$/i);
  if (rename && scoped) {
    const title = annotatedLiteralValue(rename[3]!);
    if (title !== null) return { type: "plan-rename", query: rename[1]!, title, requiredStatus: rename[2]!.toLowerCase() as "active" | "paused" };
  }
  return null;
}
