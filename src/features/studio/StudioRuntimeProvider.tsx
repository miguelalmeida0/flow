/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import type { StudioMediaAsset } from "../../domain/studio-model";
import { AtmosphereEngine } from "./atmosphereEngine";
import { putStudioMedia, removeOrphanedStudioMedia, retainStudioMedia } from "./mediaRepository";
import { setJournalRuntimePosition } from "./journalRuntimeClock";
import type { JournalCreationOrigin } from "./journalAcquisition";
import { recordingDocument, recordingUpdate } from "./recordingTarget";
import type { RecordingTarget } from "../../domain/friends-actions";
import type { RecordingRequest } from "./recordingRequest";
import { deliveredAssetIds, deliveryRetentionKnown } from "../friends/messaging";

type RecorderStatus = "idle" | "requesting" | "recording" | "paused" | "saving" | "error";

interface RecorderSnapshot {
  targetKind?: RecordingTarget["kind"];
  entryId?: string;
  assetId?: string;
  status: RecorderStatus;
  elapsedMs: number;
  error?: string;
}

interface StudioRuntimeValue {
  recorder: RecorderSnapshot;
  audioUnlocked: boolean;
  unlockAtmosphere: () => Promise<boolean>;
  startRecording: (entryId: string, origin?: JournalCreationOrigin, kind?: RecordingTarget["kind"]) => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  discardRecording: () => Promise<void>;
}

const StudioRuntimeContext = createContext<StudioRuntimeValue | null>(null);
const emptyRecorder: RecorderSnapshot = { status: "idle", elapsedMs: 0 };

function preferredRecordingType() {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function StudioRuntimeProvider({ children }: { children: ReactNode }) {
  const environment = useFlowEnvironment();
  const [engine] = useState(() => new AtmosphereEngine());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [recorder, setRecorder] = useState<RecorderSnapshot>(emptyRecorder);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const elapsedBeforeResumeRef = useRef(0);
  const tickerRef = useRef<number | undefined>(undefined);
  const recorderSnapshotRef = useRef(recorder); recorderSnapshotRef.current = recorder;
  const environmentRef = useRef(environment); environmentRef.current = environment;
  const releaseAssetRef = useRef<(() => void) | undefined>(undefined);
  const finalizerRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const acquiringRef = useRef(false);
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const completionRef = useRef<{ promise: Promise<void>; resolve: () => void; reject: (error: Error) => void } | undefined>(undefined);
  function currentTarget(): RecordingTarget { return { kind: recorderSnapshotRef.current.targetKind ?? "journal", id: recorderSnapshotRef.current.entryId ?? "" }; }
  function setRecordingMode(mode: "command" | "journal-longform", target: RecordingTarget, positionMs: number) {
    if (target.kind === "journal") environmentRef.current.setJournalVoiceMode(mode, target.id, positionMs);
    else environmentRef.current.setVoiceNoteMode(mode === "command" ? "command" : "voice-note-longform", target.id);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false; generationRef.current += 1;
      completionRef.current?.reject(new Error("The recording surface closed."));
      const nativeRecorder = recorderRef.current;
      // Preserve a final native chunk without issuing document transactions
      // from an unmounted app. Hydration reports this as interrupted.
      if (nativeRecorder && nativeRecorder.state !== "inactive") {
        nativeRecorder.onstop = () => { releaseAssetRef.current?.(); releaseAssetRef.current = undefined; };
        nativeRecorder.stop();
      } else { releaseAssetRef.current?.(); releaseAssetRef.current = undefined; }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (tickerRef.current !== undefined) window.clearInterval(tickerRef.current);
      setJournalRuntimePosition(undefined, 0);
    };
  }, []);

  useEffect(() => { void engine.apply(environment.document.studio.activeAtmosphere); }, [engine, environment.document.studio.activeAtmosphere]);
  useEffect(() => {
    const current = recorderSnapshotRef.current, native = recorderRef.current;
    if (!native || !current.assetId || !current.entryId) return;
    const entry = recordingDocument(environment.document, currentTarget());
    if (entry?.audioAssetId === current.assetId) return;
    // Undo/deletion can revoke this exact recording reference. Stop only its
    // owned native resource, with no finalizer that could resurrect the entry.
    generationRef.current += 1;
    completionRef.current?.reject(new Error("The recording reference was removed."));
    native.ondataavailable = null; native.onstop = null; native.onerror = null;
    if (native.state !== "inactive") native.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined; recorderRef.current = undefined;
    if (tickerRef.current !== undefined) window.clearInterval(tickerRef.current);
    tickerRef.current = undefined; finalizerRef.current = undefined;
    releaseAssetRef.current?.(); releaseAssetRef.current = undefined;
    setJournalRuntimePosition(undefined, 0);
    setRecorder({ status: "idle", elapsedMs: 0 });
  }, [environment.document]);
  useEffect(() => () => { void engine.dispose(); }, [engine]);
  useEffect(() => {
    void removeOrphanedStudioMedia(() => {
      if (!deliveryRetentionKnown()) throw new Error("Delivery retention is unavailable; media cleanup is postponed.");
      const current = environmentRef.current.snapshot;
      const documents = [current.document, ...current.past.map(({ document }) => document), ...current.future.map(({ document }) => document)];
      return new Set([...deliveredAssetIds(), ...documents.flatMap(({ studio, friends }) => [
        ...studio.journalEntries.flatMap((entry) => [entry.audioAssetId, ...entry.photoAssetIds]),
        ...studio.memories.map(({ photoAssetId }) => photoAssetId),
        ...(friends?.voiceNotes.flatMap(({ audioAssetId, originalAudioAssetId }) => [audioAssetId, originalAudioAssetId]) ?? []),
        ...(friends?.messages.map(({ attachment }) => attachment?.assetId) ?? []),
      ].filter((id): id is string => Boolean(id)))]);
    }).catch(() => undefined);
  }, [environment.snapshot]);

  async function unlockAtmosphere() {
    const unlocked = await engine.unlockFromGesture();
    setAudioUnlocked(unlocked);
    if (unlocked) await engine.apply(environment.document.studio.activeAtmosphere);
    return unlocked;
  }

  function stopTicker() {
    if (tickerRef.current !== undefined) window.clearInterval(tickerRef.current);
    tickerRef.current = undefined;
  }

  function startTicker() {
    stopTicker();
    startedAtRef.current = performance.now();
    tickerRef.current = window.setInterval(() => {
      const elapsedMs = Math.max(0, elapsedBeforeResumeRef.current + performance.now() - startedAtRef.current);
      if (recorderSnapshotRef.current.entryId) setJournalRuntimePosition(recorderSnapshotRef.current.entryId, elapsedMs);
      setRecorder((current) => current.status === "recording" ? { ...current, elapsedMs } : current);
    }, 200);
  }

  function closeStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined; recorderRef.current = undefined; stopTicker();
  }

  async function persistChunks(assetId: string, mimeType: string, chunks = chunksRef.current) {
    if (!chunks.length) throw new Error("No audio frames were captured.");
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    await putStudioMedia(assetId, blob);
    return blob;
  }

  async function startRecording(entryId: string, origin?: JournalCreationOrigin, targetKind: RecordingTarget["kind"] = "journal", isCurrent: () => boolean = () => true) {
    const target: RecordingTarget = { kind: targetKind, id: entryId };
    if (targetKind === "shared-message") return;
    if (acquiringRef.current || recorderRef.current || finalizerRef.current || recorderSnapshotRef.current.status === "saving") return;
    const saved = recordingDocument(environmentRef.current.document, target);
    if (saved?.audioAssetId && environmentRef.current.document.studio.mediaAssets.some(({ id, size }) => id === saved.audioAssetId && size > 0)) {
      setRecorder({ entryId, targetKind, assetId: saved.audioAssetId, status: "error", elapsedMs: saved.recordingDurationMs, error: "This saved recording and its moments are kept. Start a new note or Journal entry to record more audio." });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecorder({ entryId, targetKind, status: "error", elapsedMs: 0, error: "This browser cannot record audio. Typed journaling still works." });
      return;
    }
    acquiringRef.current = true;
    const generation = ++generationRef.current;
    const owns = () => mountedRef.current && generation === generationRef.current && isCurrent();
    const acquisition = targetKind === "journal" ? environmentRef.current.prepareJournalAcquisition(entryId, origin, owns) : environmentRef.current.prepareVoiceNoteAcquisition(entryId, owns);
    setRecorder({ entryId, targetKind, status: "requesting", elapsedMs: 0 });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!mountedRef.current || generation !== generationRef.current || !acquisition.isCurrent()) {
        stream.getTracks().forEach((track) => track.stop());
        if (mountedRef.current && generation === generationRef.current) setRecorder({ entryId, targetKind, status: "error", elapsedMs: 0, error: "The recording request changed before the microphone was ready. Start recording again when ready." });
        return;
      }
      streamRef.current = stream;
      const mimeType = preferredRecordingType();
      const nativeRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const assetId = `${targetKind === "journal" ? "journal-audio" : "voice-note-audio"}-${entryId}-${Date.now().toString(36)}`;
      const createdAt = new Date().toISOString();
      const asset: StudioMediaAsset = { id: assetId, kind: targetKind === "journal" ? "journal-audio" : "voice-note-audio", name: `${entryId}.webm`, mimeType: nativeRecorder.mimeType || mimeType || "audio/webm", size: 0, createdAt };
      const chunks: Blob[] = [];
      let admitted = false;
      let complete!: () => void, fail!: (error: Error) => void;
      const promise = new Promise<void>((resolve, reject) => { complete = resolve; fail = reject; });
      void promise.catch(() => undefined);
      completionRef.current = { promise, resolve: complete, reject: fail };
      chunksRef.current = chunks; elapsedBeforeResumeRef.current = 0;
      releaseAssetRef.current = retainStudioMedia(assetId);
      recorderRef.current = nativeRecorder;
      nativeRecorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        chunks.push(event.data);
        // An admitted owner's final unmount chunk still belongs to the saved
        // recording. Unmount must not issue a document callback, but may retain
        // those bytes. Revocation paths explicitly detach this handler.
        if (!admitted) return;
        void persistChunks(assetId, nativeRecorder.mimeType, chunks).catch(() => {
          if (mountedRef.current && generation === generationRef.current) setRecorder((current) => current.assetId === assetId ? { ...current, error: "Audio is still in memory. Keep Flow open until it can be saved." } : current);
        });
      };
      nativeRecorder.onerror = () => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        setRecorder((current) => ({ ...current, error: "Recording stopped unexpectedly. Saving the captured audio…" }));
        void stopRecording();
      };
      let finalizing = false;
      const finalize = async () => {
        if (finalizing || !admitted || !mountedRef.current || generation !== generationRef.current) return;
        finalizing = true;
        const elapsedMs = elapsedBeforeResumeRef.current;
        setRecorder((current) => ({ ...current, status: "saving", elapsedMs }));
        try {
          const blob = await persistChunks(assetId, nativeRecorder.mimeType, chunks);
          if (!mountedRef.current || generation !== generationRef.current) { fail(new Error("The recording changed while saving.")); return; }
          const { suggestVoiceMarkers } = await import("./markerSuggestions");
          if (!mountedRef.current || generation !== generationRef.current) { fail(new Error("The recording changed while saving.")); return; }
          const recording = recordingDocument(environmentRef.current.document, target);
          const markers = recording?.markers ?? [];
          const suggestions = suggestVoiceMarkers(entryId, recording?.transcriptSegments ?? [], markers, elapsedMs, new Date().toISOString());
          const committed = await environmentRef.current.dispatchRecording([
            { type: "media.update", assetId, patch: { size: blob.size, mimeType: blob.type || nativeRecorder.mimeType || "audio/webm" } },
            recordingUpdate(target, { recordingState: "idle", recordingDurationMs: elapsedMs, audioAssetId: assetId }),
            ...(suggestions.length ? [{ type: "recording.markers.replace" as const, target, markers: [...markers, ...suggestions] }] : []),
          ], targetKind === "journal" ? "Journal recording saved." : "Voice note recording saved.");
          if (!committed) throw new Error("The recording reference could not be saved.");
          if (environmentRef.current.conversationContext.activeVoiceNoteId === entryId || targetKind === "journal" && environmentRef.current.conversationContext.activeJournalEntryId === entryId) setRecordingMode("command", target, elapsedMs);
          setJournalRuntimePosition(undefined, 0);
          setRecorder({ entryId, targetKind, assetId, status: "idle", elapsedMs });
          releaseAssetRef.current?.(); releaseAssetRef.current = undefined; finalizerRef.current = undefined;
          complete();
        } catch {
          fail(new Error("The original audio could not be saved. No message was prepared."));
          if (mountedRef.current && generation === generationRef.current) setRecorder((current) => ({ ...current, status: "error", error: "The recording could not be saved. Keep this page open and stop recording again to retry." }));
        } finally { finalizing = false; }
      };
      finalizerRef.current = finalize;
      nativeRecorder.onstop = () => {
        if (!admitted) {
          // Native transport can stop while the admission CAS is queued.
          // Invalidate that exact request before it can publish recording.
          generationRef.current += 1;
          nativeRecorder.ondataavailable = null; nativeRecorder.onerror = null;
          closeStream(); finalizerRef.current = undefined;
          releaseAssetRef.current?.(); releaseAssetRef.current = undefined;
          if (mountedRef.current) setRecorder({ entryId, targetKind, status: "error", elapsedMs: 0, error: "Recording stopped before it could be saved. Start recording again when ready." });
          return;
        }
        void finalize();
        closeStream();
      };
      nativeRecorder.start(1000);
      if (!await acquisition.complete(asset)) throw new Error("The recording request changed or could not be saved. Start recording again.");
      admitted = true;
      // Some native recorders emit a first chunk synchronously or while CAS
      // is waiting. Preserve it in memory, then write only after admission.
      if (chunks.length) void persistChunks(assetId, nativeRecorder.mimeType, chunks).catch(() => {
        if (mountedRef.current && generation === generationRef.current) setRecorder((current) => ({ ...current, error: "Audio is still in memory. Keep Flow open until it can be saved." }));
      });
      setRecordingMode("journal-longform", target, 0);
      setJournalRuntimePosition(entryId, 0);
      setRecorder({ entryId, targetKind, assetId, status: "recording", elapsedMs: 0 });
      startTicker();
    } catch (error) {
      const nativeRecorder = recorderRef.current;
      if (nativeRecorder) {
        nativeRecorder.ondataavailable = null; nativeRecorder.onstop = null;
        if (nativeRecorder.state !== "inactive") nativeRecorder.stop();
      }
      closeStream();
      releaseAssetRef.current?.(); releaseAssetRef.current = undefined; finalizerRef.current = undefined;
      const message = error instanceof DOMException && error.name === "NotAllowedError"
        ? "Microphone permission was denied. Allow it in the browser, then try again."
        : error instanceof DOMException && error.name === "NotFoundError"
          ? "No microphone is available. Typed journaling still works."
          : error instanceof Error ? error.message : "Flow could not start the recorder. Typed journaling still works.";
      if (mountedRef.current && generation === generationRef.current) setRecorder({ entryId, targetKind, status: "error", elapsedMs: 0, error: message });
    } finally { acquiringRef.current = false; }
  }

  async function persistTransportState(native: MediaRecorder, state: "paused" | "recording", elapsedMs?: number) {
    const entryId = recorderSnapshotRef.current.entryId, generation = generationRef.current;
    const target = currentTarget();
    if (!entryId) return;
    let committed = false;
    try {
      committed = await environmentRef.current.dispatchRecording([recordingUpdate(target, { recordingState: state, ...(elapsedMs === undefined ? {} : { recordingDurationMs: elapsedMs }) })], state === "paused" ? "Journal recording paused." : "Journal recording resumed.");
    } catch { /* Native transport remains truthful even when persistence fails. */ }
    if (!mountedRef.current || generation !== generationRef.current || recorderRef.current !== native || native.state !== state) return;
    const entry = recordingDocument(environmentRef.current.document, target);
    const saved = committed || (entry?.recordingState === state && (elapsedMs === undefined || entry.recordingDurationMs === elapsedMs));
    setRecorder((current) => current.entryId === entryId ? { ...current, error: saved ? undefined
      : `Audio is ${state}, but that state was not saved. Keep Flow open and try again.` } : current);
  }

  function pauseRecording() {
    const nativeRecorder = recorderRef.current;
    if (!nativeRecorder || nativeRecorder.state !== "recording") return;
    nativeRecorder.pause();
    elapsedBeforeResumeRef.current += performance.now() - startedAtRef.current;
    stopTicker();
    const elapsedMs = elapsedBeforeResumeRef.current;
    setRecorder((current) => ({ ...current, status: "paused", elapsedMs }));
    void persistTransportState(nativeRecorder, "paused", elapsedMs);
    if (recorderSnapshotRef.current.entryId) setRecordingMode("command", currentTarget(), elapsedMs);
  }

  function resumeRecording() {
    const nativeRecorder = recorderRef.current;
    if (!nativeRecorder || nativeRecorder.state !== "paused") return;
    nativeRecorder.resume(); startTicker();
    setRecorder((current) => ({ ...current, status: "recording" }));
    void persistTransportState(nativeRecorder, "recording");
    if (recorderSnapshotRef.current.entryId) setRecordingMode("journal-longform", currentTarget(), recorderSnapshotRef.current.elapsedMs);
  }

  async function stopRecording() {
    if (acquiringRef.current) {
      generationRef.current += 1;
      const native = recorderRef.current;
      if (native) { native.ondataavailable = null; native.onstop = null; native.onerror = null; if (native.state !== "inactive") native.stop(); }
      closeStream(); finalizerRef.current = undefined;
      releaseAssetRef.current?.(); releaseAssetRef.current = undefined;
      setRecorder((current) => ({ entryId: current.entryId, status: "idle", elapsedMs: 0 }));
      return;
    }
    const nativeRecorder = recorderRef.current;
    if (!nativeRecorder || nativeRecorder.state === "inactive") {
      if (recorderSnapshotRef.current.status === "error") await finalizerRef.current?.();
      if (finalizerRef.current) await completionRef.current?.promise;
      return;
    }
    if (nativeRecorder.state === "recording") elapsedBeforeResumeRef.current += performance.now() - startedAtRef.current;
    stopTicker();
    nativeRecorder.requestData(); nativeRecorder.stop();
    await completionRef.current?.promise;
  }

  async function discardRecording(stateCommitted = false) {
    generationRef.current += 1;
    completionRef.current?.reject(new Error("The recording was discarded."));
    const current = recorderSnapshotRef.current;
    const nativeRecorder = recorderRef.current;
    if (nativeRecorder && nativeRecorder.state !== "inactive") {
      nativeRecorder.ondataavailable = null; nativeRecorder.onstop = null; nativeRecorder.stop();
    }
    closeStream(); chunksRef.current = [];
    finalizerRef.current = undefined;
    if (current.assetId) {
      if (!stateCommitted) {
        const entry = recordingDocument(environment.document, currentTarget());
        const actions = [
          ...(entry?.audioAssetId === current.assetId && current.entryId ? [recordingUpdate(currentTarget(), { recordingState: "idle", recordingDurationMs: 0, audioAssetId: undefined })] : []),
          { type: "media.remove" as const, assetId: current.assetId },
        ];
        await environment.dispatchLife(actions, "Journal recording discarded.");
      }
    }
    // The binary remains while an undo/redo snapshot references it. Ordinary
    // orphan cleanup owns deletion; discard cannot destroy exact Undo.
    releaseAssetRef.current?.(); releaseAssetRef.current = undefined;
    setRecordingMode("command", currentTarget(), 0);
    setJournalRuntimePosition(undefined, 0);
    setRecorder({ entryId: current.entryId, status: "idle", elapsedMs: 0 });
  }

  useEffect(() => {
    const unlock = () => { void unlockAtmosphere(); };
    const command = (event: Event) => {
      const detail = (event as CustomEvent<{ mode: "start" | "pause" | "resume" | "stop" | "discard"; entryId?: string; origin?: JournalCreationOrigin; stateCommitted?: boolean }>).detail;
      if (detail.mode === "start" && detail.entryId) void startRecording(detail.entryId, detail.origin);
      // Domain actions can delete/discard a different saved entry while this
      // recorder remains active. Never let its runtime continuation stop or
      // discard audio owned by another stable source identity.
      if (detail.entryId && detail.entryId !== recorderSnapshotRef.current.entryId) return;
      if (detail.mode === "pause") pauseRecording();
      if (detail.mode === "resume") resumeRecording();
      if (detail.mode === "stop") void stopRecording();
      if (detail.mode === "discard") void discardRecording(Boolean(detail.stateCommitted));
    };
    const recordingCommand = (event: Event) => {
      const detail = (event as CustomEvent<RecordingRequest>).detail;
      if (detail.mode !== "start" && (detail.target.id !== currentTarget().id || detail.target.kind !== currentTarget().kind)) {
        if (detail.mode === "stop" && recordingDocument(environmentRef.current.document, detail.target)?.recordingState === "idle") detail.accept(async () => undefined);
        return;
      }
      detail.accept(async () => {
        if (detail.mode === "start") await startRecording(detail.target.id, undefined, detail.target.kind, detail.isCurrent);
        if (detail.mode === "pause") pauseRecording();
        if (detail.mode === "resume") resumeRecording();
        if (detail.mode === "stop") await stopRecording();
        if (detail.mode === "discard") await discardRecording();
      });
    };
    window.addEventListener("flow-recording-runtime", recordingCommand);
    window.addEventListener("flow-studio-audio-unlock", unlock);
    window.addEventListener("flow-journal-runtime", command);
    return () => { window.removeEventListener("flow-recording-runtime", recordingCommand); window.removeEventListener("flow-studio-audio-unlock", unlock); window.removeEventListener("flow-journal-runtime", command); };
  });

  const value: StudioRuntimeValue = { recorder, audioUnlocked, unlockAtmosphere, startRecording, pauseRecording, resumeRecording, stopRecording, discardRecording };
  return <StudioRuntimeContext.Provider value={value}>{children}</StudioRuntimeContext.Provider>;
}

export function useStudioRuntime() {
  const value = useContext(StudioRuntimeContext);
  if (!value) throw new Error("useStudioRuntime must be used inside StudioRuntimeProvider");
  return value;
}
