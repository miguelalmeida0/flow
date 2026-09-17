import type { LifeDocument, LifeRoute } from "../../domain/life-model";

export type NativeStudioIntent =
  | { type: "journal-attach-photo" }
  | { type: "journal-drawing-input" }
  | { type: "journal-download-audio" }
  | { type: "memory-export"; format: "still" | "project" }
  | { type: "atmosphere-enable-sound" };

export type NativeStudioContinuation =
  | { actionId: "journal.attach-original"; entryId: string }
  | { actionId: "journal.drawing-input"; entryId: string }
  | { actionId: "journal.audio-download"; entryId: string; assetId: string }
  | { actionId: "memory.export"; memoryId: string; format: "still" | "project" }
  | { actionId: "atmosphere.enable-sound" };

export function parseNativeStudioCapability(text: string): NativeStudioIntent | null {
  if (/^(?:draw (?:on|in) (?:this |the )?(?:journal(?: entry)?|entry)|(?:open|focus) (?:the |this )?(?:journal |margin )?sketch)$/.test(text)) return { type: "journal-drawing-input" };
  if (/^(?:download|export) (?:the |this )?(?:original |journal )?(?:audio|recording)$/.test(text) || text === "download original audio") return { type: "journal-download-audio" };
  if (/^(?:attach|add|choose|upload) (?:an? |the )?(?:original )?photo(?:graph)?(?: to (?:this |the )?(?:journal |journal entry|entry))?$/.test(text) || text === "attach original") return { type: "journal-attach-photo" };
  const exportRequest = text.match(/^export (?:this memory as (?:an? )?|(?:the |this )?memory )?(still(?: image)?|project)$/);
  if (exportRequest) return { type: "memory-export", format: exportRequest[1]!.startsWith("still") ? "still" : "project" };
  if (/^(?:enable|unlock) (?:the |atmosphere )?(?:sound|audio)$/.test(text)) return { type: "atmosphere-enable-sound" };
  return null;
}

export function nativeContinuationPresentation(request: NativeStudioContinuation): { label: string; route: LifeRoute; detail: string } {
  if (request.actionId === "journal.drawing-input") return { label: "Focus sketch", route: "journal", detail: "The entry's sketch is ready for your pointer or pen. No strokes have been drawn." };
  if (request.actionId === "journal.audio-download") return { label: "Download audio", route: "journal", detail: "Use Download audio to request the original stored recording. No download has been requested yet." };
  if (request.actionId === "journal.attach-original") return { label: "Choose photo", route: "journal", detail: "Choose an original image using the browser file control. Nothing has been attached yet." };
  if (request.actionId === "memory.export") return { label: request.format === "still" ? "Export still" : "Export project", route: "memories", detail: "The export is ready. Use the export control to request the download; no file has been downloaded yet." };
  return { label: "Enable sound", route: "atmosphere", detail: "Use Enable sound to unlock browser audio. The mix has not changed." };
}

export function nativeContinuationAvailable(request: NativeStudioContinuation, document: LifeDocument): boolean {
  if (request.actionId === "journal.drawing-input") return document.studio.journalEntries.some(({ id }) => id === request.entryId);
  if (request.actionId === "journal.audio-download") return document.studio.journalEntries.some(({ id, audioAssetId }) => id === request.entryId && audioAssetId === request.assetId)
    && document.studio.mediaAssets.some(({ id, kind }) => id === request.assetId && kind === "journal-audio");
  if (request.actionId === "journal.attach-original") return document.studio.journalEntries.some(({ id }) => id === request.entryId);
  if (request.actionId === "memory.export") {
    const memory = document.studio.memories.find(({ id }) => id === request.memoryId);
    return Boolean(memory && document.studio.journalEntries.some(({ id }) => id === memory.journalEntryId));
  }
  return true;
}
