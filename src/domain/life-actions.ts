import type { CalendarRequest, DayPlan } from "../features/day-planner/model";
import type { FriendsAction } from "./friends-actions";
import type { Capture, Commitment, EntityLink, FocusSession, Person, Plan, PlanStep, WeatherObservation } from "./life-model";
import type { ActiveAtmosphere, AtmosphereLayerId, AtmospherePreset, JournalBookmark, JournalDrawingStroke, JournalEntry, JournalTranscriptSegment, MemoryArtifact, RitualDefinition, StudioMediaAsset, WorkspaceSurfaceState } from "./studio-model";

export type LifeAction =
  | FriendsAction
  | { type: "capture.create"; capture: Capture }
  | { type: "capture.update"; captureId: string; title: string }
  | { type: "capture.archive"; captureId: string }
  | { type: "capture.delete"; captureId: string }
  | { type: "capture.resolve"; captureId: string }
  | { type: "plan.create"; plan: Plan }
  | { type: "plan.update"; planId: string; patch: Partial<Pick<Plan, "title" | "outcome" | "status" | "dueAt" | "targetCondition" | "nextStepId">> }
  | { type: "plan.delete"; planId: string }
  | { type: "plan.step.add"; step: PlanStep }
  | { type: "plan.step.update"; stepId: string; patch: Partial<Pick<PlanStep, "title" | "status" | "estimatedMinutes" | "deferredUntil">> }
  | { type: "plan.step.delete"; stepId: string }
  | { type: "plan.step.reorder"; planId: string; stepId: string; beforeStepId?: string }
  | { type: "person.ensure"; person: Person }
  | { type: "commitment.create"; commitment: Commitment }
  | { type: "commitment.update"; commitmentId: string; patch: Partial<Pick<Commitment, "title" | "status" | "dueAt" | "deferredUntil" | "deferReason">> }
  | { type: "commitment.delete"; commitmentId: string }
  | { type: "commitment.schedule"; commitmentId: string; eventId: string; dateKey: string; startMinutes: number; durationMinutes: number }
  | { type: "link.create"; link: EntityLink }
  | { type: "link.remove"; linkId: string }
  | { type: "calendar.request"; request: CalendarRequest; selectedId?: string; sourceDateKey?: string; confirmed?: boolean | string }
  | { type: "calendar.replace"; plan: DayPlan }
  | { type: "step.schedule"; stepId: string; eventId: string; dateKey: string; startMinutes: number; protect?: boolean }
  | { type: "step.unschedule"; stepId: string }
  | { type: "focus.start"; session: FocusSession }
  | { type: "focus.stop"; completedAt: string }
  | { type: "focus.extend"; minutes: number }
  | { type: "weather.replace"; observation: WeatherObservation }
  | { type: "instinct.shown"; instinctId: string; at: string }
  | { type: "instinct.dismiss"; instinctId: string; until: string }
  | { type: "instinct.act"; instinctId: string; at: string }
  | { type: "journal.create"; entry: JournalEntry }
  | { type: "journal.update"; entryId: string; patch: Partial<Pick<JournalEntry, "title" | "text" | "status" | "recordingState" | "recordingDurationMs" | "audioAssetId" | "tags">> }
  | { type: "journal.segment.add"; entryId: string; segment: JournalTranscriptSegment }
  | { type: "journal.bookmark.add"; entryId: string; bookmark: JournalBookmark }
  | { type: "journal.bookmark.remove"; entryId: string; bookmarkId: string }
  | { type: "journal.photo.attach"; entryId: string; assetId: string }
  | { type: "journal.photo.remove"; entryId: string; assetId: string }
  | { type: "journal.drawing.replace"; entryId: string; strokes: JournalDrawingStroke[] }
  | { type: "journal.delete"; entryId: string }
  | { type: "media.register"; asset: StudioMediaAsset }
  | { type: "media.update"; assetId: string; patch: Partial<Pick<StudioMediaAsset, "name" | "mimeType" | "size">> }
  | { type: "media.remove"; assetId: string }
  | { type: "atmosphere.preset.create"; preset: AtmospherePreset }
  | { type: "atmosphere.preset.update"; presetId: string; patch: Partial<Pick<AtmospherePreset, "name" | "layers" | "masterVolume">> }
  | { type: "atmosphere.preset.delete"; presetId: string }
  | { type: "atmosphere.activate"; state: ActiveAtmosphere }
  | { type: "atmosphere.playback"; playing: boolean; muted?: boolean }
  | { type: "atmosphere.layer.update"; layerId: AtmosphereLayerId; patch: { volume?: number; enabled?: boolean; character?: number; rate?: number } }
  | { type: "memory.create"; memory: MemoryArtifact }
  | { type: "memory.update"; memoryId: string; patch: Partial<Pick<MemoryArtifact, "title" | "composition" | "passage" | "photoAssetId" | "bookmarkId" | "showDate" | "datePlacement" | "textScale" | "textOffset" | "audioEnabled" | "audioInMs" | "audioOutMs" | "status" | "personIds" | "groupId" | "calendarEventId" | "recordingMoment">> }
  | { type: "memory.delete"; memoryId: string }
  | { type: "workspace.update"; patch: Partial<WorkspaceSurfaceState> }
  | { type: "ritual.create"; ritual: RitualDefinition }
  | { type: "ritual.update"; ritualId: string; patch: Partial<Pick<RitualDefinition, "name" | "enabled" | "steps">> }
  | { type: "ritual.delete"; ritualId: string };
