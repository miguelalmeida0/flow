import { useCallback, useEffect, useRef, useState } from "react";
import { buildContextPhrases } from "../day-planner/voice/contextPhrases";
import { createBrowserRecognitionAdapter, DEFAULT_VOICE_LOCALE, type RecognitionAdapter, type RecognitionError, type RecognitionFinalBoundary, type VoiceLocale } from "../day-planner/voice/recognition";
import { createBrowserLiveOwnership, type LiveOwnershipCoordinator } from "./liveOwnership";
import { reclaimStaleVoiceClients, recordVoiceAcquisitionDiagnostic } from "./staleClientReclaimer";
import { voiceDebug } from "../day-planner/voice/voiceDebug";

export type FlowLiveStatus = "sleeping" | "live-idle" | "listening" | "interpreting" | "suspended" | "moved" | "permission-denied" | "microphone-unavailable" | "recognition-busy" | "start-failed" | "unavailable";

const errors: Partial<Record<RecognitionError, string>> = {
  "permission-denied": "Chrome blocked microphone access. Allow it in Site settings, then Retry.",
  "microphone-unavailable": "Chrome cannot access a microphone. Check the input device and macOS permission, close other recording apps if needed, then Retry.",
  "recognition-busy": "Chrome's voice service is still busy after Flow reclaimed older tabs. Retry when Chrome finishes releasing it.",
  "start-failed": "Chrome could not start recognition. Check the microphone and any other Flow tab, then Retry.",
  "language-not-supported": "English voice recognition is unavailable in this browser.",
  network: "Browser voice recognition is temporarily unavailable.",
  "no-speech": "I didn't catch that clearly.",
  "incomplete-utterance": "The browser ended an unfinished phrase. Nothing changed. Please repeat the complete request.",
  unavailable: "Voice recognition is unavailable here. Typed commands still work.",
};

let nextSessionId = 0;

export function useFlowLiveSession(
  onFinal: (transcript: string, commandId: string, boundary?: RecognitionFinalBoundary) => void,
  onInterim: (transcript: string) => void,
  phrases: string[],
  provided?: RecognitionAdapter,
  locale: VoiceLocale = DEFAULT_VOICE_LOCALE,
  rankTranscript: (transcript: string) => number = () => 0,
  providedOwnership?: LiveOwnershipCoordinator,
  onOwnershipGranted: () => void | Promise<void> = () => undefined,
  endpointMode: "command" | "journal" = "command",
  isCompleteAtNativeEnd?: (transcript: string) => boolean,
  onSpeechAcquisition?: () => void,
) {
  const [adapter] = useState<RecognitionAdapter>(() => provided ?? createBrowserRecognitionAdapter(locale));
  // Ownership subscribes to browser resources, so creating it during render
  // would leak the discarded initializer from React development StrictMode.
  // The committed effect below creates it and reuses it across the probe.
  const ownershipRef = useRef<LiveOwnershipCoordinator | undefined>(providedOwnership);
  const ownershipTeardown = useRef<number | undefined>(undefined);
  const [sessionId] = useState(() => ++nextSessionId);
  const latestFinal = useRef(onFinal); const latestInterim = useRef(onInterim); const latestPhrases = useRef(phrases); const latestRank = useRef(rankTranscript);
  const latestOwnershipGranted = useRef(onOwnershipGranted);
  const utteranceDispatch = useRef<{ final: typeof onFinal; rank: typeof rankTranscript } | undefined>(undefined);
  const latestEndpointMode = useRef(endpointMode);
  const latestSpeechAcquisition = useRef(onSpeechAcquisition);
  latestSpeechAcquisition.current = onSpeechAcquisition;
  latestEndpointMode.current = endpointMode;
  const enabled = useRef(false); const listening = useRef(false); const fatal = useRef(false); const restartTimer = useRef<number | undefined>(undefined);
  const nativeRelease = useRef<ReturnType<RecognitionAdapter["release"]> | undefined>(undefined);
  const generation = useRef(0); const recoveryAttempts = useRef(0); const processedIds = useRef<string[]>([]);
  const busyRetryUsed = useRef(false);
  const busyRecoveryInFlight = useRef(false);
  const busyRecoveryAttempt = useRef(0);
  const busyRecoveryDeadline = useRef(0);
  const finalSequence = useRef(0);
  const [status, setStatus] = useState<FlowLiveStatus>("sleeping");
  const [interim, setInterim] = useState("");
  const [lastTranscript, setLastTranscript] = useState("");
  const [message, setMessage] = useState("Voice off · audio is never stored by Flow");
  const [issue, setIssue] = useState<string>();
  latestFinal.current = onFinal; latestInterim.current = onInterim; latestPhrases.current = phrases; latestRank.current = rankTranscript; latestOwnershipGranted.current = onOwnershipGranted;

  const getOwnership = useCallback(() => {
    const existing = ownershipRef.current;
    if (existing && !existing.isDestroyed()) return existing;
    if (providedOwnership) return providedOwnership;
    const created = createBrowserLiveOwnership();
    ownershipRef.current = created;
    return created;
  }, [providedOwnership]);

  const releaseRecognition = useCallback(() => {
    if (nativeRelease.current) return nativeRelease.current;
    const pending = adapter.release().catch(() => "timed-out" as const);
    nativeRelease.current = pending;
    void pending.finally(() => { if (nativeRelease.current === pending) nativeRelease.current = undefined; });
    return pending;
  }, [adapter]);

  const stop = useCallback(() => {
    voiceDebug("session.stop", { sessionId, generation: generation.current });
    const owner = ownershipRef.current;
    enabled.current = false; listening.current = false; fatal.current = false; busyRecoveryInFlight.current = false;
    busyRecoveryAttempt.current = 0; busyRecoveryDeadline.current = 0;
    generation.current += 1; window.clearTimeout(restartTimer.current); restartTimer.current = undefined;
    utteranceDispatch.current = undefined;
    const released = releaseRecognition();
    void released.then(() => owner?.release());
    setInterim(""); latestInterim.current(""); setIssue(undefined); setStatus("sleeping");
    setMessage("Flow Live is sleeping. Typed commands remain available.");
    return released;
  }, [releaseRecognition, sessionId]);

  const startRecognition = useCallback(() => {
    const ownership = ownershipRef.current;
    const reason = !ownership ? "ownership-not-granted" : !enabled.current ? "session-disabled"
      : listening.current ? "session-already-active" : fatal.current ? "browser-error"
        : nativeRelease.current ? "native-release-pending" : document.hidden ? "browser-state" : undefined;
    if (reason || !ownership) { voiceDebug("recognition.start.blocked", { reason }); return; }
    if (!ownership.isOwner() && !ownership.renewIfStillWinner()) { voiceDebug("recognition.start.blocked", { reason: "ownership-not-granted" }); return; }
    if (!adapter.supported) {
      voiceDebug("recognition.start.blocked", { reason: "adapter-unavailable" });
      enabled.current = false; fatal.current = true; setStatus("unavailable"); setMessage(errors.unavailable!); return;
    }
    const activeGeneration = generation.current;
    const ownsActiveForeground = () => enabled.current && !fatal.current && !document.hidden
      && generation.current === activeGeneration
      && (ownership.isOwner() || ownership.renewIfStillWinner());
    listening.current = true;
    adapter.start({
      onUtteranceStart: () => { if (ownsActiveForeground()) { latestSpeechAcquisition.current?.(); utteranceDispatch.current = { final: latestFinal.current, rank: latestRank.current }; } },
      onSpeechStart: () => { if (ownsActiveForeground()) latestSpeechAcquisition.current?.(); },
      onStart: () => {
        if (!ownsActiveForeground()) return;
        busyRecoveryAttempt.current = 0; busyRecoveryDeadline.current = 0;
        recordVoiceAcquisitionDiagnostic({ phase: "native-start", detail: "listening" });
        setStatus("listening"); setMessage(`Listening in ${locale}`);
      },
      onInterim: (value) => { if (!ownsActiveForeground()) return; setIssue(undefined); setInterim(value); latestInterim.current(value); setStatus("listening"); },
      onFinal: (candidates, boundary) => {
        voiceDebug("live.final-received", { candidates, boundary, ownsActiveForeground: ownsActiveForeground(), duplicate: processedIds.current.includes(boundary.utteranceId), pendingDispatch: Boolean(utteranceDispatch.current) });
        if (!ownsActiveForeground() || processedIds.current.includes(boundary.utteranceId)) return;
        processedIds.current = [...processedIds.current.slice(-127), boundary.utteranceId];
        const dispatch = utteranceDispatch.current ?? { final: latestFinal.current, rank: latestRank.current };
        utteranceDispatch.current = undefined;
        const selected = [...candidates].map((candidate, index) => ({ ...candidate, rank: dispatch.rank(candidate.transcript), browserIndex: candidate.browserIndex ?? index })).sort((a, b) =>
          b.rank - a.rank
          || (b.confidence ?? -1) - (a.confidence ?? -1)
          || (a.browserIndex ?? 0) - (b.browserIndex ?? 0))[0];
        const transcript = selected?.transcript.trim() ?? "";
        voiceDebug("live.selected", { transcript, utteranceId: boundary.utteranceId, rank: selected?.rank, routeBefore: window.location.pathname });
        setInterim(""); latestInterim.current(""); setLastTranscript(transcript); setStatus("interpreting");
        // Recognition boundary IDs—not transcript similarity—are the
        // exactly-once authority. A user may intentionally repeat the same
        // phrase in the very next cycle, including an immediate fake-adapter
        // cycle; `processedIds` still rejects a duplicated native callback.
        if (transcript) {
          const commandId = `flow-live-${sessionId}-${boundary.cycle}-${++finalSequence.current}-${boundary.utteranceId}`;
          if (boundary.assembly) {
            const assembly = { ...boundary.assembly, selectedUtterance: transcript, selectedFinalSegments: selected?.finalSegments ?? (transcript === boundary.assembly.assembledUtterance ? boundary.assembly.finalSegments : [transcript]) };
            if (import.meta.env.DEV && window.__FLOW_UTTERANCE_TRACES__) window.__FLOW_UTTERANCE_TRACES__ = window.__FLOW_UTTERANCE_TRACES__.map((trace) => trace.utteranceId === assembly.utteranceId ? assembly : trace);
            dispatch.final(transcript, commandId, { ...boundary, assembly });
          }
          else dispatch.final(transcript, commandId);
          voiceDebug("live.dispatched", { transcript, commandId, routeAfter: window.location.pathname });
        }
        recoveryAttempts.current = 0;
        adapter.stop();
      },
      onError: (error) => {
        if (generation.current !== activeGeneration || (!enabled.current && error === "aborted")) return;
        utteranceDispatch.current = undefined;
        if (error === "incomplete-utterance") setIssue(errors[error]);
        listening.current = false;
        const ownsVoice = ownsActiveForeground();
        recordVoiceAcquisitionDiagnostic({ phase: "native-error", detail: `${error}:owner-${ownsVoice}:reclaim-${busyRetryUsed.current}:attempt-${busyRecoveryAttempt.current}:remaining-${Math.max(0, busyRecoveryDeadline.current - Date.now())}` });
        if (error === "recognition-busy" && ownsVoice && !busyRetryUsed.current) {
          busyRetryUsed.current = true; busyRecoveryInFlight.current = true; busyRecoveryAttempt.current = 1; setStatus("live-idle");
          setMessage("Flow is reclaiming voice from an older tab. No manual cleanup is needed.");
          void (async () => {
            await releaseRecognition();
            const reclaimed = await reclaimStaleVoiceClients();
            busyRecoveryDeadline.current = reclaimed.reclaimedClients > 0 ? Date.now() + 10_000 : 0;
            recordVoiceAcquisitionDiagnostic({
              phase: "stale-reclaim",
              detail: `${reclaimed.supported ? "supported" : "unavailable"}:${reclaimed.reclaimedClients}:${reclaimed.timedOut ? "timeout" : "complete"}`,
            });
            await new Promise((resolve) => window.setTimeout(resolve, reclaimed.reclaimedClients > 0 ? 650 : 850));
            busyRecoveryInFlight.current = false;
            if (!ownsActiveForeground()) return;
            startRecognition();
          })();
          return;
        }
        if (error === "recognition-busy" && ownsVoice && Date.now() < busyRecoveryDeadline.current && busyRecoveryAttempt.current < 5) {
          const delay = [900, 1_500, 2_500, 3_500][Math.max(0, busyRecoveryAttempt.current - 1)]!;
          if (Date.now() + delay <= busyRecoveryDeadline.current) {
            busyRecoveryAttempt.current += 1; busyRecoveryInFlight.current = true; setStatus("live-idle");
            setMessage("Chrome is finishing the stale voice release. Flow will keep this acquisition moving automatically.");
            void (async () => {
              await releaseRecognition();
              await new Promise((resolve) => window.setTimeout(resolve, delay));
              busyRecoveryInFlight.current = false;
              if (!ownsActiveForeground()) return;
              startRecognition();
            })();
            return;
          }
        }
        const fatalStatus: FlowLiveStatus | undefined = error === "permission-denied" ? "permission-denied"
          : error === "microphone-unavailable" ? "microphone-unavailable"
            : error === "recognition-busy" ? "recognition-busy"
              : error === "start-failed" ? "start-failed"
                : ["language-not-supported", "unavailable"].includes(error) ? "unavailable" : undefined;
        if (fatalStatus) {
          fatal.current = true; enabled.current = false; busyRecoveryAttempt.current = 0; busyRecoveryDeadline.current = 0; generation.current += 1;
          window.clearTimeout(restartTimer.current); restartTimer.current = undefined;
          void releaseRecognition().then(() => ownership.release());
          setStatus(fatalStatus);
        } else {
          recoveryAttempts.current += 1;
          setStatus("live-idle");
        }
        setMessage(errors[error] ?? "Flow Live paused. Typed commands still work.");
      },
      onEnd: () => {
        if (!ownsActiveForeground()) return;
        listening.current = false;
        if (busyRecoveryInFlight.current || recoveryAttempts.current > 5) return;
        setStatus("live-idle"); setMessage("Flow Live is ready.");
        if (restartTimer.current !== undefined) return;
        const delay = Math.min((adapter.restartDelayMs ?? 280) * 2 ** recoveryAttempts.current, 4_000);
        restartTimer.current = window.setTimeout(() => { restartTimer.current = undefined; startRecognition(); }, delay);
      },
    }, { locale, contextPhrases: buildContextPhrases(latestPhrases.current), endpointMode: () => latestEndpointMode.current, isCompleteAtNativeEnd });
  }, [adapter, locale, releaseRecognition, sessionId, isCompleteAtNativeEnd]);

  const claimAndStart = useCallback((activeGeneration: number) => {
    const ownership = getOwnership();
    setStatus("live-idle"); setMessage("Claiming Flow Live for this tab…");
    void (async () => {
      if (nativeRelease.current) await nativeRelease.current;
      if (ownershipRef.current !== ownership || !enabled.current || fatal.current || generation.current !== activeGeneration || document.hidden) { voiceDebug("recognition.start.blocked", { reason: "lifecycle-cancelled-or-hidden", activeGeneration, generation: generation.current }); return; }
      voiceDebug("ownership.request", { sessionId, activeGeneration });
      const outcome = await ownership.claimWithRelease();
      voiceDebug(outcome.granted ? "ownership.granted" : "ownership.denied", { sessionId, ...outcome });
      recordVoiceAcquisitionDiagnostic({ phase: "claim", detail: `${outcome.granted ? "granted" : "denied"}:${outcome.priorRelease}` });
      if (ownershipRef.current !== ownership || !enabled.current || fatal.current || generation.current !== activeGeneration || document.hidden) {
        voiceDebug("recognition.start.blocked", { reason: "lifecycle-cancelled-or-hidden", activeGeneration, generation: generation.current });
        if (outcome.granted) ownership.release();
        return;
      }
      if (!outcome.granted) {
        enabled.current = false;
        if (ownership.isDestroyed()) {
          fatal.current = true; setStatus("start-failed");
          setMessage("Flow Live was reset locally. Reload this tab, then Retry.");
        } else {
          setStatus("moved"); setMessage("Flow Live moved to another tab.");
        }
        return;
      }
      await latestOwnershipGranted.current();
      if (!enabled.current || fatal.current || generation.current !== activeGeneration || document.hidden || !ownership.isOwner()) {
        voiceDebug("recognition.start.blocked", { reason: "lifecycle-cancelled-or-ownership-lost" });
        ownership.release();
        return;
      }
      if (outcome.priorRelease === "timed-out") setMessage("The prior Flow tab did not confirm release. Making one guarded acquisition attempt…");
      busyRetryUsed.current = false; startRecognition();
    })();
  }, [getOwnership, startRecognition, sessionId]);

  const start = useCallback(() => {
    if (enabled.current) { voiceDebug("recognition.start.blocked", { reason: "session-already-active" }); return; }
    generation.current += 1; enabled.current = true; fatal.current = false; recoveryAttempts.current = 0; busyRetryUsed.current = false; busyRecoveryInFlight.current = false; busyRecoveryAttempt.current = 0; busyRecoveryDeadline.current = 0;
    claimAndStart(generation.current);
  }, [claimAndStart]);

  useEffect(() => {
    voiceDebug("session.mount", { sessionId });
    voiceDebug("adapter.kind", { kind: adapter.constructor.name, supported: adapter.supported });
    window.clearTimeout(ownershipTeardown.current); ownershipTeardown.current = undefined;
    const ownership = getOwnership();
    ownership.setPreemptHandler(async () => {
      const wasEnabled = enabled.current || listening.current;
      enabled.current = false; listening.current = false; fatal.current = false; busyRecoveryInFlight.current = false; busyRecoveryAttempt.current = 0; busyRecoveryDeadline.current = 0; generation.current += 1;
      window.clearTimeout(restartTimer.current); restartTimer.current = undefined;
      if (wasEnabled) {
        setInterim(""); latestInterim.current(""); setStatus("moved"); setMessage("Flow Live moved to another tab.");
      }
      return await releaseRecognition() === "released";
    });
    function visibility() {
      if (document.hidden && enabled.current) {
        listening.current = false; generation.current += 1; window.clearTimeout(restartTimer.current); restartTimer.current = undefined;
        void releaseRecognition().then(() => ownership.release()); setStatus("suspended"); setMessage("Flow Live paused while this tab is hidden.");
      } else if (!document.hidden && enabled.current && !fatal.current) claimAndStart(generation.current);
    }
    function pageHide() { if (enabled.current) stop(); }
    function command(event: Event) { ((event as CustomEvent).detail === "sleep" ? stop : start)(); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape" && enabled.current) stop(); }
    document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", pageHide); window.addEventListener("flow-live-command", command); window.addEventListener("keydown", escape);
    return () => {
      voiceDebug("session.unmount", { sessionId, reason: "lifecycle-cancelled" });
      document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", pageHide); window.removeEventListener("flow-live-command", command); window.removeEventListener("keydown", escape);
      const released = stop();
      // React StrictMode immediately remounts committed effects in development.
      // Defer permanent teardown for one task so that probe can cancel it and
      // reuse the live coordinator; a real unmount still releases immediately
      // above and closes the subscription exactly once here.
      ownershipTeardown.current = window.setTimeout(() => {
        void released.finally(() => {
          if (ownershipRef.current !== ownership) return;
          ownership.destroy();
          if (!providedOwnership) ownershipRef.current = undefined;
          ownershipTeardown.current = undefined;
        });
      }, 0);
    };
  }, [adapter, claimAndStart, getOwnership, providedOwnership, releaseRecognition, sessionId, start, stop]);

  return { supported: adapter.supported, active: ["live-idle", "listening", "interpreting", "suspended"].includes(status), status, interim, lastTranscript, message, issue, clearIssue: () => setIssue(undefined), start, stop };
}
