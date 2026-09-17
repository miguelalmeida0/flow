import { executeRequest } from "../features/day-planner/planner";
import { appendJournalProse } from "./journalProse";
import type { CalendarRequest, ClarificationRequest, EventSelector } from "../features/day-planner/model";
import type { LifeAction } from "./life-actions";
import { validateLifeDocument } from "./life-invariants";
import type { LifeDocument } from "./life-model";
import { allCalendarEvents, allCalendarPlans, normalizeCalendarWorld, projectCalendarDate } from "./life-calendar-world";
import { preserveNoopEntityMetadata } from "./noopMetadata";
import { withEventDefaults } from "../features/day-planner/eventDefaults";
import { applyFriendsAction } from "./friends-transaction";
import type { FriendsAction } from "./friends-actions";

export type LifeTransactionResult =
  | { status: "success"; document: LifeDocument; summary: string }
  | { status: "clarification" | "confirmation" | "conflict"; title: string; detail: string; calendarRequest?: CalendarRequest; authorizationKey?: string; confirmLabel?: string; clarification?: ClarificationRequest };

export function cloneLifeDocument(document: LifeDocument): LifeDocument {
  return structuredClone(document);
}

function selectorUsesContext(selector: EventSelector): boolean {
  if (selector.type === "selected" || selector.type === "anaphor") return true;
  if (selector.type === "multi") return selector.selectors.some(selectorUsesContext);
  if (selector.type === "relativeEvent") return selectorUsesContext(selector.anchor);
  return false;
}

function requestUsesSelected(request: CalendarRequest) {
  return request.constraints.some(({ selector }) => selectorUsesContext(selector))
    || request.actions.some((action) => ("selector" in action && selectorUsesContext(action.selector))
      || ((action.type === "create" || action.type === "fit" || action.type === "createBreathingRoom" || action.type === "move")
        && action.destination.type === "relative" && selectorUsesContext(action.destination.anchor)));
}

function removeEventsFromWorld(draft: LifeDocument, eventIds: Set<string>) {
  const clean = (plan: LifeDocument["calendar"]) => ({
    ...plan,
    events: plan.events.filter(({ id }) => !eventIds.has(id)),
    deferred: plan.deferred.filter(({ id }) => !eventIds.has(id)),
    breathingRooms: (plan.breathingRooms ?? []).filter(({ id, linkedEventId }) => !eventIds.has(id) && (!linkedEventId || !eventIds.has(linkedEventId))),
  });
  draft.calendar = clean(draft.calendar);
  draft.calendars = Object.fromEntries(Object.entries(draft.calendars).map(([dateKey, plan]) => [dateKey, clean(plan)]));
}

/** Give the mature single-day scheduler collision awareness across the world
 * without moving multi-day ownership into it. Other dates remain deferred
 * inputs during the draft and are repartitioned after validation. */
function withWorldDeferred(document: LifeDocument) {
  const active = document.calendar;
  const activeIds = new Set(active.events.map(({ id }) => id));
  const deferred = [
    ...active.deferred,
    ...Object.values(document.calendars)
      .filter(({ dateKey }) => dateKey !== active.dateKey)
      .flatMap((plan) => [...plan.events, ...plan.deferred]),
  ].filter((event, index, values) => !activeIds.has(event.id) && values.findIndex(({ id }) => id === event.id) === index);
  return { ...active, deferred };
}

function applyAction(draft: LifeDocument, action: LifeAction, now: string): LifeTransactionResult | null {
  if (action.type.startsWith("friend.") || action.type.startsWith("voice-note.") || action.type.startsWith("recording.") || action.type === "person.create" || action.type === "person.update") {
    const error = applyFriendsAction(draft, action as FriendsAction, now);
    return error ? { status: "conflict", title: "Nothing changed", detail: error } : null;
  }
  if (action.type === "capture.create") draft.captures.push(action.capture);
  if (action.type === "capture.update") draft.captures = draft.captures.map((item) => item.id === action.captureId ? { ...item, title: action.title, updatedAt: now } : item);
  if (action.type === "capture.archive") draft.captures = draft.captures.map((item) => item.id === action.captureId ? { ...item, status: "archived", updatedAt: now } : item);
  if (action.type === "capture.delete") draft.captures = draft.captures.filter(({ id }) => id !== action.captureId);
  if (action.type === "capture.resolve") draft.captures = draft.captures.map((item) => item.id === action.captureId ? { ...item, status: "resolved", updatedAt: now } : item);
  if (action.type === "plan.create") draft.plans.push(action.plan);
  if (action.type === "plan.update") draft.plans = draft.plans.map((item) => item.id === action.planId ? { ...item, ...action.patch, updatedAt: now } : item);
  if (action.type === "plan.delete") {
    const stepIds = new Set(draft.steps.filter(({ planId }) => planId === action.planId).map(({ id }) => id));
    const eventIds = new Set(draft.links.filter((link) => link.type === "step-scheduled-as-event" && stepIds.has(link.fromId)).map(({ toId }) => toId));
    draft.plans = draft.plans.filter(({ id }) => id !== action.planId);
    draft.steps = draft.steps.filter(({ id }) => !stepIds.has(id));
    removeEventsFromWorld(draft, eventIds);
    draft.links = draft.links.filter((link) => link.fromId !== action.planId && link.toId !== action.planId && !stepIds.has(link.fromId) && !stepIds.has(link.toId) && !eventIds.has(link.toId));
    draft.captures = draft.captures.map((capture) => draft.links.some((link) => ["capture-origin-of-plan", "capture-origin-of-event", "capture-origin-of-commitment"].includes(link.type) && link.fromId === capture.id)
      ? capture : capture.status === "resolved" ? { ...capture, status: "unresolved", updatedAt: now } : capture);
  }
  if (action.type === "plan.step.add") {
    draft.steps.push(action.step);
    draft.plans = draft.plans.map((plan) => plan.id === action.step.planId ? { ...plan, stepIds: [...plan.stepIds, action.step.id], updatedAt: now } : plan);
  }
  if (action.type === "plan.step.update") draft.steps = draft.steps.map((item) => item.id === action.stepId ? { ...item, ...action.patch, updatedAt: now } : item);
  if (action.type === "plan.step.delete") {
    const eventIds = new Set(draft.links.filter((link) => link.type === "step-scheduled-as-event" && link.fromId === action.stepId).map(({ toId }) => toId));
    draft.steps = draft.steps.filter(({ id }) => id !== action.stepId);
    draft.plans = draft.plans.map((plan) => plan.stepIds.includes(action.stepId)
      ? { ...plan, stepIds: plan.stepIds.filter((id) => id !== action.stepId), ...(plan.nextStepId === action.stepId ? { nextStepId: undefined } : {}), updatedAt: now }
      : plan);
    removeEventsFromWorld(draft, eventIds);
    draft.links = draft.links.filter((link) => link.fromId !== action.stepId && link.toId !== action.stepId && !eventIds.has(link.toId));
  }
  if (action.type === "plan.step.reorder") draft.plans = draft.plans.map((plan) => {
    if (plan.id !== action.planId) return plan;
    const without = plan.stepIds.filter((id) => id !== action.stepId);
    const index = action.beforeStepId ? without.indexOf(action.beforeStepId) : -1;
    without.splice(index < 0 ? without.length : index, 0, action.stepId);
    return { ...plan, stepIds: without, updatedAt: now };
  });
  if (action.type === "person.ensure" && !draft.people.some((person) => person.name.trim().toLowerCase() === action.person.name.trim().toLowerCase())) draft.people.push(action.person);
  if (action.type === "commitment.create") draft.commitments.push(action.commitment);
  if (action.type === "commitment.update") draft.commitments = draft.commitments.map((item) => item.id === action.commitmentId ? { ...item, ...action.patch, updatedAt: now } : item);
  if (action.type === "commitment.delete") {
    const captureIds = new Set(draft.links.filter((link) => link.type === "capture-origin-of-commitment" && link.toId === action.commitmentId).map(({ fromId }) => fromId));
    draft.commitments = draft.commitments.filter(({ id }) => id !== action.commitmentId);
    draft.links = draft.links.filter((link) => link.fromId !== action.commitmentId && link.toId !== action.commitmentId);
    draft.captures = draft.captures.map((capture) => captureIds.has(capture.id) ? { ...capture, status: "unresolved", updatedAt: now } : capture);
  }
  if (action.type === "commitment.schedule") {
    const commitment = draft.commitments.find(({ id }) => id === action.commitmentId);
    if (!commitment) return { status: "conflict", title: "Promise not found", detail: "Name one promise. Nothing changed." };
    const existingLink = draft.links.find((link) => link.type === "commitment-reserved-by-event" && link.fromId === commitment.id);
    if (existingLink) {
      const source = allCalendarPlans(draft).find((plan) => [...plan.events, ...plan.deferred].some(({ id }) => id === existingLink.toId));
      if (source) draft.calendar = structuredClone(source);
    }
    const request: CalendarRequest = existingLink ? {
      transcript: `Move preparation for ${commitment.title}`,
      normalized: `move preparation for ${commitment.title.toLowerCase()}`,
      actions: [
        { type: "move", selector: { type: "id", id: existingLink.toId }, destination: { type: "absolute", minutes: action.startMinutes, date: { dateKey: action.dateKey } } },
        { type: "resize", selector: { type: "id", id: existingLink.toId }, mode: "set", minutes: action.durationMinutes },
      ],
      constraints: [],
    } : {
      transcript: `Reserve time for ${commitment.title}`,
      normalized: `reserve time for ${commitment.title.toLowerCase()}`,
      actions: [{ type: "create", title: `Prepare · ${commitment.title}`, durationMinutes: action.durationMinutes, destination: { type: "absolute", minutes: action.startMinutes, date: { dateKey: action.dateKey } } }],
      constraints: [],
    };
    const result = executeRequest(draft.calendar, request, existingLink?.toId, true);
    if (result.status === "clarification") return { status: "clarification", title: result.clarification.question, detail: "Nothing changed.", calendarRequest: request };
    if (result.status !== "success") return { status: result.status, title: result.title, detail: result.detail, calendarRequest: request };
    if (existingLink) {
      draft.calendar = result.plan;
      return null;
    }
    const created = [...result.plan.events, ...result.plan.deferred].find((event) => ![...draft.calendar.events, ...draft.calendar.deferred].some(({ id }) => id === event.id));
    if (!created) return { status: "conflict", title: "Promise reservation was not created", detail: "The complete transaction was cancelled." };
    const renamed = { ...created, id: action.eventId, protected: true, kind: "protected" as const };
    result.plan.events = result.plan.events.map((event) => event.id === created.id ? renamed : event);
    result.plan.deferred = result.plan.deferred.map((event) => event.id === created.id ? renamed : event);
    draft.calendar = result.plan;
    draft.links.push({ id: `link-${action.eventId}`, type: "commitment-reserved-by-event", fromId: commitment.id, toId: action.eventId, createdAt: now });
  }
  if (action.type === "link.create" && !draft.links.some((link) => link.type === action.link.type && link.fromId === action.link.fromId && link.toId === action.link.toId)) draft.links.push(action.link);
  if (action.type === "link.remove") draft.links = draft.links.filter(({ id }) => id !== action.linkId);
  if (action.type === "calendar.request") {
    if (action.sourceDateKey) {
      const source = projectCalendarDate(draft, action.sourceDateKey);
      draft.calendar = source.calendar;
      draft.calendars = source.calendars;
    }
    if (action.selectedId && requestUsesSelected(action.request)) {
      const source = allCalendarPlans(draft).find((plan) => [...plan.events, ...plan.deferred].some(({ id }) => id === action.selectedId));
      if (source) draft.calendar = structuredClone(source);
    }
    draft.calendar = withWorldDeferred(draft);
    const result = executeRequest(draft.calendar, action.request, action.selectedId, action.confirmed);
    if (result.status === "clarification") return { status: "clarification", title: result.clarification.question, detail: "Nothing changed.", calendarRequest: action.request, clarification: result.clarification };
    if (result.status !== "success") return { status: result.status, title: result.title, detail: result.detail, calendarRequest: action.request, ...(result.status === "confirmation" && result.authorizationKey ? { authorizationKey: result.authorizationKey } : {}), ...(result.status === "confirmation" && result.confirmLabel ? { confirmLabel: result.confirmLabel } : {}) };
    // The scheduler fills optional defaults on its temporary cross-date
    // mirrors. Restore unchanged canonical objects before repartitioning so
    // sparse, valid stored events cannot look like conflicting duplicates.
    result.plan.deferred = result.plan.deferred.map((event) => {
      const original = draft.calendars[event.dateKey]?.events.find(({ id }) => id === event.id);
      return original && event.dateKey !== result.plan.dateKey
        && JSON.stringify(withEventDefaults(original)) === JSON.stringify(event) ? structuredClone(original) : event;
    });
    draft.calendar = result.plan;
    draft.calendars[result.plan.dateKey] = structuredClone(result.plan);
    const survivingEvents = new Set(allCalendarEvents(normalizeCalendarWorld(draft, result.plan.dateKey)).map(({ id }) => id));
    const removedCaptureLinks = draft.links.filter((link) => link.type === "capture-origin-of-event" && !survivingEvents.has(link.toId));
    const reopenedCaptureIds = new Set(removedCaptureLinks.map(({ fromId }) => fromId));
    const removedStepLinks = draft.links.filter((link) => link.type === "step-scheduled-as-event" && !survivingEvents.has(link.toId));
    if (removedStepLinks.length) {
      const removedStepIds = new Set(removedStepLinks.map(({ fromId }) => fromId));
      draft.links = draft.links.filter((link) => !removedStepLinks.some(({ id }) => id === link.id));
      draft.steps = draft.steps.map((step) => removedStepIds.has(step.id) ? { ...step, status: "planned", updatedAt: now } : step);
    }
    draft.links = draft.links.filter((link) => link.type !== "commitment-reserved-by-event" || survivingEvents.has(link.toId));
    draft.links = draft.links.filter((link) => !removedCaptureLinks.some(({ id }) => id === link.id));
    draft.captures = draft.captures.map((capture) => reopenedCaptureIds.has(capture.id) ? { ...capture, status: "unresolved", updatedAt: now } : capture);
  }
  if (action.type === "calendar.replace") {
    draft.calendar = structuredClone(action.plan);
    const eventIds = new Set([...draft.calendar.events, ...draft.calendar.deferred].map(({ id }) => id));
    const removedCaptureLinks = draft.links.filter((link) => link.type === "capture-origin-of-event" && !eventIds.has(link.toId));
    const reopenedCaptureIds = new Set(removedCaptureLinks.map(({ fromId }) => fromId));
    const removedLinks = draft.links.filter((link) => link.type === "step-scheduled-as-event" && !eventIds.has(link.toId));
    const removedStepIds = new Set(removedLinks.map(({ fromId }) => fromId));
    draft.links = draft.links.filter((link) => !removedLinks.some(({ id }) => id === link.id) && !removedCaptureLinks.some(({ id }) => id === link.id) && (link.type !== "commitment-reserved-by-event" || eventIds.has(link.toId)));
    draft.steps = draft.steps.map((step) => removedStepIds.has(step.id) ? { ...step, status: "planned", updatedAt: now } : step);
    draft.captures = draft.captures.map((capture) => reopenedCaptureIds.has(capture.id) ? { ...capture, status: "unresolved", updatedAt: now } : capture);
  }
  if (action.type === "step.schedule") {
    const step = draft.steps.find(({ id }) => id === action.stepId);
    if (!step) return { status: "conflict", title: "Step not found", detail: "Name a step in an active plan. Nothing changed." };
    const existingLink = draft.links.find((link) => link.type === "step-scheduled-as-event" && link.fromId === step.id);
    if (existingLink) {
      const source = allCalendarPlans(draft).find((plan) => [...plan.events, ...plan.deferred].some(({ id }) => id === existingLink.toId));
      if (source) draft.calendar = structuredClone(source);
      const request: CalendarRequest = {
        transcript: `Reschedule ${step.title}`,
        normalized: `reschedule ${step.title.toLowerCase()}`,
        actions: [
          { type: "move", selector: { type: "id", id: existingLink.toId }, destination: { type: "absolute", minutes: action.startMinutes, date: { dateKey: action.dateKey } } },
          ...(action.protect ? [{ type: "protect" as const, selector: { type: "id" as const, id: existingLink.toId } }] : []),
        ],
        constraints: [],
      };
      const result = executeRequest(draft.calendar, request, existingLink.toId, true);
      if (result.status === "clarification") return { status: "clarification", title: result.clarification.question, detail: "Nothing changed.", calendarRequest: request };
      if (result.status !== "success") return { status: result.status, title: result.title, detail: result.detail, calendarRequest: request };
      draft.calendar = result.plan;
      draft.steps = draft.steps.map((item) => {
        if (item.id !== step.id) return item;
        const current = { ...item, status: "scheduled" as const, updatedAt: now };
        delete current.deferredUntil;
        return current;
      });
      return null;
    }
    const request: CalendarRequest = {
      transcript: `Schedule ${step.title}`,
      normalized: `schedule ${step.title.toLowerCase()}`,
      actions: [{ type: "create", title: step.title, durationMinutes: step.estimatedMinutes ?? 30, destination: { type: "absolute", minutes: action.startMinutes, date: { dateKey: action.dateKey } } }],
      constraints: [],
    };
    const result = executeRequest(draft.calendar, request, undefined, true);
    if (result.status === "clarification") return { status: "clarification", title: result.clarification.question, detail: "Nothing changed.", calendarRequest: request };
    if (result.status !== "success") return { status: result.status, title: result.title, detail: result.detail, calendarRequest: request, ...(result.status === "confirmation" && result.authorizationKey ? { authorizationKey: result.authorizationKey } : {}) };
    const created = [...result.plan.events, ...result.plan.deferred].find((event) => ![...draft.calendar.events, ...draft.calendar.deferred].some(({ id }) => id === event.id));
    if (!created) return { status: "conflict", title: "Calendar reservation was not created", detail: "The complete transaction was cancelled." };
    const renamed = { ...created, id: action.eventId, ...(action.protect ? { protected: true, kind: "protected" as const } : {}) };
    result.plan.events = result.plan.events.map((event) => event.id === created.id ? renamed : event);
    result.plan.deferred = result.plan.deferred.map((event) => event.id === created.id ? renamed : event);
    draft.calendar = result.plan;
    draft.steps = draft.steps.map((item) => item.id === step.id ? { ...item, status: "scheduled", updatedAt: now } : item);
    draft.links.push({ id: `link-${action.eventId}`, type: "step-scheduled-as-event", fromId: step.id, toId: action.eventId, createdAt: now });
  }
  if (action.type === "step.unschedule") {
    const link = draft.links.find((item) => item.type === "step-scheduled-as-event" && item.fromId === action.stepId);
    if (!link) return { status: "conflict", title: "Step is not scheduled", detail: "Nothing changed." };
    removeEventsFromWorld(draft, new Set([link.toId]));
    draft.links = draft.links.filter(({ id }) => id !== link.id);
    draft.steps = draft.steps.map((step) => step.id === action.stepId ? { ...step, status: "planned", updatedAt: now } : step);
  }
  if (action.type === "focus.start") {
    if (draft.focus.active) return { status: "conflict", title: "Focus is already running", detail: "Stop the current session before starting another. Nothing changed." };
    draft.focus.active = action.session;
  }
  if (action.type === "focus.stop") {
    const active = draft.focus.active;
    if (!active) return { status: "conflict", title: "There isn’t a focus session running", detail: "Nothing changed." };
    draft.focus.lastCompleted = { ...active, status: "completed", completedAt: action.completedAt };
    delete draft.focus.active;
  }
  if (action.type === "focus.extend") {
    const active = draft.focus.active;
    if (!active) return { status: "conflict", title: "There isn’t a focus session running", detail: "Nothing changed." };
    if (action.minutes <= 0) return { status: "conflict", title: "Focus extension must be positive", detail: "Nothing changed." };
    draft.focus.active = { ...active, durationMinutes: active.durationMinutes + action.minutes };
  }
  if (action.type === "weather.replace") {
    draft.environment.weatherByDate[action.observation.dateKey] = action.observation;
  }
  if (action.type === "instinct.shown") {
    draft.instinctState.lastShownAt[action.instinctId] = action.at;
  }
  if (action.type === "instinct.dismiss") {
    draft.instinctState.dismissedUntil[action.instinctId] = action.until;
  }
  if (action.type === "instinct.act") {
    draft.instinctState.actedOnAt ??= {};
    draft.instinctState.actedOnAt[action.instinctId] = action.at;
  }
  if (action.type === "journal.create") draft.studio.journalEntries.push(action.entry);
  if (action.type === "journal.update") {
    if (!draft.studio.journalEntries.some(({ id }) => id === action.entryId)) return { status: "conflict", title: "Journal entry not found", detail: "Nothing changed." };
    draft.studio.journalEntries = draft.studio.journalEntries.map((entry) => entry.id === action.entryId ? { ...entry, ...action.patch, updatedAt: now } : entry);
  }
  if (action.type === "journal.segment.add") {
    const entry = draft.studio.journalEntries.find(({ id }) => id === action.entryId);
    if (!entry) return { status: "conflict", title: "Journal entry not found", detail: "Nothing changed." };
    if (entry.transcriptSegments.some(({ id }) => id === action.segment.id)) return { status: "conflict", title: "That passage is already in the journal", detail: "Nothing changed." };
    entry.text = appendJournalProse(entry.text, action.segment.text);
    entry.transcriptSegments.push(action.segment);
    entry.updatedAt = now;
  }
  if (action.type === "journal.bookmark.add") {
    const entry = draft.studio.journalEntries.find(({ id }) => id === action.entryId);
    if (!entry) return { status: "conflict", title: "Journal entry not found", detail: "Nothing changed." };
    if (entry.bookmarks.some(({ id }) => id === action.bookmark.id)) return { status: "conflict", title: "That moment is already bookmarked", detail: "Nothing changed." };
    entry.bookmarks.push(action.bookmark); entry.updatedAt = now;
  }
  if (action.type === "journal.bookmark.remove") {
    const entry = draft.studio.journalEntries.find(({ id }) => id === action.entryId);
    if (!entry || !entry.bookmarks.some(({ id }) => id === action.bookmarkId)) return { status: "conflict", title: "Bookmark not found", detail: "Nothing changed." };
    entry.bookmarks = entry.bookmarks.filter(({ id }) => id !== action.bookmarkId); entry.updatedAt = now;
  }
  if (action.type === "journal.photo.attach") {
    const entry = draft.studio.journalEntries.find(({ id }) => id === action.entryId);
    const asset = draft.studio.mediaAssets.find(({ id }) => id === action.assetId);
    if (!entry || !asset || asset.kind !== "journal-photo") return { status: "conflict", title: "Photo could not be attached", detail: "Nothing changed." };
    if (!entry.photoAssetIds.includes(asset.id)) entry.photoAssetIds.push(asset.id);
    entry.updatedAt = now;
  }
  if (action.type === "journal.photo.remove") {
    const entry = draft.studio.journalEntries.find(({ id }) => id === action.entryId);
    if (!entry || !entry.photoAssetIds.includes(action.assetId)) return { status: "conflict", title: "Photo not found", detail: "Nothing changed." };
    entry.photoAssetIds = entry.photoAssetIds.filter((id) => id !== action.assetId); entry.updatedAt = now;
  }
  if (action.type === "journal.drawing.replace") {
    const entry = draft.studio.journalEntries.find(({ id }) => id === action.entryId);
    if (!entry) return { status: "conflict", title: "Journal entry not found", detail: "Nothing changed." };
    entry.drawings = action.strokes; entry.updatedAt = now;
  }
  if (action.type === "journal.delete") {
    if (!draft.studio.journalEntries.some(({ id }) => id === action.entryId)) return { status: "conflict", title: "Journal entry not found", detail: "Nothing changed." };
    draft.studio.journalEntries = draft.studio.journalEntries.filter(({ id }) => id !== action.entryId);
    draft.studio.memories = draft.studio.memories.filter(({ journalEntryId }) => journalEntryId !== action.entryId);
  }
  if (action.type === "media.register") {
    if (draft.studio.mediaAssets.some(({ id }) => id === action.asset.id)) return { status: "conflict", title: "Media is already registered", detail: "Nothing changed." };
    draft.studio.mediaAssets.push(action.asset);
  }
  if (action.type === "media.update") {
    if (!draft.studio.mediaAssets.some(({ id }) => id === action.assetId)) return { status: "conflict", title: "Media is not registered", detail: "Nothing changed." };
    draft.studio.mediaAssets = draft.studio.mediaAssets.map((asset) => asset.id === action.assetId ? { ...asset, ...action.patch } : asset);
  }
  if (action.type === "media.remove") {
    const referenced = draft.studio.journalEntries.some((entry) => entry.audioAssetId === action.assetId || entry.photoAssetIds.includes(action.assetId))
      || draft.studio.memories.some(({ photoAssetId }) => photoAssetId === action.assetId);
    if (referenced) return { status: "conflict", title: "Media is still in use", detail: "Remove it from the journal or memory first." };
    draft.studio.mediaAssets = draft.studio.mediaAssets.filter(({ id }) => id !== action.assetId);
  }
  if (action.type === "atmosphere.preset.create") draft.studio.atmospherePresets.push(action.preset);
  if (action.type === "atmosphere.preset.update") {
    if (!draft.studio.atmospherePresets.some(({ id }) => id === action.presetId)) return { status: "conflict", title: "Atmosphere not found", detail: "Nothing changed." };
    draft.studio.atmospherePresets = draft.studio.atmospherePresets.map((preset) => preset.id === action.presetId ? { ...preset, ...action.patch, updatedAt: now } : preset);
  }
  if (action.type === "atmosphere.preset.delete") {
    const preset = draft.studio.atmospherePresets.find(({ id }) => id === action.presetId);
    if (!preset) return { status: "conflict", title: "Atmosphere not found", detail: "Nothing changed." };
    if (preset.builtIn) return { status: "conflict", title: "Keep the original atmosphere", detail: "Duplicate it before deleting a version of your own." };
    draft.studio.atmospherePresets = draft.studio.atmospherePresets.filter(({ id }) => id !== action.presetId);
    if (draft.studio.activeAtmosphere?.presetId === action.presetId) delete draft.studio.activeAtmosphere;
  }
  if (action.type === "atmosphere.activate") draft.studio.activeAtmosphere = action.state;
  if (action.type === "atmosphere.playback") {
    const active = draft.studio.activeAtmosphere;
    if (!active) return { status: "conflict", title: "No atmosphere is open", detail: "Open or play a saved atmosphere first." };
    active.playing = action.playing;
    if (action.muted !== undefined) active.muted = action.muted;
  }
  if (action.type === "atmosphere.layer.update") {
    const active = draft.studio.activeAtmosphere;
    const layer = active?.layers.find(({ id }) => id === action.layerId);
    if (!active || !layer) return { status: "conflict", title: "That sound layer is not available", detail: "Nothing changed." };
    Object.assign(layer, action.patch);
  }
  if (action.type === "memory.create") draft.studio.memories.push(action.memory);
  if (action.type === "memory.update") {
    if (!draft.studio.memories.some(({ id }) => id === action.memoryId)) return { status: "conflict", title: "Memory not found", detail: "Nothing changed." };
    draft.studio.memories = draft.studio.memories.map((memory) => memory.id === action.memoryId ? { ...memory, ...action.patch, updatedAt: now } : memory);
  }
  if (action.type === "memory.delete") {
    if (!draft.studio.memories.some(({ id }) => id === action.memoryId)) return { status: "conflict", title: "Memory not found", detail: "Nothing changed." };
    draft.studio.memories = draft.studio.memories.filter(({ id }) => id !== action.memoryId);
  }
  if (action.type === "workspace.update") {
    draft.studio.workspace = { ...draft.studio.workspace, ...action.patch };
    draft.studio.workspace.minimized = [...new Set(draft.studio.workspace.minimized)];
  }
  if (action.type === "ritual.create") draft.studio.rituals.push(action.ritual);
  if (action.type === "ritual.update") {
    if (!draft.studio.rituals.some(({ id }) => id === action.ritualId)) return { status: "conflict", title: "Ritual not found", detail: "Nothing changed." };
    draft.studio.rituals = draft.studio.rituals.map((ritual) => ritual.id === action.ritualId ? { ...ritual, ...action.patch, updatedAt: now } : ritual);
  }
  if (action.type === "ritual.delete") draft.studio.rituals = draft.studio.rituals.filter(({ id }) => id !== action.ritualId);
  return null;
}

export function applyLifeTransaction(document: LifeDocument, actions: LifeAction[], clock: () => Date = () => new Date()): LifeTransactionResult {
  const sourceInvalid = validateLifeDocument(document);
  if (sourceInvalid) return { status: "conflict", title: "Flow protected your data", detail: `${sourceInvalid} Nothing changed.` };
  const draft = cloneLifeDocument(document);
  const activeDateKey = document.calendar.dateKey;
  const now = clock().toISOString();
  for (const action of actions) {
    const failure = applyAction(draft, action, now);
    if (failure) return failure;
  }
  const synchronizedAt = now;
  let normalized: LifeDocument;
  try {
    normalized = projectCalendarDate(normalizeCalendarWorld(draft, draft.calendar.dateKey), activeDateKey);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid calendar identity.";
    return { status: "conflict", title: "Flow protected your data", detail: `${detail} Nothing changed.` };
  }
  const worldEvents = allCalendarEvents(normalized);
  normalized.steps = normalized.steps.map((step) => {
    const link = draft.links.find((item) => item.type === "step-scheduled-as-event" && item.fromId === step.id);
    if (!link) return step;
    const event = worldEvents.find(({ id }) => id === link.toId);
    const status: LifeDocument["steps"][number]["status"] = event?.status === "done" ? "completed" : step.status === "deferred" ? "deferred" : "scheduled";
    if (step.status === status) return step;
    const next = { ...step, status, updatedAt: synchronizedAt };
    if (status !== "deferred") delete next.deferredUntil;
    return next;
  });
  const invalid = validateLifeDocument(normalized);
  if (invalid) return { status: "conflict", title: "Flow protected your data", detail: `${invalid} Nothing changed.` };
  normalized = preserveNoopEntityMetadata(document, normalized);
  return { status: "success", document: normalized, summary: summarizeActions(actions) };
}

function summarizeActions(actions: LifeAction[]) {
  if (actions.some(({ type }) => type === "plan.create")) return "Created an Outcome.";
  if (actions.some(({ type }) => type === "step.schedule")) return "Scheduled the outcome step in Today.";
  if (actions.some(({ type }) => type === "commitment.create")) return "Commitment added.";
  if (actions.some(({ type }) => type === "commitment.schedule")) return "Reserved Calendar time for the promise.";
  if (actions.some(({ type }) => type === "capture.create")) return "Added to Capture.";
  if (actions.some(({ type }) => type === "calendar.request")) return "Calendar updated through Tide.";
  if (actions.some(({ type }) => type === "focus.start")) return "Focus session started.";
  if (actions.some(({ type }) => type === "focus.stop")) return "Focus session completed.";
  if (actions.some(({ type }) => type === "focus.extend")) return "Focus session extended.";
  if (actions.some(({ type }) => type === "instinct.shown")) return "Insight exposure recorded.";
  if (actions.some(({ type }) => type === "instinct.dismiss")) return "Insight set aside for now.";
  if (actions.some(({ type }) => type === "instinct.act")) return "Insight acted on.";
  if (actions.some(({ type }) => type === "journal.create")) return "A new journal entry is open.";
  if (actions.some(({ type }) => type === "journal.bookmark.add")) return "Moment bookmarked.";
  if (actions.some(({ type }) => type === "journal.update" || type === "journal.segment.add")) return "Journal updated.";
  if (actions.some(({ type }) => type === "atmosphere.activate")) return "Atmosphere started.";
  if (actions.some(({ type }) => type === "atmosphere.layer.update" || type === "atmosphere.playback")) return "Atmosphere adjusted.";
  if (actions.some(({ type }) => type === "atmosphere.preset.create" || type === "atmosphere.preset.update")) return "Atmosphere saved.";
  if (actions.some(({ type }) => type === "memory.create")) return "Memory composed.";
  if (actions.some(({ type }) => type === "memory.update")) return "Memory updated.";
  if (actions.some(({ type }) => type === "workspace.update")) return "Studio rearranged.";
  if (actions.some(({ type }) => type === "ritual.update" || type === "ritual.create")) return "Ritual updated.";
  return "Flow updated your life plan.";
}
