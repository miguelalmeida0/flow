import type { LifeDocument } from "../../domain/life-model";
import { exportMemoryProject, exportMemoryStill } from "./memory/exportMemory";
import { nativeContinuationAvailable, type NativeStudioContinuation } from "./nativeStudioCapability";
import { getStudioMedia } from "./mediaRepository";
import { downloadStudioBlob, originalAudioFilename } from "./downloadStudioBlob";

/** Browser-only continuation, invoked by a visible user gesture, never by
 * recognition, interpretation, a scheduler, or spoken confirmation. */
export async function performNativeStudioContinuation(request: NativeStudioContinuation, current: LifeDocument, isCurrent: () => boolean = () => true): Promise<string> {
  if (!nativeContinuationAvailable(request, current)) throw new Error("That source is no longer available. Nothing was attached or exported.");
  if (request.actionId === "journal.drawing-input") {
    const editor = [...document.querySelectorAll<HTMLElement>("[data-journal-entry-id]")].find((node) => node.dataset.journalEntryId === request.entryId);
    const pad = editor?.querySelector<SVGSVGElement>('[data-action-id="journal.drawing-input"]');
    if (!pad) throw new Error("Open the selected entry and use its sketch. No strokes were drawn.");
    pad.focus({ preventScroll: true });
    return "The sketch is focused. Draw with your pointer or pen; no strokes are created by this command.";
  }
  if (request.actionId === "journal.audio-download") {
    const asset = current.studio.mediaAssets.find(({ id }) => id === request.assetId)!;
    const blob = await getStudioMedia(request.assetId);
    if (!isCurrent()) throw new Error("That audio request was superseded. No download was requested.");
    if (!blob || !blob.size) throw new Error("The original recording is unavailable on this device. No download was requested.");
    downloadStudioBlob(blob, originalAudioFilename(asset.name, blob.type || asset.mimeType));
    return "The original audio download was requested. Check your browser's downloads; the stored recording is unchanged.";
  }
  if (request.actionId === "journal.attach-original") {
    const editor = [...document.querySelectorAll<HTMLElement>("[data-journal-entry-id]")].find((node) => node.dataset.journalEntryId === request.entryId);
    const picker = editor?.querySelector<HTMLInputElement>('input[type="file"][data-flow-action="Attach original"]');
    if (!picker) throw new Error("Open the selected Journal entry and use Attach original. Nothing was attached.");
    picker.click();
    return "Choose an image in the browser file picker. Attachment completes only after the image is stored locally.";
  }
  if (request.actionId === "memory.export") {
    const memory = current.studio.memories.find(({ id }) => id === request.memoryId)!;
    const entry = current.studio.journalEntries.find(({ id }) => id === memory.journalEntryId)!;
    if (request.format === "still") await exportMemoryStill(memory, entry);
    else exportMemoryProject(memory);
    return "The download was requested. Check your browser's downloads for the exported file.";
  }
  window.dispatchEvent(new CustomEvent("flow-studio-audio-unlock"));
  return "Browser audio unlock requested. The Atmosphere sound control shows whether it succeeded.";
}
