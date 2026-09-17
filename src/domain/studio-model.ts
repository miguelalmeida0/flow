import type { VoiceMarker } from "./friends-model";

export type StudioSurfaceId = "journal" | "atmosphere" | "memories";

export type StudioMediaKind = "journal-audio" | "voice-note-audio" | "shared-clip" | "journal-photo" | "memory-export";

export interface StudioMediaAsset {
  id: string;
  kind: StudioMediaKind;
  name: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface JournalTranscriptSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  source: "voice" | "typed";
  alignment?: "segment-estimate" | "untimed";
}

export interface JournalBookmark {
  id: string;
  timestampMs: number;
  transcriptAnchor?: string;
  createdAt: string;
  range?: { startMs: number; endMs: number; segmentIds: string[] };
}

export interface JournalDrawingStroke {
  id: string;
  color: "ink" | "tide" | "clay" | "ochre";
  points: Array<{ x: number; y: number }>;
}

export interface JournalEntry {
  id: string;
  kind: "journal-entry";
  title: string;
  text: string;
  status: "draft" | "saved";
  recordingState: "idle" | "recording" | "paused" | "interrupted";
  recordingDurationMs: number;
  audioAssetId?: string;
  photoAssetIds: string[];
  bookmarks: JournalBookmark[];
  markers?: VoiceMarker[];
  transcriptSegments: JournalTranscriptSegment[];
  drawings: JournalDrawingStroke[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type AtmosphereLayerId = "texture" | "rain" | "tone" | "pulse";

export interface AtmosphereLayer {
  id: AtmosphereLayerId;
  label: string;
  volume: number;
  enabled: boolean;
  character: number;
  rate: number;
}

export interface AtmospherePreset {
  id: string;
  kind: "atmosphere";
  name: string;
  layers: AtmosphereLayer[];
  masterVolume: number;
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveAtmosphere {
  presetId: string;
  playing: boolean;
  muted: boolean;
  masterVolume: number;
  layers: AtmosphereLayer[];
}

export type MemoryComposition = "still" | "page" | "voice";

export interface MemoryArtifact {
  id: string;
  kind: "memory";
  title: string;
  journalEntryId: string;
  composition: MemoryComposition;
  passage: string;
  photoAssetId?: string;
  bookmarkId?: string;
  showDate: boolean;
  datePlacement: "inline" | "corner";
  textScale: number;
  textOffset: { x: number; y: number };
  audioEnabled: boolean;
  audioInMs: number;
  audioOutMs?: number;
  status: "draft" | "saved";
  createdAt: string;
  updatedAt: string;
  personIds?: string[];
  groupId?: string;
  calendarEventId?: string;
  recordingMoment?: { kind: "journal" | "voice-note"; recordingId: string; markerId: string };
}

export type RitualStep =
  | { type: "atmosphere.play"; presetId: string }
  | { type: "workspace.open"; surface: StudioSurfaceId; placement: "primary" | "secondary" }
  | { type: "workspace.showLess" };

export interface RitualDefinition {
  id: string;
  kind: "ritual";
  name: string;
  enabled: boolean;
  steps: RitualStep[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceSurfaceState {
  primary?: StudioSurfaceId;
  secondary?: StudioSurfaceId;
  minimized: StudioSurfaceId[];
  previousPrimary?: StudioSurfaceId;
  quiet: boolean;
}

export interface StudioState {
  journalEntries: JournalEntry[];
  mediaAssets: StudioMediaAsset[];
  atmospherePresets: AtmospherePreset[];
  activeAtmosphere?: ActiveAtmosphere;
  memories: MemoryArtifact[];
  rituals: RitualDefinition[];
  workspace: WorkspaceSurfaceState;
}

const DEFAULT_LAYERS: AtmosphereLayer[] = [
  { id: "texture", label: "Room", volume: 0.2, enabled: true, character: 0.42, rate: 1 },
  { id: "rain", label: "Rain", volume: 0.32, enabled: true, character: 0.58, rate: 1 },
  { id: "tone", label: "Tonal bed", volume: 0.18, enabled: true, character: 0.36, rate: 1 },
  { id: "pulse", label: "Pulse", volume: 0.08, enabled: true, character: 0.28, rate: 0.72 },
];

export function cloneAtmosphereLayers(layers: readonly AtmosphereLayer[] = DEFAULT_LAYERS) {
  return layers.map((layer) => ({ ...layer }));
}

export function createInitialStudioState(now = "2026-01-01T00:00:00.000Z"): StudioState {
  const sundayEvening: AtmospherePreset = {
    id: "atmosphere-sunday-evening",
    kind: "atmosphere",
    name: "Sunday evening",
    layers: cloneAtmosphereLayers(),
    masterVolume: 0.55,
    builtIn: true,
    createdAt: now,
    updatedAt: now,
  };
  return {
    journalEntries: [],
    mediaAssets: [],
    atmospherePresets: [sundayEvening],
    memories: [],
    rituals: [{
      id: "ritual-im-home",
      kind: "ritual",
      name: "I'm home",
      enabled: false,
      steps: [
        { type: "atmosphere.play", presetId: sundayEvening.id },
        { type: "workspace.open", surface: "journal", placement: "secondary" },
        { type: "workspace.showLess" },
      ],
      createdAt: now,
      updatedAt: now,
    }],
    workspace: { minimized: [], quiet: false },
  };
}
