import slots from "./legacyAtmosphereSlots.json";
import fixture from "./legacyAtmosphereFixture.json";
import type { AtmosphereLayerId, AtmospherePreset, ActiveAtmosphere } from "../../domain/studio-model";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import type { SemanticExpectation } from "./semanticExpectation";

interface Declaration { text: string; line: number; intent: GlobalIntent["type"]; semantic: SemanticExpectation; fixtureId: "legacy-atmosphere"; playingPreset?: AtmospherePreset }
export const legacyAtmosphereContracts = new Map<string, Declaration>();
const preset = fixture.preset as AtmospherePreset, active = fixture.active as ActiveAtmosphere;
const base = { historyDelta: 1, commitCount: 1, feedbackPhase: "completed", noPending: true, noCreation: true, runtimeCommands: [] } satisfies SemanticExpectation;
for (const tuple of slots.playRows) {
  const [id, line, text, name, presetId] = tuple as [string, number, string, string, string];
  const playingPreset: AtmospherePreset = presetId === preset.id ? structuredClone(preset) : { ...structuredClone(preset), id: presetId, name, builtIn: false, createdAt: fixture.clock, updatedAt: fixture.clock };
  const state = { ...structuredClone(active), presetId };
  legacyAtmosphereContracts.set(id, { text, line, intent: "atmosphere-play", fixtureId: "legacy-atmosphere", playingPreset, semantic: { ...base,
    intent: { type: "atmosphere-play", query: name.toLowerCase() }, actions: [{ type: "atmosphere.activate", state }, { type: "workspace.update", patch: { secondary: "atmosphere", minimized: [] } }],
    studioState: { workspace: { minimized: [], quiet: false, secondary: "atmosphere" } } } });
}
for (const tuple of slots.adjustRows) {
  const [id, line, text, layerId, property, operation, afterValue, historyDelta] = tuple as [string, number, string, AtmosphereLayerId | "*", "volume" | "rate" | "enabled", "increase" | "decrease" | "remove" | "restore", number | boolean | number[], number];
  const layers = layerId === "*" ? active.layers : active.layers.filter(({ id }) => id === layerId);
  const changes = layers.map(({ id }, index) => ({ id, patch: { [property]: Array.isArray(afterValue) ? afterValue[index] : afterValue } }));
  legacyAtmosphereContracts.set(id, { text, line, intent: "atmosphere-adjust", fixtureId: "legacy-atmosphere", semantic: { ...base, historyDelta, commitCount: historyDelta,
    intent: { type: "atmosphere-adjust", property, operation, ...(layerId !== "*" ? { layerId } : {}) }, layerChanges: changes,
    actions: changes.map(({ id, patch }) => ({ type: "atmosphere.layer.update", layerId: id, patch })) } });
}
for (const tuple of slots.saveRows) {
  const [id, line, text, recipe, name, targetId, historyDelta] = tuple as [string, number, string, string, string, string, number];
  const created: AtmospherePreset = { ...structuredClone(preset), id: targetId, name, builtIn: false, createdAt: fixture.clock, updatedAt: fixture.clock };
  const renamed = { ...structuredClone(preset), name, updatedAt: historyDelta ? fixture.clock : preset.updatedAt };
  const saveAs = recipe === "SAVEAS";
  legacyAtmosphereContracts.set(id, { text, line, intent: "atmosphere-save", fixtureId: "legacy-atmosphere", semantic: { ...base, historyDelta, commitCount: historyDelta, noCreation: !saveAs,
    intent: { type: "atmosphere-save", name, mode: saveAs ? "save" : "rename" },
    actions: saveAs ? [{ type: "atmosphere.preset.create", preset: created }, { type: "atmosphere.activate", state: { ...active, presetId: targetId } }] : [{ type: "atmosphere.preset.update", presetId: targetId, patch: { name } }],
    studioCollections: { atmospherePresets: saveAs ? [preset, created] : [renamed] }, ...(saveAs ? { studioState: { activeAtmosphere: { ...active, presetId: targetId } } } : {}) } });
}
for (const row of slots.playbackRows) {
  legacyAtmosphereContracts.set(row.id, { text: row.utterance, line: row.idLine, intent: "atmosphere-playback", fixtureId: "legacy-atmosphere", semantic: { ...base, historyDelta: row.historyDelta, commitCount: row.historyDelta,
    intent: { type: "atmosphere-playback", mode: row.mode as "mute" | "resume" | "stop" | "pause" }, actions: [{ type: "atmosphere.playback", ...row.actionPatch }],
    studioState: { activeAtmosphere: { ...active, playing: row.afterPlaying, muted: row.afterMuted } } } });
}
