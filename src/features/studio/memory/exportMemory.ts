import type { JournalEntry, MemoryArtifact } from "../../../domain/studio-model";
import { getStudioMedia } from "../mediaRepository";
import { downloadStudioBlob as download } from "../downloadStudioBlob";

function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > width && line) { lines.push(line); line = word; }
    else line = next;
  }
  if (line) lines.push(line); return lines.slice(0, 9);
}

export async function exportMemoryStill(memory: MemoryArtifact, entry: JournalEntry) {
  const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 1200;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas export is unavailable.");
  context.fillStyle = memory.composition === "page" ? "#EFE6D6" : "#151816"; context.fillRect(0, 0, canvas.width, canvas.height);
  if (memory.photoAssetId) {
    const blob = await getStudioMedia(memory.photoAssetId);
    if (blob) {
      const bitmap = await createImageBitmap(blob);
      const scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const width = bitmap.width * scale; const height = bitmap.height * scale;
      context.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height); bitmap.close();
      if (memory.composition !== "page") { context.fillStyle = "rgba(0,0,0,.58)"; context.fillRect(0, 620, 1600, 580); }
    }
  }
  context.fillStyle = memory.composition === "page" ? "#27312C" : "#F4EFE5";
  context.font = `${Math.round(68 * memory.textScale)}px Georgia, serif`;
  const lines = wrap(context, memory.passage, 1320); const lineHeight = 86 * memory.textScale;
  const startY = Math.min(1060 - lines.length * lineHeight, memory.composition === "page" ? 260 : 690) + memory.textOffset.y * 3;
  lines.forEach((line, index) => context.fillText(line, 140 + memory.textOffset.x * 3, startY + index * lineHeight));
  if (memory.showDate) {
    context.font = "26px system-ui";
    context.fillStyle = memory.composition === "page" ? "#806F5D" : "#D8D0C8";
    const date = new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(new Date(entry.createdAt));
    const dateX = memory.datePlacement === "corner" ? canvas.width - context.measureText(date).width - 72 : 140;
    context.fillText(date, dateX, memory.datePlacement === "corner" ? 76 : 1100);
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Export failed.")), "image/png"));
  download(blob, `${memory.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "flow-memory"}.png`);
}

export function exportMemoryProject(memory: MemoryArtifact) {
  download(new Blob([JSON.stringify({ format: "flow-memory", version: 1, memory }, null, 2)], { type: "application/json" }), `${memory.id}.flow-memory.json`);
}
