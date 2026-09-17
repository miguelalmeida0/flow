import slots from "./legacyMemorySlots.json";
import type { GlobalIntent } from "../../shared/command/globalInterpreter";
import type { SemanticExpectation } from "./semanticExpectation";
import type { MemoryArtifact } from "../../domain/studio-model";

interface MemoryDeclaration { text: string; line: number; intent: GlobalIntent["type"]; semantic: SemanticExpectation; fixtureId: "legacy-memory" }
export const legacyMemoryContracts = new Map<string, MemoryDeclaration>();
const base = { feedbackPhase: "completed", noCreation: true, noPending: true } as const;
for (const tuple of slots.trimRows) {
  const [id, line, text, edge, deltaMs, audioInMs, audioOutMs, historyDelta] = tuple as [string, number, string, "in" | "out", number, number, number, number];
  const patch = { audioInMs, audioOutMs };
  legacyMemoryContracts.set(id, { text, line, intent: "memory-audio-trim", fixtureId: "legacy-memory", semantic: { ...base, historyDelta, commitCount: historyDelta,
    intent: { type: "memory-audio-trim", edge, deltaMs }, actions: [{ type: "memory.update", memoryId: "memory-curated", patch }], memoryChanges: [{ id: "memory-curated", patch }] } });
}
for (const row of slots.editRows) {
  const intent = row.intent as GlobalIntent;
  const patch = Object.fromEntries(Object.entries(row.patch ?? {}).map(([key, value]) => [key, value === "$ABSENT" ? undefined : value])) as Partial<MemoryArtifact>;
  const semantic: SemanticExpectation = { ...base, historyDelta: row.historyDelta, commitCount: row.historyDelta, intent };
  if (row.recipe === "ROOT_CLARIFICATION") Object.assign(semantic, { feedbackPhase: "clarification", feedback: { title: "Which passage should I use?" }, actions: [] });
  else if (intent.type === "memory-playback") Object.assign(semantic, { actions: [], runtimeCommands: [{ target: "memory", memoryId: "memory-curated", mode: intent.mode }] });
  else Object.assign(semantic, { actions: [{ type: "memory.update", memoryId: "memory-curated", patch }], memoryChanges: [{ id: "memory-curated", patch }] });
  legacyMemoryContracts.set(row.id, { text: row.utterance, line: row.idLine, intent: intent.type, fixtureId: "legacy-memory", semantic });
}
