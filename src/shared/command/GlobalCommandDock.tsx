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
import { getVoiceCompanionToken } from "../../kernel/voice/voiceCompanionClient";
import { getRuntimeMode, isBrowserVoiceAllowed } from "../../app/runtimeMode";
import { CloudVoiceConsent } from "../../features/voice/CloudVoiceConsent";
import { useHostedAccess } from "../../features/voice/useHostedAccess";
import { useOptionalStudioRuntime } from "../../features/studio/StudioRuntimeProvider";

const VOICE_PERMISSION_MARKER = "flow.voice.permission-granted.v1";

export function GlobalCommandDock({ recognitionAdapter, voiceLocale, liveOwnership, promptSpeechAdapter }: { recognitionAdapter?: RecognitionAdapter; voiceLocale?: VoiceLocale; liveOwnership?: LiveOwnershipCoordinator; promptSpeechAdapter?: PromptSpeechAdapter }) {
  const mode = getRuntimeMode();
  const browserVoiceAllowed = isBrowserVoiceAllowed(mode);
  const environment = useFlowEnvironment();
  const transition = useFlowTransition();
  const access = useHostedAccess(mode === "hosted", environment.hostedVoice.stop);
  const studio = useOptionalStudioRuntime();
  const dockRef = useRef<HTMLElement>(null);
  const hosted = mode === "hosted";
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
      // Ownership boundary (see src/kernel/voice/voiceOwnership.ts): once the
      // local Kyutai pipeline is available, it — not this browser
      // SpeechRecognition path — owns the ACTIVE conversational turn. This
      // recognizer keeps running for wake-word spotting only (the
      // isCompleteNavigationAtNativeEnd bypass below fires BEFORE wake, when
      // Kyutai's own mic is provably not yet capturing anything, so it is
      // intentionally NOT gated here) — every dispatch call site reached
      // once the conversation is already awake goes through this instead of
      // `dispatch` directly, so it becomes a no-op rather than a second,
      // competing kernel call for the same physical utterance.
      const dispatchIfOwned = (value: string) => {
        if (environment.voiceInputOwner !== "browser-fallback") {
          voiceDebug("wake.suppressedBrowserDispatch", { text: value, commandId });
          return;
        }
        dispatch(value);
      };
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
          window.setTimeout(() => dispatchIfOwned(text), reducedMotion ? 0 : 90);
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
        dispatchIfOwned(text);
        return;
      }
      if (envelope.kind === "wake") {
        flushSync(() => environment.wakeVoiceHome(text));
        return;
      }
      dispatchIfOwned(text);
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
    // Voice ownership (see src/kernel/voice/voiceOwnership.ts) applies to
    // SPEAKING too, not just listening: once Kyutai owns the session, it
    // already speaks this exact feedback itself (FlowEnvironmentProvider's
    // own speak() effect) through a barge-in-aware TTS pipeline. Without
    // this gate, the browser's speechSynthesis would ALSO speak the same
    // confirmation at the same time, and a user saying "confirm" while
    // EITHER one is still talking would hit this file's own
    // PromptSpeechCoordinator.assess(), which deliberately treats a
    // confirmation word heard during overlap as too ambiguous to trust
    // (see promptSpeech.ts's "reask" branch) — exactly the reported "That
    // answer overlapped playback" bug (see FINAL REPORT's physical-test
    // repair C). Kyutai's own barge-in has no such special-casing: it
    // cancels TTS immediately and the next utterance goes through the same
    // production reply-handling any typed "confirm" already uses.
    if (!promptText || !voice.active || environment.voiceInputOwner !== "browser-fallback") return;
    let current = true;
    setPromptIssue(undefined);
    void promptSpeech.speak(promptText, effectiveLocale).catch((error: unknown) => { if (current) setPromptIssue(error instanceof Error ? error.message : "Spoken prompts are unavailable. The question is visible."); });
    return () => { current = false; promptSpeech.cancel(); };
  }, [effectiveLocale, promptSpeech, promptText, environment.pending?.baseRevision, environment.feedback.speechKey, voice.active, environment.voiceInputOwner]);
  useEffect(() => () => promptSpeech.cancel(), [promptSpeech]);
  useEffect(() => { if (browserVoiceAllowed) setFlowLiveStatus(voice.status); }, [browserVoiceAllowed, setFlowLiveStatus, voice.status]);
  useEffect(() => {
    voiceDebug("dock.mount", { supported: voice.supported, entrance: entranceRef.current });
    if (getRuntimeMode() !== "local") return;
    // The reclaimer reloads an older document with this marker. Automatic
    // acquisition here would immediately take voice back from the new owner.
    if (new URLSearchParams(window.location.search).has("flow-live-yield")) return;
    // A paired local voice installation owns capture even during warm-up
    // and reconnect. Starting Chrome recognition here creates a competing
    // microphone and silently falls back to cloud STT on local failure.
    if (!recognitionAdapter && getVoiceCompanionToken()) return;
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
    if (browserVoiceAllowed && voice.status === "listening") {
      try { window.localStorage.setItem(VOICE_PERMISSION_MARKER, "granted"); } catch { /* storage may be disabled */ }
    }
  }, [browserVoiceAllowed, voice.status]);
  const selectedActive = hosted ? environment.hostedVoice.active : browserVoiceAllowed && voice.active;
  const selectedListening = hosted ? environment.hostedVoice.status === "active" : browserVoiceAllowed && voice.status === "listening";
  const voiceMessage = hosted ? environment.hostedVoice.reason ?? (environment.hostedVoice.status === "connecting" ? "Connecting cloud voice…" : selectedListening ? "Cloud voice active" : "Voice stopped. Supported typed commands still work.") : browserVoiceAllowed ? voice.supported ? voice.message : "Voice recognition is unavailable here. Typed commands still work." : "Supported typed commands are available.";
  const voiceLabel = hosted ? selectedActive ? "Stop voice" : access.authenticated ? "Start voice" : "Enable cloud features" : voice.active ? "Stop Flow Live" : "Start Flow Live";
  const voiceDisabled = hosted ? access.busy || (access.authenticated && !access.session?.speechEnabled && !selectedActive) : !browserVoiceAllowed || !voice.supported;
  const retryable = ["permission-denied", "microphone-unavailable", "recognition-busy", "start-failed"].includes(voice.status);
  const dictating = environment.conversationContext.voiceMode === "journal-longform" || environment.conversationContext.voiceMode === "voice-note-longform";
  const voiceNeedsSurface = hosted ? Boolean(environment.hostedVoice.reason && environment.hostedVoice.reason !== "Voice stopped.") : browserVoiceAllowed && (!voice.supported || Boolean(voice.issue) || ["moved", "permission-denied", "microphone-unavailable", "recognition-busy", "start-failed", "unavailable"].includes(voice.status));
  const actionable = Boolean(environment.pending || environment.calendarPreview || environment.confirmationAuthority || environment.hasUnsavedChanges || transition || voiceNeedsSurface || settingsOpen)
    || ["understanding", "clarification", "confirmation", "error"].includes(environment.feedback.phase);
  const requestComposer = useCallback((open: boolean) => environment.dispatchPresentation({ type: "command-surface", surface: "composer", open }), [environment]);
  const { expanded, inputRef, stayOpen } = useCommandSurface(actionable, environment.feedback.phase, environment.lastTranscript, dictating || browserVoiceAllowed && environment.voiceWorld.entrance === "wake-armed" || selectedListening, !dictating || environment.feedback.title !== "Journal updated.", environment.commandPresentation.composerRequest, requestComposer);
  // Acquisition/ownership failures are live facts; a prior completed command
  // must never cover them with "ready" or "listening resumes" feedback.
  const voiceFailure = voiceNeedsSurface && !environment.pending
    && (!hosted && Boolean(voice.issue) || /^Flow Live ready|^Tell Flow|^Ready|^Listening/i.test(environment.feedback.title) || environment.feedback.phase === "ready");
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
    if (hosted) {
      stayOpen();
      if (selectedActive) environment.hostedVoice.stop();
      else if (access.authenticated && access.session?.speechEnabled) environment.hostedVoice.start();
      else {
        const panel = dockRef.current?.querySelector<HTMLDetailsElement>("[data-hosted-access]");
        if (panel) { panel.open = true; panel.querySelector<HTMLInputElement>("input")?.focus({preventScroll:true}); }
      }
      return;
    }
    if (!browserVoiceAllowed) return;
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
      ref={dockRef}
      aria-label="Global Flow command"
      className="relative mx-auto w-full max-w-[630px]"
      data-command-expanded={expanded ? "true" : "false"}
      data-flow-region="command"
      data-last-transcript={environment.lastTranscript || undefined}
      data-last-utterance-id={voice.lastUtteranceId}
      data-voice-energy-origin
      initial={expanded && !reducedMotion ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedMotion ? { duration: 0.12 } : { type: "spring", stiffness: 280, damping: 32 }}
    >
      {hosted && <CloudVoiceConsent access={access} voice={environment.hostedVoice} recording={Boolean(studio && ["requesting", "recording", "paused"].includes(studio.recorder.status))} />}
      <div className="relative">
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
            placeholder={selectedListening ? "Listening…" : "Ask Flow or give a command…"}
            ref={inputRef}
            value={editing ? draft : heardInterim || draft}
          />
          <button data-action-id={hosted ? "cloud.voice" : "session.control"} aria-label={!hosted && retryable ? "Retry Flow Live" : voiceLabel} className={`grid size-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue ${selectedActive ? "bg-flow-blue-soft text-flow-blue-strong" : "text-flow-ink hover:bg-flow-neutral-soft"}`} data-flow-action="Flow Live session" disabled={voiceDisabled} onClick={toggleVoice} title={retryable ? "Retry microphone access" : undefined} type="button"><Icon name={selectedActive ? "pause" : "mic"} size={22} /></button>
        </form>
        {(environment.feedback.phase !== "ready" || selectedActive || voiceNeedsSurface || environment.pending || environment.confirmationAuthority || environment.hasUnsavedChanges) && (
          <div aria-live="polite" className="flex min-h-8 flex-wrap items-center justify-center gap-x-3 border-t border-flow-border px-4 py-2 text-center text-[11px] text-flow-secondary" data-feedback-phase={environment.feedback.phase} data-feedback-transcript={environment.feedback.transcript} data-pending-change={Boolean(environment.pending)} data-feedback-transaction-id={environment.feedback.phase === "completed" ? environment.snapshot.lastTransaction?.id : undefined} data-flow-feedback>
            <span className="text-flow-ink">{voiceFailure ? "Voice needs attention" : environment.feedback.title}</span>
            <span className="break-words">{voiceFailure ? hosted ? voiceMessage : voice.issue ?? voiceMessage : environment.feedback.detail ?? voiceMessage}</span>
            {!environment.pending && environment.confirmationAuthority && environment.feedback.phase === "confirmation" && <>
              <button data-action-id="pending.confirm" className="min-h-11 rounded-md px-2 font-semibold underline focus-visible:ring-2 focus-visible:ring-flow-blue" onClick={()=>{ environment.confirm(); stayOpen(true); }} type="button">Confirm</button>
              <button data-action-id="pending.cancel" className="min-h-11 rounded-md px-2 underline focus-visible:ring-2 focus-visible:ring-flow-blue" onClick={()=>{ environment.cancel(); stayOpen(true); }} type="button">Cancel</button>
            </>}
            {environment.hasUnsavedChanges && <div className="w-full" role="status"><p>Your request has not been saved. Keep this tab open until you retry or discard it.</p>
              <button data-action-id="storage.retry-save" className="min-h-11 rounded-md px-2 font-semibold underline focus-visible:ring-2 focus-visible:ring-flow-blue" onClick={()=>{ void environment.retrySave().then(()=>stayOpen(true)); }} type="button">Retry save</button>
              <button data-action-id="storage.discard-unsaved" className="min-h-11 rounded-md px-2 underline focus-visible:ring-2 focus-visible:ring-flow-blue" onClick={()=>{ environment.discardUnsavedChanges(); stayOpen(true); }} type="button">Discard unsaved request</button>
            </div>}
            {promptIssue && <span className="text-flow-error" role="status">{promptIssue}</span>}
            {voiceNeedsSurface && !voiceFailure && !environment.pending && <span className="line-clamp-2 text-flow-error">{voiceMessage}</span>}
            {environment.feedback.transcript && <span className="max-w-full break-words text-[#52606D]" title={environment.feedback.transcript}>“{environment.feedback.transcript}”</span>}
            {(environment.pending?.capture || environment.pending?.media || environment.pending?.clarification) && <button data-action-id="pending.cancel" className="min-h-11 rounded-md font-semibold text-flow-secondary underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-flow-blue" onClick={environment.cancel} type="button">Cancel</button>}
            {pendingChoices?.slice(0, 3).map((choice) => <button data-action-id="pending.clarification-choice" className="min-h-11 rounded-md font-semibold text-[#245D9C] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245D9C] focus-visible:ring-offset-2 focus-visible:ring-offset-flow-elevated" data-flow-action="Choose clarification" key={choice.id} onClick={() => environment.choosePending(choice.id)} type="button">{choice.label}</button>)}
            {environment.pending && !environment.pending.capture && !environment.pending.media && !environment.pending.clarification && environment.pending.friend?.kind !== "recipient" && environment.pending.friend?.kind !== "marker" && environment.pending.friend?.kind !== "marker-action" && !((environment.pending.friend?.kind === "calendar-message" || environment.pending.friend?.kind === "marker-calendar") && environment.pending.friend.proposal.question) && <><button data-action-id={environment.pending.nativeContinuation?.actionId ?? "pending.confirm"} className="min-h-11 rounded-md font-semibold text-[#245D9C] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#245D9C] focus-visible:ring-offset-2 focus-visible:ring-offset-flow-elevated" data-flow-action={environment.pending.nativeContinuation ? "Continue native action" : "Confirm destructive action"} data-native-action-id={environment.pending.nativeContinuation?.actionId} onClick={environment.pending.nativeContinuation ? environment.continueNative : environment.confirm} type="button">{environment.pending.nativeContinuation ? nativeContinuationPresentation(environment.pending.nativeContinuation).label : environment.pending.confirmLabel ?? "Confirm"}</button><button data-action-id="pending.cancel" className="min-h-11 rounded-md font-semibold text-[#52606D] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#52606D] focus-visible:ring-offset-2 focus-visible:ring-offset-flow-elevated" data-flow-action="Cancel destructive action" onClick={environment.cancel} type="button">Cancel</button></>}
          </div>
        )}
      </div> : <div className="flex w-full max-w-full items-center gap-1 rounded-[28px] border border-[#D8CEC2] bg-flow-elevated p-1.5 pl-[58px] shadow-[0_16px_44px_rgba(35,43,55,0.08)]">
        <button data-action-id="command.open-composer" aria-label="Open Flow command" className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-3 text-sm text-[#52606D] hover:bg-flow-neutral-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue" data-flow-action="Open Flow command" onClick={() => requestComposer(true)} type="button"><Icon name="spark" size={18} /><span className="min-w-0 max-w-[440px] break-words text-left">{heardInterim || (environment.lastTranscript && environment.feedback.phase === "completed" ? <><span className="block text-flow-ink">{environment.feedback.title}</span><span className="block text-xs">{environment.feedback.detail}</span><span className="block text-xs">“{environment.lastTranscript}”</span></> : dictating ? "Journal recording · listening" : environment.voiceWorld.entrance === "wake-armed" ? "Keyboard alternative" : selectedActive ? "Listening" : "Ask Flow")}</span></button>
        <button data-action-id={hosted ? "cloud.voice" : "session.control"} aria-label={!hosted && retryable ? "Retry Flow Live" : voiceLabel} className={`grid size-11 shrink-0 place-items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue ${selectedActive ? "bg-flow-blue-soft text-flow-blue-strong" : "text-flow-ink hover:bg-flow-neutral-soft"}`} data-flow-action="Flow Live session" disabled={voiceDisabled} onClick={toggleVoice} type="button"><Icon name={selectedActive ? "pause" : "mic"} size={22} /></button>
      </div>}
      <div className={expanded ? "absolute right-[62px] top-[9px] z-10" : "absolute left-1.5 top-1.5 z-10"}>
        <RewardPreferencesButton compact onOpenChange={changeSettingsOpen} open={settingsOpen} />
      </div>
      </div>
    </motion.aside>
  );
}
