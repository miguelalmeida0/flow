import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import { uniqueLifeId } from "../../../domain/life-factories";
import type { JournalEntry, StudioMediaAsset } from "../../../domain/studio-model";
import { WorldPageShell, warmButton, warmCard, warmField, warmQuietButton } from "../../../shared/design-system/WorldPageShell";
import { useStudioRuntime } from "../StudioRuntimeProvider";
import { putStudioMedia, retainStudioMedia } from "../mediaRepository";
import { useStudioMediaUrl } from "../useStudioMediaUrl";
import { JournalDrawingPad } from "./JournalDrawingPad";
import { JournalTimeline } from "./JournalTimeline";
import { HomeRitualEditor } from "./HomeRitualEditor";
import { useStudioPlayback } from "../useStudioPlayback";
import { RecordingMoments } from "../RecordingMoments";
import { journalVoiceMarkers } from "../journalMarkers";

function timeLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function JournalPhoto({ assetId, name, onRemove, onSelect, selected }: { assetId: string; name: string; onRemove: () => void; onSelect: () => void; selected: boolean }) {
  const { url, missing } = useStudioMediaUrl(assetId);
  return <figure className={`group relative overflow-hidden rounded-[20px] border-2 bg-[#E8DFD1] ${selected ? "border-[#7EA7A4]" : "border-transparent"}`}>
    {url ? <img alt={name} className="aspect-[4/3] w-full object-contain" src={url} /> : <div className="grid aspect-[4/3] place-items-center px-5 text-center text-sm text-[#756F66]">{missing ? "Original photograph is unavailable on this device." : "Loading photograph…"}</div>}
    <div className="absolute inset-x-2 bottom-2 flex justify-between gap-2"><button data-action-id="journal.photo-select" aria-pressed={selected} className="min-h-11 rounded-full bg-[#F4EFE5] px-4 text-xs font-semibold text-[#27312C]" data-flow-action="Use photo" onClick={onSelect} type="button">{selected ? "Selected" : "Use photo"}</button><button data-action-id="journal.photo-remove" className="min-h-11 rounded-full bg-[#171B18]/85 px-4 text-xs text-white opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" data-flow-action="Remove attached photo" onClick={onRemove} type="button">Remove</button></div>
  </figure>;
}

function JournalEditor({ entry }: { entry: JournalEntry }) {
  const environment = useFlowEnvironment();
  const runtime = useStudioRuntime();
  const [text, setText] = useState(entry.text);
  const [title, setTitle] = useState(entry.title);
  const [tags, setTags] = useState(entry.tags.join(", "));
  const [selection, setSelection] = useState("");
  const [localError, setLocalError] = useState("");
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const prose = useRef<HTMLTextAreaElement>(null);
  const isThisRecording = runtime.recorder.entryId === entry.id;
  const mediaActivity = isThisRecording && ["requesting", "recording", "paused"].includes(runtime.recorder.status) ? "recording"
    : isThisRecording && runtime.recorder.status === "saving" ? "finalizing" : undefined;
  const { url: audioUrl, missing: audioMissing, state: mediaState } = useStudioMediaUrl(entry.audioAssetId, mediaActivity);
  useStudioPlayback(audio, "journal-playback", entry.id, 0, entry.recordingDurationMs, { url: audioUrl, state: mediaState }, () => environment.selectStudioSource({ entryId: entry.id }), (status) => environment.setPlaybackState({ kind: "journal", id: entry.id }, status));
  const recordingOwnsPosition = Boolean(mediaActivity);
  const position = recordingOwnsPosition ? runtime.recorder.elapsedMs : playbackPosition;
  const activeRitual = environment.document.studio.rituals.find(({ name }) => name === "I'm home");
  useEffect(() => { setText(entry.text); setTitle(entry.title); setTags(entry.tags.join(", ")); }, [entry.id, entry.tags, entry.text, entry.title]);
  useEffect(() => {
    if (mediaActivity) return;
    const marker = journalVoiceMarkers(entry).find(({ id }) => id === environment.conversationContext.selectedVoiceMarkerId);
    const excerpt = marker?.excerpt.trim();
    if (!excerpt || !prose.current) return;
    const start = entry.text.indexOf(excerpt);
    if (start < 0 || entry.text.indexOf(excerpt, start + 1) >= 0) return;
    prose.current.focus({ preventScroll: true }); prose.current.setSelectionRange(start, start + excerpt.length);
  }, [entry, environment.conversationContext.selectedVoiceMarkerId, mediaActivity]);

  function saveText() {
    if (text !== entry.text) environment.dispatchLife([{ type: "journal.update", entryId: entry.id, patch: { text } }], "Journal text saved.");
  }
  function saveTitle() {
    if (title.trim() && title.trim() !== entry.title) environment.dispatchLife([{ type: "journal.update", entryId: entry.id, patch: { title: title.trim() } }], `Journal renamed to ${title.trim()}.`);
  }
  function bookmark() {
    const timestampMs = recordingOwnsPosition ? runtime.recorder.elapsedMs : audio.current ? Math.round(audio.current.currentTime * 1000) : entry.recordingDurationMs;
    environment.selectStudioSource({ entryId: entry.id, passage: selection, positionMs: timestampMs });
    environment.runCommand(selection.trim() ? "Bookmark selection" : "Bookmark here", "quick");
  }
  async function attachPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setLocalError("Choose an image file. Nothing was attached."); return; }
    const id = uniqueLifeId(environment.document, "photo", `${file.name}-${Date.now()}`);
    const asset: StudioMediaAsset = { id, kind: "journal-photo", name: file.name, mimeType: file.type, size: file.size, createdAt: new Date().toISOString() };
    const release = retainStudioMedia(id);
    try {
      await putStudioMedia(id, file);
      if (!await environment.dispatchLife([{ type: "media.register", asset }, { type: "journal.photo.attach", entryId: entry.id, assetId: id }], "Photograph attached.")) throw new Error("Photograph reference failed.");
      setLocalError("");
    } catch { setLocalError("The original photograph could not be stored on this device. Nothing was attached."); }
    finally { release(); }
  }

  return <motion.article animate={{ opacity: 1, y: 0 }} className={`min-w-0 ${environment.document.studio.workspace.quiet ? "" : "lg:col-start-2 lg:row-start-1"}`} data-page-task="journal" data-task-entity-id={entry.id} data-journal-entry-id={entry.id} initial={{ opacity: 0, y: 12 }} key={entry.id}>
    <div className="flex flex-col gap-4 border-b border-[#D8D0C8] pb-6 sm:flex-row sm:items-end sm:justify-between" data-page-actions>
      <div className="min-w-0 flex-1"><label className="mb-3 block text-xs text-flow-secondary">Journal entry<select data-action-id="journal.select" aria-label="Current journal entry" className="ml-2 min-h-11 max-w-64 rounded-xl border border-flow-border bg-white px-3 text-sm text-flow-ink" value={entry.id} onChange={(event) => { environment.focusEntity(event.target.value); environment.setJournalVoiceMode("command", event.target.value); }}>{environment.document.studio.journalEntries.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><label className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7EA7A4]" htmlFor="journal-title">Entry title</label><input data-action-id="journal.rename" className="mt-2 w-full bg-transparent font-serif text-[clamp(1.75rem,3vw,2.8rem)] leading-none tracking-[-0.045em] outline-none placeholder:text-[#756F66]" data-flow-action="Journal title" id="journal-title" onBlur={saveTitle} onChange={(event) => setTitle(event.target.value)} value={title}/><p className="mt-3 text-sm text-[#A7AAA4]">{entry.status === "draft" ? "Unfinished is welcome here." : "Saved locally."} · {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.createdAt))}</p></div>
      <div className="flex flex-wrap gap-2">
        {selection.trim() && <button data-action-id="journal.bookmark-selection" className={warmQuietButton} data-flow-action="Bookmark selection" onClick={bookmark} type="button">Bookmark selection</button>}
        <button data-action-id="journal.save" className={warmQuietButton} data-flow-action="Save entry" onClick={() => environment.runCommand("Save entry", "quick")} type="button">Save entry</button>
        <button data-action-id="memory.create" className={warmButton} data-flow-action="Make a memory" onClick={() => { environment.focusEntity(entry.id); environment.runCommand("Make a memory", "quick"); }} type="button">Make a memory</button>
        <button data-action-id="journal.delete" className={warmQuietButton} data-flow-action="Delete entry" onClick={() => environment.runCommand("Delete entry", "quick")} type="button">Delete entry</button>
      </div>
    </div>

    <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <textarea ref={prose} data-action-id="journal.text-replace" aria-label="Journal text" className="min-h-[360px] w-full resize-y bg-transparent font-serif text-[clamp(1.25rem,2.1vw,1.72rem)] leading-[1.72] tracking-[-0.015em] text-[#27312C] outline-none placeholder:text-[#8E8A82] focus-visible:ring-2 focus-visible:ring-[#7EA7A4]" data-flow-action="Journal text" onBlur={saveText} onChange={(event) => setText(event.target.value)} onSelect={(event) => { const passage = event.currentTarget.value.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd); setSelection(passage); if (passage.trim()) environment.selectStudioSource({ entryId: entry.id, passage: passage.trim() }); }} placeholder="Start anywhere. Pause as long as you need." value={text} />
        <div className="mt-5"><JournalTimeline entry={entry} onSeek={(milliseconds) => { environment.selectStudioSource({ entryId: entry.id }); environment.runCommand(`Seek journal recording to ${Math.max(0, Math.round(milliseconds)) / 1000} seconds`, "quick"); }} onSelectBookmark={(bookmarkId) => { environment.selectStudioSource({ entryId: entry.id }); environment.runCommand(`Play journal bookmark ${entry.bookmarks.findIndex(({ id }) => id === bookmarkId) + 1}`, "quick"); }} positionMs={position} /></div>
        <label className="mt-5 block text-xs font-semibold uppercase tracking-[0.12em] text-[#756F66]" htmlFor="journal-tags">Tags</label><input data-action-id="journal.tags-set" className={`${warmField} mt-2`} data-flow-action="Journal tags" id="journal-tags" onBlur={() => {
          const next = tags.split(",").map((tag) => tag.trim()).filter(Boolean);
          if (JSON.stringify(next) !== JSON.stringify(entry.tags)) environment.dispatchLife([{ type: "journal.update", entryId: entry.id, patch: { tags: next } }], "Journal tags saved.");
        }} onChange={(event) => setTags(event.target.value)} placeholder="travel, reflection" value={tags} />
      </div>

      <aside className="space-y-4">
        <section className={`${warmCard} border-[#D8D0C8] bg-[#F2EBDD] p-4`} aria-label="Journal recording controls" data-media-state={mediaActivity ?? mediaState}>
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6D6A64]">Original voice</span><span aria-live="polite" className="font-mono text-xs text-[#27312C]">{recordingOwnsPosition ? `Recording ${timeLabel(position)}` : `${timeLabel(position)} position / ${timeLabel(entry.recordingDurationMs)} saved`}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(!isThisRecording || runtime.recorder.status === "idle" || (runtime.recorder.status === "error" && !runtime.recorder.assetId)) && <button data-action-id="journal.record-start" className={warmButton} data-flow-action="Start recording" onClick={() => environment.runCommand("Start recording", "quick")} type="button">Start recording</button>}
            {isThisRecording && runtime.recorder.status === "error" && runtime.recorder.assetId && <button data-action-id="journal.record-save-retry" className={warmButton} data-flow-action="Retry saving recording" onClick={() => environment.runCommand("Retry saving recording", "quick")} type="button">Retry saving recording</button>}
            {isThisRecording && runtime.recorder.status === "recording" && <button data-action-id="journal.record-pause" className={warmQuietButton} data-flow-action="Pause recording" onClick={() => environment.runCommand("Pause recording", "quick")} type="button">Pause recording</button>}
            {isThisRecording && runtime.recorder.status === "paused" && <button data-action-id="journal.record-resume" className={warmButton} data-flow-action="Resume recording" onClick={() => environment.runCommand("Resume recording", "quick")} type="button">Resume recording</button>}
            {isThisRecording && ["recording", "paused"].includes(runtime.recorder.status) && <button data-action-id="journal.record-stop" className={warmQuietButton} data-flow-action="Stop recording" onClick={() => environment.runCommand("Stop recording", "quick")} type="button">Stop recording</button>}
            <button data-action-id="journal.bookmark-current" className={warmQuietButton} data-flow-action="Bookmark here" onClick={() => environment.runCommand("Bookmark here", "quick")} type="button">Bookmark here</button>
            {(isThisRecording || entry.audioAssetId) && <button data-action-id="journal.record-discard" className="min-h-11 rounded-full px-4 text-sm text-[#A54E43] hover:bg-[#F7DDD6]" data-flow-action="Discard audio…" onClick={() => environment.runCommand("Discard recording", "quick")} type="button">Discard audio…</button>}
          </div>
          {runtime.recorder.error && isThisRecording && <p aria-live="assertive" className="mt-3 text-sm text-[#A54E43]">{runtime.recorder.error}</p>}
          {entry.recordingState === "interrupted" && <p className="mt-3 rounded-xl bg-[#F7EBDD] px-3 py-2 text-sm text-[#806F5D]">The recording was interrupted. The last locally stored audio remains available below; start a fresh recording when ready.</p>}
          {audioUrl && <audio aria-label="Original journal recording" data-action-id="journal.playback-transport" data-additional-action-ids="journal.playback-seek journal.playback-volume journal.playback-rate journal.audio-download" className="mt-4 w-full" controls onTimeUpdate={(event) => { const positionMs = Math.round(event.currentTarget.currentTime * 1000); setPlaybackPosition(positionMs); environment.selectStudioSource({ entryId: entry.id, positionMs }); }} ref={audio} src={audioUrl} />}
          {entry.audioAssetId && <button data-action-id="journal.audio-download" className={warmQuietButton} data-flow-action="Download original audio" onClick={() => { environment.selectStudioSource({ entryId: entry.id }); environment.requestNativeStudio({ type: "journal-download-audio" }); }} type="button">Download original audio</button>}
          {mediaActivity === "finalizing" && <p aria-live="polite" className="mt-3 text-sm text-flow-secondary">Saving the original audio…</p>}
          {audioMissing && !mediaActivity && <p className="mt-3 text-sm text-[#A54E43]">This recording could not be loaded on this device. Its journal text is safe.</p>}
          {mediaState === "failed" && !mediaActivity && <p className="mt-3 text-sm text-[#A54E43]">Audio storage could not be read. Keep Flow open and try again.</p>}
        </section>
        <RecordingMoments target={{ kind: "journal", id: entry.id }} markers={journalVoiceMarkers(entry)} />
        <section className={`${warmCard} p-4`}><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#756F66]">Photographs</span><label className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-[#D8D0C8] bg-white px-4 text-xs text-[#52606D] hover:bg-flow-neutral-soft">Attach original<input data-action-id="journal.attach-original" accept="image/*" className="sr-only" data-flow-action="Attach original" onChange={(event) => void attachPhoto(event)} type="file" /></label></div>{localError && <p aria-live="assertive" className="mt-3 text-sm text-[#A54E43]">{localError}</p>}<div className="mt-3 grid gap-3">{entry.photoAssetIds.map((assetId) => {
          const asset = environment.document.studio.mediaAssets.find(({ id }) => id === assetId);
          return <JournalPhoto assetId={assetId} key={assetId} name={asset?.name ?? "Journal photograph"} onRemove={() => { environment.selectStudioSource({ entryId: entry.id }); environment.runCommand(`Remove attached photo ${entry.photoAssetIds.indexOf(assetId) + 1}`, "quick"); }} onSelect={() => environment.selectStudioSource({ entryId: entry.id, photoAssetId: assetId })} selected={environment.conversationContext.selectedPhotoAssetId === assetId} />;
        })}{!entry.photoAssetIds.length && <p className="rounded-2xl border border-dashed border-[#D8D0C8] px-4 py-7 text-center text-sm text-[#756F66]">Your photographs remain untouched and local.</p>}</div></section>
        <JournalDrawingPad onBegin={() => { environment.selectStudioSource({ entryId: entry.id }); environment.requestNativeStudio({ type: "journal-drawing-input" }); }} onChange={(strokes) => environment.dispatchLife([{ type: "journal.drawing.replace", entryId: entry.id, strokes }], "Journal sketch saved.")} strokes={entry.drawings} />
        {activeRitual && <HomeRitualEditor ritual={activeRitual} />}
      </aside>
    </div>
  </motion.article>;
}

export function JournalSpace() {
  const environment = useFlowEnvironment();
  const entries = useMemo(() => [...environment.document.studio.journalEntries].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)), [environment.document.studio.journalEntries]);
  const activeId = environment.conversationContext.activeJournalEntryId ?? (environment.focusedEntityId && entries.some(({ id }) => id === environment.focusedEntityId) ? environment.focusedEntityId : entries[0]?.id);
  const active = entries.find(({ id }) => id === activeId);
  useEffect(() => {
    if (activeId && environment.conversationContext.activeJournalEntryId !== activeId) environment.selectStudioSource({ entryId: activeId });
  }, [activeId, environment]);
  const quiet = environment.document.studio.workspace.quiet;
  return <WorldPageShell action={<div className="flex gap-2"><button data-action-id="studio.shape-sound" className={warmQuietButton} data-flow-action="Shape sound" onClick={() => environment.runCommand("Shape sound", "quick")} type="button">Shape sound</button><button data-action-id="journal.create" className={warmButton} data-flow-action="New entry" onClick={() => environment.runCommand("New entry", "quick")} type="button">New entry</button></div>} description="Speak without racing the silence. Keep the original voice, mark what matters, and return when you are ready." destination="journal" eyebrow="A private place to think" testId="journal-space" title="Journal">
    <div className={`grid gap-7 ${quiet ? "" : "lg:grid-cols-[250px_minmax(0,1fr)]"}`}>

      <AnimatePresence mode="wait">{active ? <JournalEditor entry={active} key={active.id} /> : <motion.div animate={{ opacity: 1 }} className={`${warmCard} grid min-h-[260px] items-start ${quiet ? "" : "lg:col-start-2"} border-[#D8D0C8] bg-[#F2EBDD] p-10 text-center`} initial={{ opacity: 0 }}><div><p className="font-serif text-4xl">There is room.</p><p className="mt-3 text-[#756F66]">Open a new entry and take all the pauses you need.</p><button data-action-id="journal.create-recording" className={`${warmButton} mt-6`} data-flow-action="Start with my voice" onClick={() => environment.runCommand("Start with my voice", "quick")} type="button">Start with my voice</button></div></motion.div>}</AnimatePresence>
      {!quiet && <nav aria-label="Journal entries" className="space-y-2 lg:col-start-1 lg:row-start-1"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#7EA7A4]">Your entries</p>{entries.map((entry) => <button data-action-id="journal.select" className={`min-h-20 w-full rounded-[18px] border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EA7A4] ${entry.id === active?.id ? "border-[#7EA7A4] bg-[#E8EEE7]" : "border-[#D8D0C8] bg-[#F5EFE5] hover:bg-white"}`} data-flow-action="Select journal entry" key={entry.id} onClick={() => { environment.focusEntity(entry.id); environment.setJournalVoiceMode("command", entry.id, entry.recordingDurationMs); }} type="button"><strong className="block truncate font-serif text-lg">{entry.title}</strong><span className="mt-1 block text-xs text-[#756F66]">{entry.status} · {journalVoiceMarkers(entry).filter(({ status }) => status !== "dismissed").length} marks</span></button>)}{!entries.length && <p className="rounded-[18px] border border-dashed border-[#D8D0C8] p-5 text-sm leading-6 text-[#756F66]">No entries yet. Say “Let me talk for a while,” or start with the button above.</p>}</nav>}
    </div>
  </WorldPageShell>;
}
