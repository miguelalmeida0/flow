import type { CalendarAction, CalendarConstraint, DateTarget } from "../model";
import { cleanFilterQuery, cleanTitle } from "./references";
import { parseClockExpression, parseDateExpression, parseDurationExpression } from "./temporal";
import {
  colorIn, colorPattern, colors, mergeAction, parseAbsolute,
  propertyPatch, propertySubject, roomAction, selectorFor, splitAction,
} from "./tideLanguagePrimitives";
import { contextualGeometry } from "./contextualGeometry";
import { numberToken } from "./numbers";

export type TideClauseResult = { actions: CalendarAction[]; constraints: CalendarConstraint[] } | { error: string };

export function parseTideClause(clause: string, today: string): TideClauseResult | null {
  const geometry = contextualGeometry(clause);
  if (geometry) return "error" in geometry ? geometry : { actions: geometry, constraints: [] };
  const immobilize = clause.match(/^never move\s+(.+)$/) ?? clause.match(/^leave\s+(.+?)\s+where it is$/)
    ?? clause.match(/^keep\s+(.+?)\s+exactly where it is(?: when you rearrange the rest)?$/);
  const mobilize = clause.match(/^((?!(?:push|move|shift|recover)\b).+?)\s+can move(?: now)?$/) ?? clause.match(/^allow\s+(.+?)\s+to move$/);
  if (immobilize || mobilize) {
    const selector = selectorFor((immobilize ?? mobilize)?.[1] ?? "");
    return selector ? { actions: [{ type: immobilize ? "protect" : "unprotect", selector }], constraints: [] } : { error: "Which event should I change?" };
  }
  const release = clause.match(/^release\s+(.+?)'s protection$/);
  if (release) {
    const selector = selectorFor(release[1]!);
    return selector ? { actions: [{ type: "unprotect", selector }], constraints: [] } : null;
  }
  const total = clause.match(new RegExp(`^give\\s+(.+?)\\s+(${numberToken}\\s+(?:minutes?|hours?))\\s+in total,\\s*starting where it already starts$`));
  if (total) {
    const selector = selectorFor(total[1]!), minutes = parseDurationExpression(total[2]!);
    return selector && minutes ? { actions: [{ type: "resize", selector, mode: "set", minutes }], constraints: [{ type: "preserve", selector, fields: ["start"] }] } : { error: "Which event and total duration should I use?" };
  }
  const treatment = clause.match(/^treat\s+(.+?)\s+as\s+(important|critical)$/);
  const directProperty = treatment ? [treatment[0], treatment[1], undefined, treatment[2]] : clause.match(/^(?:flag\s+(.+?)\s+(?:as\s+)?|(.+?)\s+is\s+)(important|critical)$/);
  if (directProperty) {
    const selector = selectorFor(directProperty[1] ?? directProperty[2] ?? "");
    return selector ? { actions: [{ type: "update", selector, patch: { importance: directProperty[3] as "important" | "critical" } }], constraints: [] } : null;
  }
  const relativeShift = clause.match(/^(?:shift|move|push)\s+(.+?)\s+(later|earlier) by\s+(.+?)(?:,?\s+not to\s+(.+))?$/);
  if (relativeShift) {
    const selector = selectorFor(relativeShift[1]!), minutes = parseDurationExpression(relativeShift[3]!);
    const excluded = relativeShift[4] ? parseClockExpression(relativeShift[4]) : undefined;
    if (!selector || !minutes || (excluded && excluded.status !== "found")) return { error: "Which event, shift amount and excluded time do you mean?" };
    return { actions: [{ type: "shift", selector, deltaMinutes: relativeShift[2] === "earlier" ? -minutes : minutes }], constraints: excluded?.status === "found" ? [{ type: "avoidTime", selector, minutes: excluded.minutes }] : [] };
  }
  const contextualLabel = clause.match(/^add\s+(.+?)\s+label$/) ?? clause.match(/^tag\s+(this|that|it)\s+(.+)$/);
  if (contextualLabel) {
    const tagging = clause.startsWith("tag ");
    const selector = selectorFor(tagging ? contextualLabel[1]! : "it");
    const label = tagging ? contextualLabel[2]! : contextualLabel[1]!;
    return selector ? { actions: [{ type: "update", selector, patch: { addLabels: [label] } }], constraints: [] } : null;
  }
  if (/^(?:do it|apply the preview)$/.test(clause)) return { actions: [{ type: "commitPreview" }], constraints: [] };
  if (/^(?:cancel|discard) (?:that |the )?preview$/.test(clause)) return { actions: [{ type: "cancelPreview" }], constraints: [] };
  if (/^try\s+.+?(?:instead)?$/.test(clause)) {
    const destination = parseAbsolute(clause.replace(/^try\s+/, ""), today);
    return destination ? { actions: [{ type: "adjustPreview", destination }], constraints: [] } : { error: "Which time should I preview instead?" };
  }
  if (/^make (?:that|this)(?: one)?\s+.+\s+instead$/.test(clause)) {
    const durationMinutes = parseDurationExpression(clause);
    return durationMinutes
      ? { actions: [{ type: "adjustPreview", durationMinutes }], constraints: [] }
      : { error: "How long should I make the previewed event?" };
  }

  const invertedDefer = clause.match(/^(.+?)\s+(?:move|go)\s+(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(morning|afternoon))?$/);
  const sendDefer = clause.match(/^send\s+(.+?)\s+(?:to\s+)?(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(morning|afternoon))?$/);
  const deferMatch = invertedDefer ?? sendDefer;
  if (deferMatch) {
    const selector = selectorFor(deferMatch[1] ?? "");
    const date = parseDateExpression(deferMatch[2] ?? "", today);
    const part = deferMatch[3] as "morning" | "afternoon" | undefined;
    if (selector && date) return { actions: [{ type: "defer", selector, date, ...(part ? { part } : {}) }], constraints: [] };
  }

  const boundary = clause.match(/^(?:i am done|i'm done|finish|end my day|stop)\s+(?:at|by)\s+(.+?)(?:\s+today)?$/);
  if (boundary) {
    const clock = parseClockExpression(boundary[1] ?? "");
    return clock.status === "found"
      ? { actions: [{ type: "setDayBoundary", endMinutes: clock.minutes }, { type: "reflow", reason: "boundary" }], constraints: [] }
      : { error: "What time should the day end?" };
  }

  const split = splitAction(clause);
  if (split) return { actions: [split], constraints: [] };
  const merge = mergeAction(clause);
  if (merge) return { actions: [merge], constraints: [] };

  if (/^start\b/.test(clause) && clause !== "start over") {
    const subject = clause.replace(/^start\s+/, "").trim();
    const selector = subject ? selectorFor(subject) : { type: "position" as const, position: "current" as const };
    return selector ? { actions: [{ type: "update", selector, patch: { status: "active" } }], constraints: [] } : null;
  }

  if (/^(?:done|finished|finish|i (?:am )?(?:done|finished)|mark .* done|complete)\b/.test(clause)) {
    const explicitAt = clause.match(/\b(?:done|finished|finish)\s+at\s+(.+)$/);
    const clock = explicitAt ? parseClockExpression(explicitAt[1] ?? "") : { status: "missing" as const };
    const earlyByMinutes = /\bearly\b/.test(clause) ? parseDurationExpression(clause) ?? undefined : undefined;
    let subject = clause
      .replace(/^(?:done|finished|finish|i (?:am )?(?:done|finished)|mark|complete)\s*/, "")
      .replace(/\s+done$/, "")
      .replace(/\b(?:\d+|[a-z-]+)\s+minutes?\s+early\b/, "")
      .replace(/\bearly\b/, "")
      .replace(/\bat\s+.+$/, "")
      .trim();
    if (/^(?:this|that)$/.test(subject)) subject += " one";
    const selector = subject ? selectorFor(subject) : { type: "position" as const, position: "current" as const };
    return selector ? { actions: [{ type: "complete", selector, ...(clock.status === "found" ? { atMinutes: clock.minutes } : {}), ...(earlyByMinutes ? { earlyByMinutes } : {}) }, { type: "reflow", reason: "early-completion" }], constraints: [] } : null;
  }
  if (/^reopen\b/.test(clause)) {
    const selector = selectorFor(clause.replace(/^reopen\s+/, ""));
    return selector ? { actions: [{ type: "reopen", selector }], constraints: [] } : null;
  }

  const confirmEvent = clause.match(/^confirm\s+(.+)$/) ?? clause.match(/^mark\s+(.+?)\s+(?:as\s+)?confirmed$/);
  if (confirmEvent) {
    const selector = selectorFor(confirmEvent[1] ?? "");
    return selector ? { actions: [{ type: "update", selector, patch: { status: "confirmed" } }], constraints: [] } : { error: "Which event should be confirmed?" };
  }

  const needMore = clause.match(/^(?:i\s+)?need\s+(?:another|more)\s+(.+?)\s+on\s+(.+)$/);
  if (needMore) {
    const minutes = parseDurationExpression(needMore[1] ?? "");
    const selector = selectorFor(needMore[2] ?? "");
    return minutes && selector
      ? { actions: [{ type: "resize", selector, mode: "add", minutes }, { type: "reflow", reason: "make-room" }], constraints: [] }
      : { error: "Which event needs more time, and how much?" };
  }

  const room = roomAction(clause, today);
  if (room) return { actions: [room, { type: "reflow", reason: "make-room" }], constraints: [] };

  const rename = clause.match(/^rename\s+(.+?)\s+to\s+(.+)$/)
    ?? clause.match(/^call\s+(.+?)\s+(?:to|as)\s+(.+)$/)
    ?? clause.match(/^call\s+((?:the\s+)?(?:current|next|previous|last)\s+(?:event|meeting|appointment|task|block))\s+(.+)$/);
  if (rename) {
    const selector = selectorFor(rename[1] ?? "");
    const title = cleanTitle(rename[2] ?? "");
    return selector && title ? { actions: [{ type: "update", selector, patch: { title } }], constraints: [] } : { error: "I need both the event and its new name." };
  }

  if (/^label\b/.test(clause)) {
    const body = clause.replace(/^label\s+/, "");
    const connected = body.match(/^(.+?)\s+(?:as|with)\s+(.+)$/);
    const direct = connected ?? body.match(/^(.+)\s+([a-z0-9-]+)$/);
    if (direct) {
      const selector = selectorFor(direct[1] ?? "");
      const labels = (direct[2] ?? "").split(/\s+and\s+/).map(cleanTitle).filter(Boolean);
      if (selector && labels.length) return { actions: [{ type: "update", selector, patch: { addLabels: labels } }], constraints: [] };
    }
  }
  const addLabel = clause.match(/^add\s+(.+?)\s+labels?\s+to\s+(.+)$/);
  if (addLabel && /^add\b/.test(clause)) {
    const labels = (addLabel[1] ?? "").split(/\s+and\s+/).map(cleanTitle).filter(Boolean);
    const selector = selectorFor(addLabel[2] ?? "");
    if (selector && labels.length) return { actions: [{ type: "update", selector, patch: { addLabels: labels } }], constraints: [] };
  }
  const removeLabel = clause.match(/^remove\s+(.+?)\s+label\s+from\s+(.+)$/);
  if (removeLabel) {
    const selector = selectorFor(removeLabel[2] ?? "");
    return selector ? { actions: [{ type: "update", selector, patch: { removeLabels: [cleanTitle(removeLabel[1] ?? "")] } }], constraints: [] } : null;
  }
  const removeSelectedLabel = clause.match(/^remove\s+(?:the\s+)?(.+?)\s+label$/);
  if (removeSelectedLabel) {
    return {
      actions: [{ type: "update", selector: { type: "selected" }, patch: { removeLabels: [cleanTitle(removeSelectedLabel[1] ?? "")] } }],
      constraints: [],
    };
  }

  const patch = propertyPatch(clause);
  const colorBatch = clause.match(new RegExp(`^(?:make|paint|color|change)\\s+(?:all|every)\\s+(${colorPattern})\\s+(.+?)\\s+(?:to\\s+)?(${colorPattern})$`));
  if (colorBatch) {
    const sourceColor = colorIn(colorBatch[1] ?? "");
    const destinationColor = colorIn(colorBatch[3] ?? "");
    const query = cleanFilterQuery(colorBatch[2] ?? "");
    if (sourceColor && destinationColor) return {
      actions: [{ type: "update", selector: { type: "filter", cardinality: "many", color: sourceColor, ...(query ? { query } : {}) }, patch: { color: destinationColor } }],
      constraints: [],
    };
  }
  if (Object.keys(patch).length && /^(?:make|mark|set|paint|color|change|anchor|let)\b/.test(clause)) {
    const subject = /^(?:anchor)\s+/.test(clause)
      ? clause.replace(/^anchor\s+/, "")
      : /^let\s+/.test(clause)
        ? clause.replace(/^let\s+/, "").replace(/\s+flow$/, "")
        : propertySubject(clause);
    const selector = selectorFor(subject);
    if (!selector) return { error: "Which event should I change?" };
    const actions: CalendarAction[] = [{ type: "update", selector, patch }];
    if (/\bflexible(?: again)?\b/.test(clause)) actions.unshift({ type: "unprotect", selector });
    return { actions, constraints: [] };
  }

  if (/^(?:move|push)\s+(?:anything|everything|all)\s+(?:that is\s+)?flexible\s+out of the way$/.test(clause)
    || /^(?:reflow|rebalance)\b/.test(clause)) {
    return { actions: [{ type: "reflow", reason: "user" }], constraints: [] };
  }

  if (/^clear\b/.test(clause)) {
    const keepMatch = clause.match(/\b(?:without moving|do not move|don't move)\s+(.+)$/);
    const keep = keepMatch ? selectorFor(keepMatch[1] ?? "") : null;
    const body = keepMatch ? clause.slice(0, keepMatch.index).trim() : clause;
    const between = body.match(/^clear\s+(?:(?:between|from)\s+)?(.+?)\s+(?:and|to)\s+(.+)$/);
    if (between) {
      const start = parseClockExpression(between[1] ?? "");
      const end = parseClockExpression(between[2] ?? "");
      if (start.status === "found" && end.status === "found" && end.minutes > start.minutes) {
        return {
          actions: [{ type: "createBreathingRoom", durationMinutes: end.minutes - start.minutes, destination: { type: "absolute", minutes: start.minutes }, label: "Clear time", protected: true }, { type: "reflow", reason: "make-room" }],
          constraints: keep ? [{ type: "keep", selector: keep }] : [],
        };
      }
    }
    if (/^clear\s+(?:(?:my|the)\s+)?afternoon$/.test(body)) {
      return {
        actions: [{ type: "createBreathingRoom", durationMinutes: 5 * 60, destination: { type: "absolute", minutes: 12 * 60 }, label: "Clear afternoon", protected: true }, { type: "reflow", reason: "make-room" }],
        constraints: keep ? [{ type: "keep", selector: keep }] : [],
      };
    }
  }

  return null;
}

export function previewMode(normalized: string) {
  const match = normalized.match(/^(?:what if|suppose|preview)\s+(?:i\s+)?(.+)$/);
  const body = (match?.[1] ?? "")
    .replace(/^moving\b/, "move")
    .replace(/^adding\b/, "add")
    .replace(/^splitting\b/, "split");
  return match ? { body, mode: "preview" as const } : { body: normalized, mode: "commit" as const };
}

export function destinationDate(clause: string, today: string): DateTarget | undefined {
  return parseDateExpression(clause, today);
}

export { colors };
