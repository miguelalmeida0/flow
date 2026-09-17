/** Requests a download of the supplied original bytes. It cannot verify that
 * the browser or operating system saved a file. Called only by user actions. */
export function downloadStudioBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 500); }
}

export function originalAudioFilename(name: string, mimeType: string) {
  const clean = Array.from(name, (character) => character.charCodeAt(0) < 32 || "/\\:".includes(character) ? "-" : character).join("").trim() || "Original recording";
  if (/\.[a-z0-9]{2,5}$/i.test(clean)) return clean;
  const extensions: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/mpeg": "mp3" };
  return `${clean}.${extensions[mimeType.split(";")[0]!] ?? "audio"}`;
}
