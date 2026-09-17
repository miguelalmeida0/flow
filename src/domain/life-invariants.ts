import { validatePlan } from "../features/day-planner/scheduling/invariants";
import type { LifeDocument } from "./life-model";
import { allCalendarEvents, allCalendarPlans } from "./life-calendar-world";
import { validateFriends, validateVoiceMarkers } from "./friends-invariants";

function duplicate(values: string[]) {
  return values.find((value, index) => values.indexOf(value) !== index);
}

export function validateLifeDocument(document: LifeDocument): string | null {
  if (document.schemaVersion !== 5 && document.schemaVersion !== 6) return "Unsupported LifeDocument schema.";
  const friendsError = validateFriends(document);
  if (friendsError) return friendsError;
  if (!Number.isInteger(document.preferences.workdayEndMinutes) || document.preferences.workdayEndMinutes < 0 || document.preferences.workdayEndMinutes > 24 * 60) return "Invalid workday boundary.";
  const plans = allCalendarPlans(document);
  for (const plan of plans) {
    const calendarError = validatePlan(plan);
    if (calendarError) return calendarError;
  }
  if (!document.calendars[document.calendar.dateKey]) return "The active calendar is missing from the multi-day schedule.";
  const calendarEvents = allCalendarEvents(document);
  for (const event of calendarEvents) if (event.participantIds && (duplicate(event.participantIds) || event.participantIds.some((id) => !document.people.some((person) => person.id === id)))) return `${event.title} has an invalid participant relationship.`;
  const rooms = plans.flatMap((plan) => plan.breathingRooms ?? []);
  const eventIds = [...calendarEvents, ...rooms].map(({ id }) => id);
  const entityIds = [
    ...document.captures.map(({ id }) => id), ...document.plans.map(({ id }) => id),
    ...document.steps.map(({ id }) => id), ...document.people.map(({ id }) => id),
    ...document.commitments.map(({ id }) => id), ...document.links.map(({ id }) => id), ...eventIds,
    ...document.studio.journalEntries.map(({ id }) => id), ...document.studio.atmospherePresets.map(({ id }) => id),
    ...document.studio.memories.map(({ id }) => id), ...document.studio.rituals.map(({ id }) => id),
    ...document.studio.mediaAssets.map(({ id }) => id),
    ...(document.friends ? [document.friends.messages, document.friends.voiceNotes, document.friends.groups, document.friends.groupPlans, document.friends.links, document.friends.reactions].flatMap((items) => items.map(({ id }) => id)) : []),
  ];
  const duplicateId = duplicate(entityIds);
  if (duplicateId) return `Duplicate identity ${duplicateId}.`;
  const allEndpoints = new Set(entityIds.filter((id) => !document.links.some((link) => link.id === id)));
  for (const plan of document.plans) {
    if (duplicate(plan.stepIds)) return `${plan.title} contains a duplicate step.`;
    if (plan.stepIds.some((id) => !document.steps.some((step) => step.id === id && step.planId === plan.id))) return `${plan.title} has an invalid step relationship.`;
    if (plan.nextStepId && !plan.stepIds.includes(plan.nextStepId)) return `${plan.title} has an invalid next step.`;
  }
  for (const step of document.steps) if (!document.plans.some(({ id }) => id === step.planId)) return `${step.title} has no plan.`;
  for (const commitment of document.commitments) if (!document.people.some(({ id }) => id === commitment.personId)) return `${commitment.title} has no person.`;
  for (const link of document.links) {
    if (!allEndpoints.has(link.fromId) || !allEndpoints.has(link.toId)) return `Link ${link.id} has a missing endpoint.`;
    if (document.links.some((candidate) => candidate.id !== link.id && candidate.type === link.type && candidate.fromId === link.fromId && candidate.toId === link.toId)) return `Duplicate ${link.type} relationship.`;
    if (link.type === "capture-origin-of-plan" && (!document.captures.some(({ id }) => id === link.fromId) || !document.plans.some(({ id }) => id === link.toId))) return `Invalid capture-to-plan relationship.`;
    if (link.type === "capture-origin-of-event" && (!document.captures.some(({ id }) => id === link.fromId) || !eventIds.includes(link.toId))) return `Invalid capture-to-event relationship.`;
    if (link.type === "capture-origin-of-commitment" && (!document.captures.some(({ id }) => id === link.fromId) || !document.commitments.some(({ id }) => id === link.toId))) return `Invalid capture-to-commitment relationship.`;
    if (link.type === "step-scheduled-as-event" && (!document.steps.some(({ id }) => id === link.fromId) || !eventIds.includes(link.toId))) return `Invalid step-to-event relationship.`;
    if (link.type === "commitment-about-plan" && (!document.commitments.some(({ id }) => id === link.fromId) || !document.plans.some(({ id }) => id === link.toId))) return `Invalid commitment-to-plan relationship.`;
    if (link.type === "commitment-reserved-by-event" && (!document.commitments.some(({ id }) => id === link.fromId) || !eventIds.includes(link.toId))) return `Invalid commitment-to-event relationship.`;
  }
  for (const capture of document.captures) {
    const originLinks = document.links.filter((link) => ["capture-origin-of-plan", "capture-origin-of-event", "capture-origin-of-commitment"].includes(link.type) && link.fromId === capture.id);
    if (originLinks.length > 1) return `${capture.title} has more than one origin plan.`;
    if (capture.status === "resolved" && originLinks.length !== 1) return `${capture.title} is resolved without one destination.`;
  }
  for (const step of document.steps) {
    const eventLinks = document.links.filter((link) => link.type === "step-scheduled-as-event" && link.fromId === step.id);
    if (eventLinks.length > 1) return `${step.title} has more than one Calendar reservation.`;
    if (step.status === "scheduled" && eventLinks.length !== 1) return `${step.title} is scheduled without a Calendar reservation.`;
    if (eventLinks.length === 1 && !calendarEvents.some(({ id }) => id === eventLinks[0]?.toId)) return `${step.title} points to a missing Calendar event.`;
    if (eventLinks.length === 1) {
      const event = calendarEvents.find(({ id }) => id === eventLinks[0]?.toId);
      if (event?.status === "done" && step.status !== "completed") return `${step.title} and its completed Calendar reservation disagree.`;
      if (event?.status !== "done" && !["scheduled", "deferred"].includes(step.status)) return `${step.title} and its Calendar reservation disagree.`;
    }
  }
  for (const commitment of document.commitments) {
    const eventLinks = document.links.filter((link) => link.type === "commitment-reserved-by-event" && link.fromId === commitment.id);
    if (eventLinks.length > 1) return `${commitment.title} has more than one Calendar reservation.`;
  }
  if (document.focus.active) {
    const focus = document.focus.active;
    if (focus.status !== "active" || focus.durationMinutes <= 0 || focus.startMinutes < 0 || focus.startMinutes + focus.durationMinutes > 24 * 60) return "The active Focus session is invalid.";
    const day = document.calendars[focus.dateKey];
    if (!day) return "The active Focus session has no calendar day.";
    const boundary = day.endBoundaryMinutes ?? 24 * 60;
    if (focus.startMinutes + focus.durationMinutes > boundary) return "The active Focus session crosses the day boundary.";
    const anchors = [...day.events, ...(day.breathingRooms ?? [])]
      .filter((item) => "kind" in item ? item.kind === "fixed" || item.kind === "protected" || item.protected : item.protected)
      .sort((left, right) => left.start - right.start);
    if (anchors.some((anchor) => focus.startMinutes < anchor.end && focus.startMinutes + focus.durationMinutes > anchor.start)) return "The active Focus session crosses a protected anchor.";
  }
  const mediaById = new Map(document.studio.mediaAssets.map((asset) => [asset.id, asset]));
  for (const entry of document.studio.journalEntries) {
    const markerError = validateVoiceMarkers(entry.markers ?? [], entry.recordingDurationMs, entry.id);
    if (markerError) return markerError;
    if (!entry.title.trim()) return "A journal entry has no title.";
    if (entry.recordingDurationMs < 0 || !Number.isFinite(entry.recordingDurationMs)) return `${entry.title} has an invalid recording duration.`;
    if (duplicate(entry.photoAssetIds)) return `${entry.title} contains a duplicate photograph.`;
    if (duplicate(entry.bookmarks.map(({ id }) => id))) return `${entry.title} contains a duplicate bookmark.`;
    if (duplicate(entry.transcriptSegments.map(({ id }) => id))) return `${entry.title} contains a duplicate passage.`;
    if (entry.audioAssetId && mediaById.get(entry.audioAssetId)?.kind !== "journal-audio") return `${entry.title} points to missing journal audio.`;
    if (entry.photoAssetIds.some((id) => mediaById.get(id)?.kind !== "journal-photo")) return `${entry.title} points to a missing photograph.`;
    if (entry.bookmarks.some(({ timestampMs }) => timestampMs < 0 || !Number.isFinite(timestampMs))) return `${entry.title} has an invalid bookmark.`;
    if (entry.transcriptSegments.some(({ startMs, endMs }) => startMs < 0 || endMs < startMs)) return `${entry.title} has an invalid transcript passage.`;
  }
  for (const preset of document.studio.atmospherePresets) {
    if (!preset.name.trim()) return "An atmosphere has no name.";
    if (preset.masterVolume < 0 || preset.masterVolume > 1) return `${preset.name} has an invalid master volume.`;
    if (duplicate(preset.layers.map(({ id }) => id))) return `${preset.name} contains a duplicate sound layer.`;
    if (preset.layers.some(({ volume, character, rate }) => volume < 0 || volume > 1 || character < 0 || character > 1 || rate < 0.2 || rate > 2)) return `${preset.name} has an invalid sound layer.`;
  }
  const activeAtmosphere = document.studio.activeAtmosphere;
  if (activeAtmosphere) {
    if (!document.studio.atmospherePresets.some(({ id }) => id === activeAtmosphere.presetId)) return "The active atmosphere preset is missing.";
    if (activeAtmosphere.masterVolume < 0 || activeAtmosphere.masterVolume > 1) return "The active atmosphere volume is invalid.";
    if (duplicate(activeAtmosphere.layers.map(({ id }) => id))) return "The active atmosphere contains a duplicate layer.";
    if (activeAtmosphere.layers.some(({ volume, character, rate }) => volume < 0 || volume > 1 || character < 0 || character > 1 || rate < 0.2 || rate > 2)) return "The active atmosphere contains an invalid layer.";
  }
  for (const memory of document.studio.memories) {
    const entry = document.studio.journalEntries.find(({ id }) => id === memory.journalEntryId);
    if (!entry) return `${memory.title} points to a missing journal entry.`;
    if (memory.photoAssetId && !entry.photoAssetIds.includes(memory.photoAssetId)) return `${memory.title} points to a photograph outside its journal.`;
    if (memory.bookmarkId && !entry.bookmarks.some(({ id }) => id === memory.bookmarkId)) return `${memory.title} points to a missing bookmark.`;
    if (memory.datePlacement !== "inline" && memory.datePlacement !== "corner") return `${memory.title} has an invalid date placement.`;
    if (memory.textScale < 0.7 || memory.textScale > 1.8) return `${memory.title} has an invalid text scale.`;
    if (memory.audioInMs < 0 || memory.audioOutMs !== undefined && memory.audioOutMs <= memory.audioInMs) return `${memory.title} has an invalid audio excerpt.`;
  }
  const surfaces = [document.studio.workspace.primary, document.studio.workspace.secondary, ...document.studio.workspace.minimized].filter(Boolean) as string[];
  if (duplicate(surfaces)) return "A studio surface occupies more than one place.";
  for (const ritual of document.studio.rituals) {
    if (!ritual.name.trim()) return "A ritual has no name.";
    if (ritual.steps.some((step) => step.type === "atmosphere.play" && !document.studio.atmospherePresets.some(({ id }) => id === step.presetId))) return `${ritual.name} points to a missing atmosphere.`;
  }
  return null;
}
