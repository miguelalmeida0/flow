import { motion } from "motion/react";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useFlowEnvironment, useFlowTransition } from "../../app/FlowEnvironmentProvider";
import type { RecognitionAdapter, VoiceLocale } from "../../features/day-planner/voice/recognition";
import { useFlowLiveSession } from "../../features/voice/useFlowLiveSession";
import type { LiveOwnershipCoordinator } from "../../features/voice/liveOwnership";
import { isCompleteNavigationAtNativeEnd, rankGlobalTranscript } from "./globalInterpreter";
import type { CapturedCommandContext } from "../../app/environment-types";
import { Icon } from "../design-system/Icon";
import { useReducedMotionPreference } from "../motion/useReducedMotionPreference";
import { useCommandSurface } from "./useCommandSurface";
import { RewardPreferencesButton } from "../rewards/RewardPreferencesButton";
import { buildContextPhrases } from "../../features/day-planner/voice/contextPhrases";
import { readWakeEnvelope } from "../../features/voice-home/wakeEnvelope";
import { nativeContinuationPresentation } from "../../features/studio/nativeStudioCapability";
import { voiceDebug } from "../../features/day-planner/voice/voiceDebug";
import { calendarReferenceScope } from "../../app/calendarCommandScope";
import { BrowserPromptSpeech, PromptSpeechCoordinator, type PromptSpeechAdapter } from "../../features/voice/promptSpeech";
import { beginRecordingUtterance, sampleRecordingUtterance, finishRecordingUtterance, discardRecordingUtterance } from "../../features/studio/journalRuntimeClock";

const VOICE_PERMISSION_MARKER = "flow.voice.permission-granted.v1";

export function GlobalCommandDock({ recognitionAdapter, voiceLocale, liveOwnership, promptSpeechAdapter }: { recognitionAdapter?: RecognitionAdapter; voiceLocale?: VoiceLocale; liveOwnership?: LiveOwnershipCoordinator; promptSpeechAdapter?: PromptSpeechAdapter }) {
  const environment = useFlowEnvironment();
  const transition = useFlowTransition();
  const { setFlowLiveStatus } = environment;
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [heardInterim, setHeardInterim] = useState("");
  const [promptSpeech] = useState(() => new PromptSpeechCoordinator(promptSpeechAdapter ?? new BrowserPromptSpeech()));
  const [promptIssue, setPromptIssue] = useState<string>();
  const settingsOpen = environment.commandPresentation.settingsOpen;
  const setSettingsOpen = useCallback((open: boolean) => {
    if (open !== environment.commandPresentation.settingsOpen) environment.dispatchPresentation({ type: "command-surface", surface: "settings", open });
  }, [environment]);
  const entranceRef = useRef(environment.voiceWorld.entrance);
  entranceRef.current = environment.voiceWorld.entrance;
  const reducedMotion = useReducedMotionPreference();
  const effectiveLocale = voiceLocale ?? "en-US";
  const referenceCalendar = calendarReferenceScope(environment.document, environment.temporalScope);
  const pendingChoices = environment.pending?.media ? environment.conversationContext.pendingChoices : (environment.pending?.friend?.kind === "friend-followup" || environment.pending?.friend?.kind === "recipient" || environment.pending?.friend?.kind === "marker" || environment.pending?.friend?.kind === "marker-action") ? environment.pending.friend.choices : (environment.pending?.friend?.kind === "calendar-message" || environment.pending?.friend?.kind === "marker-calendar") ? environment.pending.friend.proposal.choices : (environment.pending?.clarification ?? environment.pending?.alternatives?.clarification)?.choices;
  const calendarTitles = referenceCalendar.events.map(({ title }) => title);
  const selectedCalendarTitle = environment.document.calendar.events.find(({ id }) => id === environment.selectedCalendarEventId)?.title;
  const phrases = [
    ...buildContextPhrases(calendarTitles, selectedCalendarTitle).map(({ phrase }) => phrase),
    ...environment.document.captures.map(({ title }) => title), ...environment.document.plans.map(({ title }) => title),
    ...environment.document.steps.map(({ title }) => title), ...environment.document.people.map(({ name }) => name),
    ...environment.document.studio.journalEntries.map(({ title }) => title),
    ...environment.document.studio.atmospherePresets.map(({ name }) => name),
    ...environment.document.studio.memories.map(({ title }) => title),
    "Home", "Today", "Focus", "Weather and Outfit", "People", "Good to know", "Capture", "Outcomes", "Commitments", "Journal", "Atmosphere", "Memories",
    "Open the calendar", "Open tomorrow", "Open my journal", "Play Sunday evening", "Bookmark that", "What needs me now", "Turn that into an outcome", "Pause listening",
  ];
  const voice = useFlowLiveSession(
    (text, commandId, boundary) => {
      setHeardInterim("");
      const audible = promptSpeech.assess(text);
      if (audible === "echo") { discardRecordingUtterance(); return; }
      if (audible === "reask") {
        discardRecordingUtterance();
        const detail = "That answer overlapped playback. The preview is still waiting. Please repeat your choice after the audio stops.";
        setPromptIssue(detail);
        void promptSpeech.speak(detail, effectiveLocale).catch(() => undefined);
        return;
      }
      setPromptIssue(undefined);
      finishRecordingUtterance(text);
      setDraft(text); setEditing(false);
      const captured: CapturedCommandContext = { context: { ...environment.conversationContext, route: environment.route, focusedEntityId: environment.focusedEntityId, activePlanId: environment.activePlanId }, scope: environment.temporalScope, selectedCalendarEventId: environment.selectedCalendarEventId, recommendations: structuredClone(environment.nowCandidates), finalSegments: boundary?.assembly?.selectedFinalSegments, confirmationAuthority: environment.confirmationAuthority };
      const dispatch = (value: string) => environment.runCommand(value, "voice", commandId, captured);
      const envelope = readWakeEnvelope(text);
      voiceDebug("wake.transcript", { text, envelope, entrance: entranceRef.current });
      if (entranceRef.current === "wake-armed") {
        if (envelope.kind === "none") {
          stayOpen();
          if (isCompleteNavigationAtNativeEnd(text)) {
            entranceRef.current = "active";
            flushSync(() => environment.activateVoiceHome(text));
            voiceDebug("wake.navigation", { text, commandId });
            dispatch(text);
            return;
          }
          environment.waitForVoiceWake(text);
          return;
        }
        entranceRef.current = "wake-reward";
        flushSync(() => environment.wakeVoiceHome(text));
        if (envelope.kind === "wake-command") {
          stayOpen();
          window.setTimeout(() => dispatch(text), reducedMotion ? 0 : 90);
        }
        return;
      }
      if (entranceRef.current !== "active") {
        // Once the wake word has been acknowledged, the next utterance wins.
        // It cancels celebration/preparation instead of being dropped while
        // presentation catches up with the user's intent.
        if (envelope.kind === "wake") {
          flushSync(() => environment.wakeVoiceHome(text));
          return;
        }
        entranceRef.current = "active";
        environment.activateVoiceHome(text);
        dispatch(text);
        return;
      }
      if (envelope.kind === "wake") {
        flushSync(() => environment.wakeVoiceHome(text));
        return;
      }
      dispatch(text);
    },
    (text) => { if (promptSpeech.interim(text) === "echo") return; setHeardInterim(text); sampleRecordingUtterance(text); environment.setListeningFeedback(text); },
    phrases,
    recognitionAdapter,
    effectiveLocale,
    (transcript) => rankGlobalTranscript(transcript, {
      ...environment.conversationContext,
      route: environment.route,
      focusedEntityId: environment.focusedEntityId,
      activePlanId: environment.activePlanId,
      pending: environment.pending ? environment.pending.clarification || environment.pending.friend?.kind === "recipient" ? "clarification" : "confirmation" : undefined,
      friendPending: Boolean(environment.pending?.friend),
      friendPendingKind: environment.pending?.friend?.kind,
      pendingChoices,
      currentTimeScope: environment.temporalScope,
    }, environment.todayDateKey, referenceCalendar, environment.selectedCalendarEventId, environment.document.steps, environment.document.preferences.workdayEndMinutes, environment.document.people, environment.document.friends?.groups),
    liveOwnership,
    environment.syncFromStorage,
    environment.conversationContext.voiceMode === "journal-longform" || environment.conversationContext.voiceMode === "voice-note-longform" ? "journal" : "command",
    isCompleteNavigationAtNativeEnd,
    () => { promptSpeech.beginUtterance(); beginRecordingUtterance(); },
  );
  const promptText = ["clarification", "confirmation"].includes(environment.feedback.phase) ? `${environment.feedback.title}. ${environment.feedback.detail ?? ""}` : undefined;
  useEffect(() => {
    if (!promptText || !voice.active) return;
    let current = true;
    setPromptIssue(undefined);
    void promptSpeech.speak(promptText, effectiveLocale).catch((error: unknown) => { if (current) setPromptIssue(error instanceof Error ? error.message : "Spoken prompts are unavailable. The question is visible."); });
    return () => { current = false; promptSpeech.cancel(); };
  }, [effectiveLocale, promptSpeech, promptText, environment.pending?.baseRevision, environment.feedback.speechKey, voice.active]);
  useEffect(() => () => promptSpeech.cancel(), [promptSpeech]);
  useEffect(() => { setFlowLiveStatus(voice.status); }, [setFlowLiveStatus, voice.status]);
  useEffect(() => {
    voiceDebug("dock.mount", { supported: voice.supported, entrance: entranceRef.current });
    if (!voice.supported) {
      voiceDebug("recognition.start.blocked", { reason: "adapter-unavailable" });
      environment.disableVoiceWakeGate();
      return;
    }
    // Native recognition owns permission prompting. A Permissions API probe
    // cannot grant access and must not silently strand a fresh-origin wake gate.
    voice.start();
    return () => voiceDebug("dock.unmount", { reason: "lifecycle-cancelled" });
  // Acquisition is mount-owned. Status changes and user Stop must not restart it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.supported]);
  useEffect(() => {
    if (voice.status === "listening") {
      try { window.localStorage.setItem(VOICE_PERMISSION_MARKER, "granted"); } catch { /* storage may be disabled */ }
    }
  }, [voice.status]);
  const retryable = ["permission-denied", "microphone-unavailable", "recognition-busy", "start-failed"].includes(voice.status);
  const dictating = environment.conversationContext.voiceMode === "journal-longform" || environment.conversationContext.voiceMode === "voice-note-longform";
  const voiceNeedsSurface = Boolean(voice.issue) || ["moved", "permission-denied", "microphone-unavailable", "recognition-busy", "start-failed", "unavailable"].includes(voice.status);
  const actionable = Boolean(environment.pending || environment.calendarPreview || transition || voiceNeedsSurface || settingsOpen)
    || ["understanding", "clarification", "confirmation", "error"].includes(environment.feedback.phase);
  const requestComposer = useCallback((open: boolean) => environment.dispatchPresentation({ type: "command-surface", surface: "composer", open }), [environment]);
  const { expanded, inputRef, stayOpen } = useCommandSurface(actionable, environment.feedback.phase, environment.lastTranscript, dictating || environment.voiceWorld.entrance === "wake-armed" || voice.status === "listening", !dictating || environment.feedback.title !== "Journal updated.", environment.commandPresentation.composerRequest, requestComposer);
  // Acquisition/ownership failures are live facts; a prior completed command
  // must never cover them with "ready" or "listening resumes" feedback.
  const voiceFailure = voiceNeedsSurface && !environment.pending
    && (Boolean(voice.issue) || /^Flow Live ready|^Tell Flow|^Ready|^Listening/i.test(environment.feedback.title) || environment.feedback.phase === "ready");
  const changeSettingsOpen = useCallback((open: boolean) => {
    setSettingsOpen(open);
    if (open) stayOpen();
  }, [stayOpen, setSettingsOpen]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = inputRef.current?.value ?? draft;
    if (!text.trim()) return;
    voice.clearIssue();
    setSettingsOpen(false);
    stayOpen();
    environment.activateVoiceHome(text);
    environment.runCommand(text, "type");
    setDraft(text); setEditing(false);
    inputRef.current?.blur();
  }

  function toggleVoice() {
    setSettingsOpen(false);
    stayOpen();
    if (!voice.active) {
      window.dispatchEvent(new Event("flow-studio-audio-unlock"));
      // The explicit fallback control is itself the user's wake gesture. The
      // no-click path remains wake-word gated when permission was already
      // granted and the session resumes automatically.
      entranceRef.current = "active";
      environment.activateVoiceHome();
    }
    (voice.active ? voice.stop : voice.start)();
  }

  return (
    <motion.aside
      aria-label="Global Flow command"
      className="relative mx-auto w-full max-w-[630px]"
      data-command-expanded={expanded ? "true" : "false"}
      data-flow-region="command"
      data-last-transcript={environment.lastTranscript || undefined}
      data-voice-energy-origin
      initial={expanded && !reducedMotion ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0.12 } : { type: "spring", stiffness: 280, damping: 32 }}
    >
      {expanded ? <div className={`overflow-visible rounded-[28px] border bg-flow-elevated text-flow-ink ${environment.feedback.phase === "confirmation" ? "border-flow-orange/70" : "border-flow-border"}`}>
        <form className="flex min-h-[58px] items-center gap-2 px-2 sm:px-4" onSubmit={submit}>
          <span className="ml-1 grid size-9 shrink-0 place-items-center rounded-full text-[#4D91F5]"><Icon name="spark" size={18} /></span>
          <input data-action-id="command.submit"
            aria-label="Tell Flow what to change"
            className="min-w-0 flex-1 bg-transparent px-2 pr-[78px] text-sm text-flow-ink outline-none placeholder:text-flow-muted sm:text-base"
            data-flow-action="Flow command text"
            onChange={(event) => { setDraft(event.target.value); setEditing(true); stayOpen(); }}
            onFocus={() => stayOpen()}
            onKeyDown={() => stayOpen()}
            onPointerDown={() => stayOpen()}
            placeholder={voice.status === "listening" ? "Listening…" : "Ask Flow or give a command…"}
            ref={inputRef}
            value={editing ? draft : heardInterim || draft}
          />
          <button data-action-id="session.control" aria-label={voice.active ? "Stop Flow Live" : retryable ? "Retry Flow Live" : "Start Flow Live"} className={`grid size-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue ${voice.active ? "bg-flow-blue-soft text-flow-blue-strong" : "text-flow-ink hover:bg-flow-neutral-soft"}`} data-flow-action="Flow Live session" disabled={!voice.supported} onClick={toggleVoice} title={retryable ? "Retry microphone access" : undefined} type="button"><Icon name={voice.active ? "pause" : "mic"} size={22} /></button>
        </form>
        {(environment.feedback.phase !== "ready" || voice.status !== "sleeping" || environment.pending) && (
          <div aria-live="polite" className="flex min-h-8 flex-wrap items-center justify-center gap-x-3 border-t border-flow-border px-4 py-2 text-center text-[11px] text-flow-secondary" data-feedback-phase={environment.feedback.phase} data-feedback-transcript={environment.feedback.transcript} data-pending-change={Boolean(environment.pending)} data-feedback-transaction-id={environment.feedback.phase === "completed" ? environment.snapshot.lastTransaction?.id : undefined} data-flow-feedback>
            <span className="text-flow-ink">{voiceFailure ? "Voice needs attention" : environment.feedback.title}</span>
            <span className="break-words">{voiceFailure ? voice.issue ?? voice.message : environment.feedback.detail ?? voice.message}</span>
            {promptIssue && <span className="text-flow-error" role="status">{promptIssue}</span>}
            {voiceNeedsSurface && !voiceFailure && !environment.pending && <span className="line-clamp-2 text-flow-error">{voice.message}</span>}
            {environment.feedback.transcript && <span className="max-w-full break-words text-[#52606D]" title={environment.feedback.transcript}>“{environment.feedback.transcript}”</span>}
            {(environment.pending?.capture || environment.pending?.media || environment.pending?.clarification) && <button data-action-id="pending.cancel" className="min-h-11 rounded-md font-semibold text-flow-secondary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-flow-blue" onClick={environment.cancel} type="button">Cancel</button>}
            {pendingChoices?.slice(0, 3).map((choice) => <button data-action-id="pending.clarification-choice" className="min-h-11 rounded-md font-semibold text-[#245D9C] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245D9C] focus-visible:ring-offset-2 focus-visible:ring-offset-flow-elevated" data-flow-action="Choose clarification" key={choice.id} onClick={() => environment.choosePending(choice.id)} type="button">{choice.label}</button>)}
            {environment.pending && !environment.pending.capture && !environment.pending.media && !environment.pending.clarification && environment.pending.friend?.kind !== "recipient" && environment.pending.friend?.kind !== "marker" && environment.pending.friend?.kind !== "marker-action" && !((environment.pending.friend?.kind === "calendar-message" || environment.pending.friend?.kind === "marker-calendar") && environment.pending.friend.proposal.question) && <><button data-action-id={environment.pending.nativeContinuation?.actionId ?? "pending.confirm"} className="min-h-11 rounded-md font-semibold text-[#245D9C] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245D9C] focus-visible:ring-offset-2 focus-visible:ring-offset-flow-elevated" data-flow-action={environment.pending.nativeContinuation ? "Continue native action" : "Confirm destructive action"} data-native-action-id={environment.pending.nativeContinuation?.actionId} onClick={environment.pending.nativeContinuation ? environment.continueNative : environment.confirm} type="button">{environment.pending.nativeContinuation ? nativeContinuationPresentation(environment.pending.nativeContinuation).label : environment.pending.confirmLabel ?? "Confirm"}</button><button data-action-id="pending.cancel" className="min-h-11 rounded-md font-semibold text-[#52606D] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#52606D] focus-visible:ring-offset-2 focus-visible:ring-offset-flow-elevated" data-flow-action="Cancel destructive action" onClick={environment.cancel} type="button">Cancel</button></>}
          </div>
        )}
      </div> : <div className="flex w-full max-w-full items-center gap-1 rounded-[28px] border border-[#D8CEC2] bg-flow-elevated p-1.5 pl-[58px] shadow-[0_16px_44px_rgba(35,43,55,0.08)]">
        <button data-action-id="command.open-composer" aria-label="Open Flow command" className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-sm text-[#52606D] hover:bg-flow-neutral-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue" data-flow-action="Open Flow command" onClick={() => requestComposer(true)} type="button"><Icon name="spark" size={18} /><span className="min-w-0 max-w-[440px] break-words text-left">{heardInterim || (environment.lastTranscript && environment.feedback.phase === "completed" ? <><span className="block text-flow-ink">{environment.feedback.title}</span><span className="block text-xs">{environment.feedback.detail}</span><span className="block text-xs">“{environment.lastTranscript}”</span></> : dictating ? "Journal recording · listening" : environment.voiceWorld.entrance === "wake-armed" ? "Keyboard alternative" : voice.active ? "Listening" : "Ask Flow")}</span></button>
        <button data-action-id="session.control" aria-label={voice.active ? "Stop Flow Live" : retryable ? "Retry Flow Live" : "Start Flow Live"} className={`grid size-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue ${voice.active ? "bg-flow-blue-soft text-flow-blue-strong" : "text-flow-ink hover:bg-flow-neutral-soft"}`} data-flow-action="Flow Live session" disabled={!voice.supported} onClick={toggleVoice} type="button"><Icon name={voice.active ? "pause" : "mic"} size={22} /></button>
      </div>}
      <div className={expanded ? "absolute right-[62px] top-[9px] z-10" : "absolute left-1.5 top-1.5 z-10"}>
        <RewardPreferencesButton compact onOpenChange={changeSettingsOpen} open={settingsOpen} />
      </div>
    </motion.aside>
  );
}
