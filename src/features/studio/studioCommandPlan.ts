import type { LifeAction } from "../../domain/life-actions";
import { uniqueLifeId } from "../../domain/life-factories";
import type { LifeContext, LifeDocument, LifeRoute } from "../../domain/life-model";
import type { ActiveAtmosphere, AtmosphereLayer, JournalEntry, MemoryArtifact, StudioSurfaceId } from "../../domain/studio-model";
import { cloneAtmosphereLayers } from "../../domain/studio-model";
import { applyLifeTransaction } from "../../domain/life-transaction";
import type { StudioIntent, StudioPlanStep } from "./interpretation/studioInterpreter";
import { journalRuntimePosition, recordingTranscriptRanges } from "./journalRuntimeClock";
import { adjustAtmosphereValue } from "./atmosphereValues";
import { planStudioSelection } from "./studioSelectionPlan";
import { nativeContinuationPresentation, type NativeStudioContinuation } from "./nativeStudioCapability";
import { homeRitualStep, ritualStepKey } from "./ritualConfiguration";
import type { StudioPlaybackCommand } from "./studioPlayback";
import { lastJournalSentence } from "./journalBookmark";
import type { JournalCreationOrigin } from "./journalAcquisition";

export type StudioRuntimeCommand = { target: "journal"; mode: "start" | "pause" | "resume" | "stop" | "discard"; entryId?: string; origin?: JournalCreationOrigin; assetId?: string; stateCommitted?: boolean }
  | StudioPlaybackCommand;

export type StudioCommandPlan =
  | { status: "native-continuation"; continuation: NativeStudioContinuation; title: string; detail: string; navigateTo: LifeRoute; focusId?: string }
  | { status: "ready"; actions: LifeAction[]; summary: string; navigateTo?: LifeRoute; focusId?: string; runtimeCommands: StudioRuntimeCommand[]; contextPatch?: Partial<LifeContext> }
  | { status: "feedback"; title: string; detail: string }
  | { status: "clarification"; title: string; detail: string }
  | { status: "confirmation"; title: string; detail: string; actions: LifeAction[]; runtimeCommands: StudioRuntimeCommand[] };

function latest<T extends { updatedAt: string }>(items: readonly T[]) {
  return [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
}

function activeJournal(document: LifeDocument, context: LifeContext) {
  const id = context.activeJournalEntryId
    ?? [context.selected, context.lastReferenced, context.lastChanged, context.lastCreated].find((reference) => reference?.kind === "journal-entry")?.id;
  const linkedId = activeMemory(document, context)?.journalEntryId;
  if (id) return document.studio.journalEntries.find((entry) => entry.id === id);
  return document.studio.journalEntries.find((entry) => entry.id === id)
    ?? document.studio.journalEntries.find((entry) => entry.id === linkedId)
    ?? (context.route === "journal" ? latest(document.studio.journalEntries) : undefined);
}

function activeMemory(document: LifeDocument, context: LifeContext) {
  const id = context.activeMemoryId
    ?? [context.selected, context.lastReferenced, context.lastChanged, context.lastCreated].find((reference) => reference?.kind === "memory")?.id;
  if (id) return document.studio.memories.find((memory) => memory.id === id);
  return context.route === "memories" ? latest(document.studio.memories) : undefined;
}

function matchAtmosphere(document: LifeDocument, query: string) {
  const literal = document.studio.atmospherePresets.filter(({ name }) => name.toLowerCase() === query.toLowerCase().trim());
  if (literal.length) return literal;
  const normalized = query.toLowerCase().replace(/^the\s+|\s+atmosphere$/g, "").trim();
  const exact = document.studio.atmospherePresets.filter(({ name }) => name.toLowerCase() === normalized);
  return exact.length ? exact : document.studio.atmospherePresets.filter(({ name }) => name.toLowerCase().includes(normalized));
}

function activeState(document: LifeDocument): ActiveAtmosphere | undefined {
  return document.studio.activeAtmosphere ? structuredClone(document.studio.activeAtmosphere) : undefined;
}

function amount(layer: AtmosphereLayer, operation: "increase" | "decrease" | "remove" | "restore", property: "volume" | "rate" | "enabled") {
  if (property === "enabled") return { enabled: operation === "restore" };
  if (property === "rate") return { rate: adjustAtmosphereValue(layer.rate, "rate", operation === "increase" ? "increase" : "decrease") };
  return { volume: adjustAtmosphereValue(layer.volume, "volume", operation === "increase" ? "increase" : "decrease") };
}

function memoryPatch(memory: MemoryArtifact, intent: Extract<StudioIntent, { type: "memory-update" }>) {
  if (intent.property === "textScale") return { textScale: Math.max(0.7, Math.min(1.8, memory.textScale + (intent.operation === "increase" ? 0.12 : -0.12))) };
  if (intent.property === "showDate") return { showDate: intent.operation === "show" };
  if (intent.property === "audioEnabled") return { audioEnabled: intent.operation === "show" };
  if (intent.property === "dateCorner") return { showDate: true, datePlacement: intent.operation === "hide" ? "inline" as const : "corner" as const };
  return { textOffset: { ...memory.textOffset, y: Math.max(-40, Math.min(40, memory.textOffset.y + (intent.operation === "down" ? 8 : -8))) } };
}

function resolvedMemorySources(document: LifeDocument, entry: JournalEntry, context: LifeContext) {
  const selectedPhoto = context.selectedPhotoAssetId && entry.photoAssetIds.includes(context.selectedPhotoAssetId) ? context.selectedPhotoAssetId : undefined;
  const selectedBookmark = context.selectedBookmarkId && entry.bookmarks.some(({ id }) => id === context.selectedBookmarkId) ? context.selectedBookmarkId : undefined;
  const selectedPassage = context.selectedJournalPassage?.trim();
  const recent = context.recentJournalSegment?.entryId === entry.id ? context.recentJournalSegment.text.trim() : undefined;
  return {
    photoAssetId: selectedPhoto ?? (entry.photoAssetIds.length === 1 ? entry.photoAssetIds[0] : undefined),
    bookmark: entry.bookmarks.find(({ id }) => id === selectedBookmark) ?? (entry.bookmarks.length === 1 ? entry.bookmarks[0] : undefined),
    // A demonstrative names acquired words, not the entire linked document.
    // Stale selections from a different source cannot replace this Memory.
    passage: selectedPassage && entry.text.includes(selectedPassage) ? selectedPassage : recent && entry.text.includes(recent) ? recent : undefined,
  };
}

function workspaceActions(document: LifeDocument, operation: Extract<StudioIntent, { type: "workspace" }>, context: LifeContext): LifeAction[] {
  const workspace = document.studio.workspace;
  if (operation.operation === "show-less") return [{ type: "workspace.update", patch: { quiet: true } }];
  if (operation.operation === "show-more") return [{ type: "workspace.update", patch: { quiet: false } }];
  if (operation.operation === "restore") {
    const surface = operation.surface ?? workspace.previousPrimary;
    return surface ? [{ type: "workspace.update", patch: { primary: surface, previousPrimary: workspace.primary, minimized: workspace.minimized.filter((item) => item !== surface) } }] : [];
  }
  if (operation.operation === "primary" && operation.surface) return [{ type: "workspace.update", patch: { previousPrimary: workspace.primary, primary: operation.surface, secondary: workspace.secondary === operation.surface ? undefined : workspace.secondary, minimized: workspace.minimized.filter((item) => item !== operation.surface) } }];
  if (operation.operation === "secondary" && operation.surface) {
    const routeSurface = ["journal", "atmosphere", "memories"].includes(context.route) && !workspace.minimized.includes(context.route as StudioSurfaceId) ? context.route as StudioSurfaceId : undefined;
    const primary = workspace.primary ?? (routeSurface !== operation.surface ? routeSurface : undefined);
    return [{ type: "workspace.update", patch: { ...(primary ? { primary } : {}), secondary: operation.surface, minimized: workspace.minimized.filter((item) => item !== operation.surface) } }];
  }
  const targets = operation.surface ? [operation.surface] : [workspace.primary, workspace.secondary].filter(Boolean) as StudioSurfaceId[];
  return [{ type: "workspace.update", patch: {
    minimized: [...new Set([...workspace.minimized, ...targets])],
    ...(targets.includes(workspace.primary as StudioSurfaceId) ? { previousPrimary: workspace.primary, primary: undefined } : {}),
    ...(targets.includes(workspace.secondary as StudioSurfaceId) ? { secondary: undefined } : {}),
  } }];
}

function planOne(intent: StudioIntent, document: LifeDocument, context: LifeContext, now: Date, source: "voice" | "typed"): StudioCommandPlan {
  const at = now.toISOString();
  if ("journalSource" in intent && intent.journalSource === "memory") {
    const memory = activeMemory(document, context);
    const entry = document.studio.journalEntries.find(({ id }) => id === memory?.journalEntryId);
    if (!entry) return { status: "clarification", title: "Which source Journal should I use?", detail: "The memory's linked entry is unavailable. Nothing changed." };
    context = { ...context, activeJournalEntryId: entry.id };
  }
  if (intent.type === "ritual-configure") {
    const ritual = document.studio.rituals.find(({ name }) => name === "I'm home");
    if (!ritual) return { status: "clarification", title: "There is no Home ritual to edit.", detail: "Nothing was created or played." };
    const step = intent.operation === "step" ? homeRitualStep(document, intent.step) : undefined;
    if (intent.operation === "step" && intent.included && !step) return { status: "clarification", title: "That ritual step is unavailable.", detail: "The required saved atmosphere was not found. Nothing changed." };
    const patch = intent.operation === "enabled" ? { enabled: intent.enabled }
      : { steps: intent.included ? ritual.steps.some((item) => ritualStepKey(item) === intent.step) ? ritual.steps : [...ritual.steps, step!] : ritual.steps.filter((item) => ritualStepKey(item) !== intent.step) };
    return { status: "ready", actions: [{ type: "ritual.update", ritualId: ritual.id, patch }], summary: "Home ritual configuration updated. It has not been run.", runtimeCommands: [] };
  }
  if (intent.type === "journal-attach-photo" || intent.type === "journal-drawing-input" || intent.type === "journal-download-audio" || intent.type === "memory-export" || intent.type === "atmosphere-enable-sound") {
    const entry = activeJournal(document, context); const memory = activeMemory(document, context);
    if (intent.type === "journal-attach-photo" && !entry) return { status: "clarification", title: "Which entry should receive the photo?", detail: "Open an entry first. Nothing was attached." };
    if (intent.type === "journal-drawing-input" && !entry) return { status: "clarification", title: "Which entry should I open for drawing?", detail: "Open an entry first. Nothing was drawn." };
    if (intent.type === "journal-download-audio" && (!entry?.audioAssetId || !document.studio.mediaAssets.some(({ id, kind }) => id === entry.audioAssetId && kind === "journal-audio"))) return { status: "clarification", title: "No recording is attached.", detail: "Open an entry with original audio. No download was requested." };
    if (intent.type === "memory-export" && (!memory || !document.studio.journalEntries.some(({ id }) => id === memory.journalEntryId))) return { status: "clarification", title: "Which memory should I export?", detail: "Open a memory with its source entry first. No download was requested." };
    const continuation: NativeStudioContinuation = intent.type === "journal-attach-photo" ? { actionId: "journal.attach-original", entryId: entry!.id }
      : intent.type === "journal-drawing-input" ? { actionId: "journal.drawing-input", entryId: entry!.id }
      : intent.type === "journal-download-audio" ? { actionId: "journal.audio-download", entryId: entry!.id, assetId: entry!.audioAssetId! }
      : intent.type === "memory-export" ? { actionId: "memory.export", memoryId: memory!.id, format: intent.format } : { actionId: "atmosphere.enable-sound" };
    const display = nativeContinuationPresentation(continuation);
    return { status: "native-continuation", continuation, title: display.label, detail: display.detail, navigateTo: display.route, focusId: "entryId" in continuation ? continuation.entryId : intent.type === "memory-export" ? memory!.id : undefined };
  }
  if (intent.type === "journal-playback") {
    const entry = activeJournal(document, context);
    if (!entry?.audioAssetId) return { status: "clarification", title: "No recording is attached.", detail: "Open an entry with original audio. No recording was started." };
    if (intent.mode === "configure") {
      const { volume, playbackRate } = intent.settings;
      if (volume !== undefined && (!Number.isFinite(volume) || volume < 0 || volume > 1)) return { status: "clarification", title: "Choose a volume from zero to 100 percent.", detail: "Playback has not changed." };
      if (playbackRate !== undefined && (!Number.isFinite(playbackRate) || playbackRate < .25 || playbackRate > 4)) return { status: "clarification", title: "Choose a playback speed from 0.25 to 4 times.", detail: "Playback has not changed." };
      return { status: "ready", actions: [], summary: "Journal playback setting requested.", navigateTo: "journal", focusId: entry.id, runtimeCommands: [{ target: "journal-playback", entryId: entry.id, mode: "configure", settings: intent.settings }], contextPatch: { activeJournalEntryId: entry.id, topic: "journal" } };
    }
    const bookmark = intent.bookmarkOrdinal === undefined ? undefined : entry.bookmarks[intent.bookmarkOrdinal - 1];
    if (intent.bookmarkOrdinal !== undefined && !bookmark) return { status: "clarification", title: `There is no bookmark ${intent.bookmarkOrdinal}.`, detail: `This entry has ${entry.bookmarks.length} bookmarks. Playback has not changed.` };
    const positionMs = bookmark?.timestampMs ?? intent.positionMs;
    if (positionMs !== undefined && (positionMs < 0 || positionMs > entry.recordingDurationMs)) return { status: "clarification", title: "That position is outside this recording.", detail: `Choose a position from zero to ${entry.recordingDurationMs / 1000} seconds.` };
    return { status: "ready", actions: [], summary: "Journal playback requested.", navigateTo: "journal", focusId: entry.id, runtimeCommands: [{ target: "journal-playback", mode: intent.mode, entryId: entry.id, ...(positionMs !== undefined ? { positionMs } : {}) }], contextPatch: { activeJournalEntryId: entry.id, topic: "journal", ...(bookmark ? { selectedBookmarkId: bookmark.id } : {}), ...(positionMs !== undefined ? { journalPositionMs: positionMs } : {}) } };
  }
  if (intent.type === "studio-select" || intent.type === "studio-source-select") return planStudioSelection(intent, document, context, now.getTime(), activeJournal(document, context), activeMemory(document, context));
  if (intent.type === "journal-tags" || intent.type === "journal-clear-drawing") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "Which Journal entry should I edit?", detail: "Open or name the entry. Nothing changed." };
    if (intent.type === "journal-tags" && intent.preserveTags?.some((kept) => !entry.tags.some((tag) => tag.toLowerCase() === kept.toLowerCase()) || intent.tags.some((removed) => removed.toLowerCase() === kept.toLowerCase()))) return { status: "clarification", title: "Which tags should remain?", detail: "The removal conflicts with a tag you asked to keep. Nothing changed." };
    const actions: LifeAction[] = intent.type === "journal-clear-drawing" ? [{ type: "journal.drawing.replace", entryId: entry.id, strokes: [] }]
      : [{ type: "journal.update", entryId: entry.id, patch: { tags: intent.operation === "set" ? intent.tags : intent.operation === "add" ? [...new Set([...entry.tags, ...intent.tags])] : entry.tags.filter((tag) => !intent.tags.some((value) => value.toLowerCase() === tag.toLowerCase())) } }];
    return { status: "ready", actions, summary: intent.type === "journal-clear-drawing" ? "Journal drawing cleared." : "Journal tags updated.", focusId: entry.id, runtimeCommands: [], contextPatch: { activeJournalEntryId: entry.id, topic: "journal" } };
  }
  if (intent.type === "memory-edit" || intent.type === "memory-composition") {
    const memory = activeMemory(document, context);
    if (!memory) return { status: "clarification", title: "Which memory should I edit?", detail: "Open or name the memory. Nothing changed." };
    return { status: "ready", actions: [{ type: "memory.update", memoryId: memory.id, patch: intent.type === "memory-edit" ? { passage: intent.value } : { composition: intent.composition } }], summary: "Memory updated.", runtimeCommands: [], contextPatch: { activeMemoryId: memory.id, topic: "memory" } };
  }
  if (intent.type === "journal-delete" || intent.type === "journal-text-edit") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "There is no active Journal entry.", detail: "Open an entry first. No Calendar event was changed." };
    if (intent.type === "journal-delete") {
      const linked = document.studio.memories.filter(({ journalEntryId }) => journalEntryId === entry.id).length;
      return { status: "confirmation", title: `Delete ${entry.title}?`, detail: `The entry${linked ? ` and ${linked} linked ${linked === 1 ? "memory" : "memories"}` : ""} will be removed. Undo restores the entry and its media.`, actions: [{ type: "journal.delete", entryId: entry.id }], runtimeCommands: [{ target: "journal", mode: "discard", entryId: entry.id, stateCommitted: true }] };
    }
    if (intent.unit === "text") return { status: "ready", actions: [{ type: "journal.update", entryId: entry.id, patch: { text: intent.value ?? "" } }], summary: "Journal text updated.", focusId: entry.id, runtimeCommands: [], contextPatch: { activeJournalEntryId: entry.id, topic: "journal" } };
    const matches = intent.unit === "sentence" ? [...entry.text.matchAll(/[^.!?]+(?:[.!?]+|$)/g)] : [...entry.text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)];
    const selection = context.selectedJournalPassage?.trim();
    const selectedAt = selection ? entry.text.indexOf(selection) : -1;
    const selectionIsUnique = Boolean(selection && selectedAt >= 0 && entry.text.indexOf(selection, selectedAt + 1) < 0);
    const range = intent.target === "selection" ? selectionIsUnique ? matches.find((match) => match.index <= selectedAt && match.index + match[0].length >= selectedAt + selection!.length) : undefined : matches.at(-1);
    if (intent.operation !== "append" && !range) return { status: "clarification", title: intent.target === "selection" ? "Which paragraph should I change?" : `There is no last ${intent.unit}.`, detail: intent.target === "selection" ? "Select one unique paragraph in this entry. Nothing changed." : "Nothing was removed or changed." };
    const text = intent.operation === "append" ? `${entry.text}${entry.text ? "\n\n" : ""}${intent.value ?? ""}`
      : `${entry.text.slice(0, range!.index)}${intent.operation === "replace" ? `${range![0].match(/^\s*/)?.[0] ?? ""}${intent.value ?? ""}` : ""}${entry.text.slice(range!.index + range![0].length)}`.trimEnd();
    return { status: "ready", actions: [{ type: "journal.update", entryId: entry.id, patch: { text } }], summary: `Journal ${intent.unit} ${intent.operation === "remove" ? "removed" : "updated"}.`, focusId: entry.id, runtimeCommands: [], contextPatch: { activeJournalEntryId: entry.id, topic: "journal" } };
  }
  if (intent.type === "journal-create") {
    const id = uniqueLifeId(document, "journal", `${at}-${intent.initialText ?? "entry"}`);
    const title = intent.initialText ? intent.initialText.split(/\s+/).slice(0, 7).join(" ") : `Journal · ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(now)}`;
    const entry: JournalEntry = {
      id, kind: "journal-entry", title, text: intent.initialText ?? "", status: "draft", recordingState: "idle", recordingDurationMs: 0,
      photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: at, updatedAt: at,
    };
    return {
      status: "ready",
      actions: [{ type: "journal.create", entry }, { type: "workspace.update", patch: { previousPrimary: document.studio.workspace.primary, primary: "journal", secondary: document.studio.workspace.secondary === "journal" ? undefined : document.studio.workspace.secondary, minimized: document.studio.workspace.minimized.filter((item) => item !== "journal") } }],
      summary: "A new journal entry is open.", navigateTo: "journal", focusId: id,
      runtimeCommands: intent.beginRecording ? [{ target: "journal", mode: "start", entryId: id }] : [],
      contextPatch: { activeJournalEntryId: id, topic: "journal", voiceMode: "command" },
    };
  }
  if (intent.type === "journal-recording") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "Which journal entry?", detail: "Open or create an entry first." };
    if (intent.mode === "discard") {
      const actions: LifeAction[] = [
        { type: "journal.update", entryId: entry.id, patch: { recordingState: "idle", recordingDurationMs: 0, audioAssetId: undefined } },
        ...(entry.audioAssetId ? [{ type: "media.remove" as const, assetId: entry.audioAssetId }] : []),
      ];
      return { status: "confirmation", title: "Discard this recording?", detail: "The journal text remains. The original audio will be removed after confirmation.", actions, runtimeCommands: [{ target: "journal", mode: "discard", entryId: entry.id }] };
    }
    return { status: "ready", actions: [], summary: `${intent.mode[0]!.toUpperCase()}${intent.mode.slice(1)} journal recording.`, runtimeCommands: [{ target: "journal", mode: intent.mode, entryId: entry.id }], contextPatch: { activeJournalEntryId: entry.id, topic: "journal", voiceMode: intent.mode === "start" || intent.mode === "resume" ? "journal-longform" : "command" } };
  }
  if (intent.type === "journal-append") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "Which journal entry?", detail: "Open or create an entry first." };
    const position = Math.max(journalRuntimePosition(entry.id) ?? context.journalPositionMs ?? entry.recordingDurationMs, 0);
    const ranges = recordingTranscriptRanges(entry.id, intent.text, position, source);
    const segments = ranges.map((range, index) => ({ ...range, id: uniqueLifeId(document, "passage", `${entry.id}-${range.startMs}-${ranges.length > 1 ? `${index}-` : ""}${intent.text}`), source }));
    const segment = segments.at(-1)!;
    return { status: "ready", actions: segments.map((segment) => ({ type: "journal.segment.add", entryId: entry.id, segment })), summary: "Journal updated.", focusId: entry.id, runtimeCommands: [], contextPatch: { activeJournalEntryId: entry.id, topic: "journal", recentJournalSegment: { entryId: entry.id, segmentId: segment.id, text: segment.text, at: now.getTime() } } };
  }
  if (intent.type === "journal-bookmark") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "Which journal entry?", detail: "Open or create an entry first." };
    if (intent.anchor === "selection" && !context.selectedJournalPassage?.trim()) return { status: "clarification", title: "Which passage should I bookmark?", detail: "Select a passage or say bookmark what I just said. Nothing changed." };
    const recent = (intent.anchor === "last-sentence" ? lastJournalSentence(entry.text) : intent.anchor === "selection" ? context.selectedJournalPassage!.trim() : context.recentJournalSegment?.entryId === entry.id
      ? context.recentJournalSegment.text
      : entry.transcriptSegments.at(-1)?.text ?? entry.text.trim()) || undefined;
    if (intent.anchor === "last-sentence" && !recent) return { status: "clarification", title: "There is no last sentence to bookmark.", detail: "Nothing changed. Write or dictate a sentence first." };
    const timestampMs = Math.max(journalRuntimePosition(entry.id) ?? context.journalPositionMs ?? entry.recordingDurationMs, 0);
    const measured = [...entry.transcriptSegments].reverse().find((segment) => segment.alignment === "segment-estimate" && segment.text === recent && segment.endMs <= timestampMs);
    const bookmark = { id: uniqueLifeId(document, "bookmark", `${entry.id}-${timestampMs}-${recent ?? "moment"}`), timestampMs, ...(recent ? { transcriptAnchor: recent } : {}), ...(measured ? { range: { startMs: Math.max(0, measured.startMs - 350), endMs: measured.endMs, segmentIds: [measured.id] } } : {}), createdAt: at };
    return { status: "ready", actions: [{ type: "journal.bookmark.add", entryId: entry.id, bookmark }], summary: "Moment bookmarked.", focusId: entry.id, runtimeCommands: [], contextPatch: { activeJournalEntryId: entry.id, topic: "journal" } };
  }
  if (intent.type === "journal-save" || intent.type === "journal-rename") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "Which journal entry?", detail: "Open or name an entry first." };
    const patch = intent.type === "journal-save" ? { status: "saved" as const } : { title: intent.title };
    return { status: "ready", actions: [{ type: "journal.update", entryId: entry.id, patch }], summary: intent.type === "journal-save" ? "Journal saved." : `Journal renamed to ${intent.title}.`, focusId: entry.id, runtimeCommands: [], contextPatch: { activeJournalEntryId: entry.id, topic: "journal" } };
  }
  if (intent.type === "atmosphere-play") {
    const matches = matchAtmosphere(document, intent.query);
    if (matches.length !== 1) return { status: "clarification", title: matches.length ? "Which atmosphere?" : `I can't find “${intent.query}”.`, detail: matches.map(({ name }) => name).slice(0, 3).join(" · ") || "Open Atmosphere to shape or save one." };
    const preset = matches[0]!;
    const state: ActiveAtmosphere = { presetId: preset.id, playing: true, muted: false, masterVolume: preset.masterVolume, layers: cloneAtmosphereLayers(preset.layers) };
    return { status: "ready", actions: [{ type: "atmosphere.activate", state }, { type: "workspace.update", patch: { secondary: document.studio.workspace.primary === "atmosphere" ? undefined : "atmosphere", minimized: document.studio.workspace.minimized.filter((item) => item !== "atmosphere") } }], summary: `${preset.name} is playing.`, focusId: preset.id, runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
  }
  if (intent.type === "atmosphere-playback") {
    if (!document.studio.activeAtmosphere) return { status: "feedback", title: "No atmosphere is open", detail: "Play a saved atmosphere first." };
    const playing = intent.mode === "resume";
    return { status: "ready", actions: [{ type: "atmosphere.playback", playing, ...(intent.mode === "mute" ? { muted: true } : intent.mode === "resume" ? { muted: false } : {}) }], summary: intent.mode === "resume" ? "Atmosphere resumed." : intent.mode === "mute" ? "Atmosphere muted." : intent.mode === "pause" ? "Atmosphere paused." : "Atmosphere stopped.", runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
  }
  if (intent.type === "atmosphere-set") {
    if (!document.studio.activeAtmosphere) return { status: "clarification", title: "No atmosphere is open", detail: "Play a saved atmosphere first." };
    const min = intent.property === "volume" ? 0 : 0.2;
    const max = intent.property === "volume" ? 1 : 2;
    if (!Number.isFinite(intent.value) || intent.value < min || intent.value > max) return { status: "clarification", title: `Choose a ${intent.property} between ${min} and ${max}.`, detail: "No sound setting changed." };
    return { status: "ready", actions: [{ type: "atmosphere.layer.update", layerId: intent.layerId, patch: { [intent.property]: intent.value } }], summary: `${intent.layerId} ${intent.property} set to ${intent.value}.`, runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
  }
  if (intent.type === "atmosphere-adjust") {
    const active = activeState(document);
    if (!active) return { status: "feedback", title: "No atmosphere is open", detail: "Play a saved atmosphere first." };
    const targetLayers = intent.layerId ? active.layers.filter(({ id }) => id === intent.layerId) : active.layers;
    if (targetLayers.some(({ id }) => intent.excludedLayerIds?.includes(id))) return { status: "clarification", title: "That sound layer is also excluded", detail: "Name the layer that should change. Nothing changed." };
    const actions = targetLayers.map((layer): LifeAction => ({ type: "atmosphere.layer.update", layerId: layer.id, patch: amount(layer, intent.operation, intent.property) }));
    for (const id of intent.preserveAudibleLayerIds ?? []) {
      const current = active.layers.find((layer) => layer.id === id);
      const patch = actions.find((action) => action.type === "atmosphere.layer.update" && action.layerId === id);
      const proposed = current && { ...current, ...(patch?.type === "atmosphere.layer.update" ? patch.patch : {}) };
      if (!active.playing || active.muted || active.masterVolume <= 0 || !proposed?.enabled || proposed.volume <= 0) return { status: "clarification", title: `Keep ${id} available for playback?`, detail: "That layer would not remain enabled at a positive level. Nothing changed." };
    }
    return { status: "ready", actions, summary: intent.layerId ? `${targetLayers[0]?.label ?? "Layer"} adjusted.` : "Atmosphere softened.", runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
  }
  if (intent.type === "atmosphere-save") {
    const active = activeState(document);
    const named = intent.mode === "delete" && intent.name ? document.studio.atmospherePresets.filter(({ name }) => name.toLocaleLowerCase() === intent.name!.toLocaleLowerCase()) : undefined;
    if (named && named.length !== 1) return { status: "clarification", title: "Which atmosphere preset should I delete?", detail: named.length ? named.slice(0, 3).map(({ name }) => name).join(" · ") : "That named preset is unavailable. Nothing changed." };
    const preset = named?.[0] ?? (active && document.studio.atmospherePresets.find(({ id }) => id === active.presetId));
    if (!active || !preset) return { status: "feedback", title: "No atmosphere is open", detail: "Play or shape an atmosphere first." };
    if (intent.mode === "delete" && preset.builtIn) return { status: "feedback", title: "Keep the original atmosphere", detail: "Duplicate it first, then delete your own version." };
    if (intent.mode === "delete") return { status: "confirmation", title: `Delete ${preset.name}?`, detail: "The active sound will stop after confirmation.", actions: [{ type: "atmosphere.preset.delete", presetId: preset.id }], runtimeCommands: [] };
    if (intent.mode === "rename") {
      if (!intent.name) return { status: "clarification", title: "What should I call it?", detail: "Say the atmosphere name." };
      return { status: "ready", actions: [{ type: "atmosphere.preset.update", presetId: preset.id, patch: { name: intent.name } }], summary: `Atmosphere renamed to ${intent.name}.`, focusId: preset.id, runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
    }
    if (intent.name || intent.mode === "duplicate") {
      const name = intent.name ?? `${preset.name} copy`;
      const id = uniqueLifeId(document, "atmosphere", name);
      const copy = { ...preset, id, name, builtIn: false, layers: cloneAtmosphereLayers(active.layers), masterVolume: active.masterVolume, createdAt: at, updatedAt: at };
      return { status: "ready", actions: [{ type: "atmosphere.preset.create", preset: copy }, { type: "atmosphere.activate", state: { ...active, presetId: id } }], summary: `${name} saved.`, focusId: id, runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
    }
    return { status: "ready", actions: [{ type: "atmosphere.preset.update", presetId: preset.id, patch: { layers: cloneAtmosphereLayers(active.layers), masterVolume: active.masterVolume } }], summary: `${preset.name} saved.`, focusId: preset.id, runtimeCommands: [], contextPatch: { topic: "atmosphere" } };
  }
  if (intent.type === "memory-create") {
    const entry = activeJournal(document, context);
    if (!entry) return { status: "clarification", title: "Which journal entry should become a memory?", detail: "Open one entry first." };
    const sources = resolvedMemorySources(document, entry, context);
    const needsPhoto = intent.source === "photo" || intent.source === "photo-bookmark";
    const needsBookmark = intent.source === "bookmark" || intent.source === "photo-bookmark";
    const needsPassage = intent.source === "passage";
    if (needsPhoto && !sources.photoAssetId) return { status: "clarification", title: "Which photograph should I use?", detail: entry.photoAssetIds.length ? "Select one photograph in Journal, then make the memory." : "Attach a photograph first." };
    if (needsBookmark && !sources.bookmark) return { status: "clarification", title: "Which bookmarked moment should I use?", detail: entry.bookmarks.length ? "Select one mark on the timeline." : "Bookmark a moment first." };
    if (needsPassage && !sources.passage) return { status: "clarification", title: "Which passage should I use?", detail: "Name or select the words in the source Journal first." };
    // Creating from an entry grants whole-entry authority; replacing an
    // existing Memory with “this passage” does not. Keep the roles separate.
    const passage = sources.passage ?? (!needsPassage ? entry.text.trim() : undefined);
    if (!passage && !entry.photoAssetIds.length && !entry.bookmarks.length) return { status: "clarification", title: "What should the memory keep?", detail: "Add a passage, photograph, or bookmark first." };
    const id = uniqueLifeId(document, "memory", `${entry.title}-${at}`);
    const memory: MemoryArtifact = {
      id, kind: "memory", title: entry.title, journalEntryId: entry.id, composition: sources.photoAssetId ? "still" : sources.bookmark ? "voice" : "page",
      passage: passage || entry.bookmarks.at(-1)?.transcriptAnchor || entry.title,
      ...(sources.photoAssetId ? { photoAssetId: sources.photoAssetId } : {}),
      ...(sources.bookmark ? { bookmarkId: sources.bookmark.id, audioInMs: sources.bookmark.timestampMs } : { audioInMs: 0 }),
      showDate: true, datePlacement: "inline", textScale: 1, textOffset: { x: 0, y: 0 }, audioEnabled: Boolean(entry.audioAssetId && sources.bookmark), status: "draft", createdAt: at, updatedAt: at,
    };
    return { status: "ready", actions: [{ type: "memory.create", memory }, { type: "workspace.update", patch: { previousPrimary: document.studio.workspace.primary, primary: "memories", secondary: document.studio.workspace.primary === "journal" ? "journal" : document.studio.workspace.secondary, minimized: document.studio.workspace.minimized.filter((item) => item !== "memories") } }], summary: "A memory was composed from your journal.", navigateTo: "memories", focusId: id, runtimeCommands: [], contextPatch: { activeMemoryId: id, topic: "memory" } };
  }
  if (intent.type === "memory-source" || intent.type === "memory-audio-trim" || intent.type === "memory-update" || intent.type === "memory-save" || intent.type === "memory-playback") {
    const memory = activeMemory(document, context);
    if (!memory && intent.type === "memory-source") {
      const entry = activeJournal(document, context);
      if (!entry) return { status: "clarification", title: "Which journal entry?", detail: "Open one entry first." };
      const sources = resolvedMemorySources(document, entry, context);
      if ((intent.source === "photo" || intent.source === "photo-bookmark") && !sources.photoAssetId) return { status: "clarification", title: "Which photograph should I use?", detail: entry.photoAssetIds.length ? "Select one photograph in Journal." : "Attach a photograph first." };
      if ((intent.source === "bookmark" || intent.source === "photo-bookmark") && !sources.bookmark) return { status: "clarification", title: "Which bookmarked moment should I use?", detail: entry.bookmarks.length ? "Select one mark on the timeline." : "Bookmark a moment first." };
      if (intent.source === "passage" && !sources.passage) return { status: "clarification", title: "Which passage should I use?", detail: "Say “Replace the memory passage with…” and the exact words, or select words in the source Journal. Nothing changed." };
      return {
        status: "ready", actions: [], summary: "Memory source selected.", runtimeCommands: [], focusId: entry.id,
        contextPatch: {
          activeJournalEntryId: entry.id,
          topic: "journal",
          ...(intent.source === "photo" || intent.source === "photo-bookmark" ? { selectedPhotoAssetId: sources.photoAssetId } : {}),
          ...(intent.source === "bookmark" || intent.source === "photo-bookmark" ? { selectedBookmarkId: sources.bookmark?.id } : {}),
          ...(intent.source === "passage" ? { selectedJournalPassage: sources.passage } : {}),
        },
      };
    }
    if (!memory) return { status: "clarification", title: "Which memory?", detail: "Open or create one first." };
    if (intent.type === "memory-update" && intent.requireAudioEnabled && !memory.audioEnabled) return { status: "clarification", title: "The voice is not currently included", detail: "Restore the voice first, or request only the text change. Nothing changed." };
    const entry = document.studio.journalEntries.find(({ id }) => id === memory.journalEntryId);
    if (!entry) return { status: "clarification", title: "The source journal is missing", detail: "Nothing changed." };
    if (intent.type === "memory-source") {
      const sources = resolvedMemorySources(document, entry, context);
      if ((intent.source === "photo" || intent.source === "photo-bookmark") && !sources.photoAssetId) return { status: "clarification", title: "Which photograph should I use?", detail: entry.photoAssetIds.length ? "Select one photograph in Journal." : "Attach a photograph to the source journal first." };
      if ((intent.source === "bookmark" || intent.source === "photo-bookmark") && !sources.bookmark) return { status: "clarification", title: "Which bookmarked moment should I use?", detail: entry.bookmarks.length ? "Select one mark on the Journal timeline." : "Bookmark a moment in the source journal first." };
      if (intent.source === "passage" && !sources.passage) return { status: "clarification", title: "Which passage should I use?", detail: "Say “Replace the memory passage with…” and the exact words, or select words in the source Journal. Nothing changed." };
      const patch = {
        ...(intent.source === "photo" || intent.source === "photo-bookmark" ? { photoAssetId: sources.photoAssetId } : {}),
        ...(intent.source === "bookmark" || intent.source === "photo-bookmark" ? { bookmarkId: sources.bookmark?.id, audioInMs: sources.bookmark?.timestampMs ?? 0, audioEnabled: Boolean(entry.audioAssetId) } : {}),
        ...(intent.source === "passage" ? { passage: sources.passage } : {}),
      };
      return { status: "ready", actions: [{ type: "memory.update", memoryId: memory.id, patch }], summary: "Memory source updated.", focusId: memory.id, runtimeCommands: [], contextPatch: { activeMemoryId: memory.id, topic: "memory" } };
    }
    if (intent.type === "memory-audio-trim") {
      const nextIn = intent.edge === "in" ? Math.max(0, memory.audioInMs + intent.deltaMs) : memory.audioInMs;
      const currentOut = memory.audioOutMs ?? Math.max(entry.recordingDurationMs, memory.audioInMs + 15_000);
      const nextOut = intent.edge === "out" ? Math.max(nextIn + 500, currentOut + intent.deltaMs) : Math.max(currentOut, nextIn + 500);
      return { status: "ready", actions: [{ type: "memory.update", memoryId: memory.id, patch: { audioInMs: nextIn, audioOutMs: nextOut } }], summary: "Voice excerpt adjusted.", focusId: memory.id, runtimeCommands: [], contextPatch: { activeMemoryId: memory.id, topic: "memory" } };
    }
    if (intent.type === "memory-playback") {
      const entry = document.studio.journalEntries.find(({ id }) => id === memory.journalEntryId);
      if (!entry?.audioAssetId || !memory.audioEnabled) return { status: "clarification", title: "No playable voice is enabled for this memory.", detail: "Restore its original voice or open a memory with audio. Nothing changed." };
      return { status: "ready", actions: [], summary: `Playback requested for ${memory.title}.`, navigateTo: "memories", focusId: memory.id, runtimeCommands: [{ target: "memory", mode: intent.mode, memoryId: memory.id }], contextPatch: { activeMemoryId: memory.id, topic: "memory" } };
    }
    if (intent.type === "memory-update" && intent.property === "photo") {
      const sources = resolvedMemorySources(document, entry, context);
      if (intent.operation === "show" && !sources.photoAssetId) return { status: "clarification", title: "Which photograph should I restore?", detail: entry.photoAssetIds.length ? "Select one photograph in Journal." : "The source journal has no photograph." };
      return { status: "ready", actions: [{ type: "memory.update", memoryId: memory.id, patch: { photoAssetId: intent.operation === "show" ? sources.photoAssetId : undefined } }], summary: intent.operation === "show" ? "Photograph restored." : "Photograph removed from this memory.", focusId: memory.id, runtimeCommands: [], contextPatch: { activeMemoryId: memory.id, topic: "memory" } };
    }
    const patch = intent.type === "memory-save" ? { status: "saved" as const } : memoryPatch(memory, intent);
    return { status: "ready", actions: [{ type: "memory.update", memoryId: memory.id, patch }], summary: intent.type === "memory-save" ? "Memory saved." : "Memory adjusted.", focusId: memory.id, runtimeCommands: [], contextPatch: { activeMemoryId: memory.id, topic: "memory" } };
  }
  if (intent.type === "workspace") {
    const actions = workspaceActions(document, intent, context);
    const routeSurface = ["journal", "atmosphere", "memories"].includes(context.route) ? context.route as StudioSurfaceId : undefined;
    const puttingAwayVisibleSurface = intent.operation === "put-away" && (!intent.surface || intent.surface === routeSurface);
    const navigateTo = intent.operation === "primary" ? intent.surface
      : intent.operation === "restore" ? intent.surface ?? document.studio.workspace.previousPrimary
        : puttingAwayVisibleSurface ? "home" : undefined;
    return actions.length ? { status: "ready", actions, summary: intent.operation === "show-less" ? "The studio is quieter." : intent.operation === "show-more" ? "Studio controls restored." : "Studio rearranged.", ...(navigateTo ? { navigateTo } : {}), runtimeCommands: [], contextPatch: { topic: "workspace" } } : { status: "feedback", title: "Nothing to restore", detail: "Open a studio surface first." };
  }
  if (intent.type === "ritual-home") {
    const ritual = document.studio.rituals.find(({ name }) => name.toLowerCase() === "i'm home");
    if (!ritual?.enabled) return { status: "feedback", title: "“I'm home” is not enabled", detail: "Open Journal and enable the editable home ritual first. Nothing changed." };
    const actions: LifeAction[] = [];
    for (const step of ritual.steps) {
      if (step.type === "atmosphere.play") {
        const preset = document.studio.atmospherePresets.find(({ id }) => id === step.presetId);
        if (preset) actions.push({ type: "atmosphere.activate", state: { presetId: preset.id, playing: true, muted: false, masterVolume: preset.masterVolume, layers: cloneAtmosphereLayers(preset.layers) } });
      }
      if (step.type === "workspace.open") actions.push({ type: "workspace.update", patch: step.placement === "primary" ? { primary: step.surface } : { secondary: step.surface } });
      if (step.type === "workspace.showLess") actions.push({ type: "workspace.update", patch: { quiet: true } });
    }
    return { status: "ready", actions, summary: "Welcome home.", navigateTo: "home", runtimeCommands: [], contextPatch: { topic: "ritual" } };
  }
  return { status: "feedback", title: "That studio action is not available", detail: "Nothing changed." };
}

export function planStudioCommand(intent: StudioIntent, document: LifeDocument, context: LifeContext, now: Date, source: "voice" | "typed" = "typed"): StudioCommandPlan {
  if (intent.type !== "studio-compound") return planOne(intent, document, context, now, source);
  let working = document;
  let workingContext = context;
  const actions: LifeAction[] = [];
  const runtimeCommands: StudioRuntimeCommand[] = [];
  let navigateTo: LifeRoute | undefined;
  let focusId: string | undefined;
  const confirmations: { title: string; detail: string }[] = [];
  for (const step of intent.steps as StudioPlanStep[]) {
    if (step.type === "navigate") {
      navigateTo = step.route;
      if (["journal", "atmosphere", "memories"].includes(step.route)) {
        const surface = step.route as StudioSurfaceId;
        const placement: LifeAction = { type: "workspace.update", patch: {
          previousPrimary: working.studio.workspace.primary,
          primary: surface,
          secondary: working.studio.workspace.secondary === surface ? undefined : working.studio.workspace.secondary,
          minimized: working.studio.workspace.minimized.filter((item) => item !== surface),
        } };
        const placed = applyLifeTransaction(working, [placement], () => now);
        if (placed.status !== "success") return { status: "clarification", title: placed.title, detail: placed.detail };
        working = placed.document;
        actions.push(placement);
      }
      continue;
    }
    const planned = planOne(step, working, workingContext, now, source);
    if (planned.status === "native-continuation") return { status: "clarification", title: "Complete the browser action separately.", detail: "Choosing a local file or exporting needs its own native continuation. No part of this compound request changed your data." };
    if (planned.status !== "ready" && planned.status !== "confirmation") return planned;
    if (planned.status === "confirmation") confirmations.push({ title: planned.title, detail: planned.detail });
    if (planned.actions.length) {
      const applied = applyLifeTransaction(working, planned.actions, () => now);
      if (applied.status !== "success") return { status: "clarification", title: applied.title, detail: applied.detail };
      working = applied.document; actions.push(...planned.actions);
    }
    runtimeCommands.push(...planned.runtimeCommands);
    if (planned.status === "ready") {
      navigateTo = planned.navigateTo ?? navigateTo;
      focusId = planned.focusId ?? focusId;
      workingContext = { ...workingContext, ...planned.contextPatch };
    }
  }
  if (confirmations.length) return { status: "confirmation", title: confirmations.map(({ title }) => title).join(" "), detail: `${confirmations.map(({ detail }) => detail).join(" ")} The entire request is applied together after confirmation.`, actions, runtimeCommands };
  return { status: "ready", actions, summary: "Studio updated.", ...(navigateTo ? { navigateTo } : {}), ...(focusId ? { focusId } : {}), runtimeCommands, contextPatch: workingContext };
}
