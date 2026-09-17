import { useCallback, useEffect, useRef, useState } from "react";
import type { PlannerPhase } from "../day-planner/model";
import type { FlowLiveStatus } from "../voice/useFlowLiveSession";
import type { VoiceCommandProjection, VoiceWorldSnapshot } from "./voiceWorld";
import { voiceTargetStageMilliseconds } from "../../shared/motion/voiceTargetStages";
import { advanceVoiceTargetMotion, isVisibleVoicePulseStart, VOICE_TARGET_MOTION_EVENT, type VoiceTargetMotionDetail, type VoiceTargetMotionStage } from "../../shared/motion/voiceMotionHandshake";
import { cancelWakeAcknowledgement, requestWakeAcknowledgement } from "./wakeAcknowledgementEvent";

declare global {
  interface Window {
    __FLOW_LOCKED_HOME__?: {
      phase: VoiceWorldSnapshot["phase"];
      entrance: VoiceWorldSnapshot["entrance"];
      wakeAcknowledgementMs?: number;
      wakePaintSource?: "element-timing" | "frame-fence";
      wakeElementEntries?: string[];
      wakeElementPaintedAt?: number;
      wakeElementPaintMs?: number;
      wakeTranscriptAt?: number;
      wakeFirstFrameAt?: number;
      wakePaintedAt?: number;
      wakeToHomeMs?: number;
      preparingStartedAt?: number;
      activeStartedAt?: number;
      wakeRewardMs?: number;
      wakeRewardPublishedAt?: number;
      preparingMs?: number;
      targetAcknowledgementMs?: number;
      targetAcknowledgedAt?: number;
      targetFirstFrameAt?: number;
      targetPaintedAt?: number;
      targetResponsePaintMs?: number;
      targetPaintSource?: "element-timing" | "frame-fence";
      targetPresentedMs?: number;
      executionStartedAt?: number;
      mutationCommittedAt?: number;
      navigationAppliedAt?: number;
      targetPaintBeforeExecute?: boolean;
      targetElementPainted?: boolean;
      targetPulsePainted?: boolean;
      mascotAttentionPainted?: boolean;
      continuitySourcePainted?: boolean;
      targetEyeMotionAt?: number;
      targetBodyMotionAt?: number;
      targetWorldMotionAt?: number;
      targetPulseMotionAt?: number;
      targetMotionReadyAt?: number;
      targetHandshakeStalled?: boolean;
      targetMotionDegraded?: boolean;
      targetStageScheduleMs?: typeof voiceTargetStageMilliseconds;
      preparingPresentedAt?: number;
      preparingPaintedAt?: number;
      preparingPainted?: boolean;
    };
  }
}

const initialSnapshot = (active: boolean): VoiceWorldSnapshot => ({
  entrance: active ? "active" : "wake-armed",
  phase: active ? "idle-session" : "waiting-for-wake",
  sequence: 0,
  confidenceTier: "high",
});

function visiblePulseStartAt(actionId: string) {
  const pulse = document.querySelector<SVGElement>(`[data-voice-target-pulse][data-voice-action-id='${actionId}']`);
  const traveler = pulse?.querySelector<SVGCircleElement>("[data-voice-pulse-traveler]");
  if (!pulse || !traveler) return undefined;
  const originX = Number(pulse.dataset.voiceOriginX);
  const originY = Number(pulse.dataset.voiceOriginY);
  const targetX = Number(pulse.dataset.voiceTargetX);
  const targetY = Number(pulse.dataset.voiceTargetY);
  const bounds = traveler.getBoundingClientRect();
  const distance = Math.hypot(targetX - originX, targetY - originY);
  const progress = distance > 0
    ? Math.hypot(bounds.left + bounds.width / 2 - originX, bounds.top + bounds.height / 2 - originY) / distance
    : 0;
  return isVisibleVoicePulseStart(progress, Number(getComputedStyle(traveler).opacity)) ? performance.now() : undefined;
}

export function useVoiceWorld(initiallyActive: boolean, reducedMotion: boolean) {
  const [snapshot, setSnapshot] = useState(() => initialSnapshot(initiallyActive));
  const snapshotRef = useRef(snapshot);
  const timers = useRef<number[]>([]);
  const pendingTargetPresentation = useRef<{ actionId: string; finish: (interrupted?: boolean) => void } | undefined>(undefined);
  const wakeStartedAt = useRef<number | undefined>(undefined);
  const cancelWake = useRef<(() => void) | undefined>(undefined);
  snapshotRef.current = snapshot;

  const publish = useCallback((next: VoiceWorldSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    window.__FLOW_LOCKED_HOME__ = {
      ...window.__FLOW_LOCKED_HOME__,
      phase: next.phase,
      entrance: next.entrance,
    };
  }, []);

  const clearTimers = useCallback(() => {
    cancelWake.current?.();
    cancelWake.current = undefined;
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const interruptTargetPresentation = useCallback(() => {
    pendingTargetPresentation.current?.finish(true);
  }, []);

  useEffect(() => () => {
    clearTimers();
    interruptTargetPresentation();
  }, [clearTimers, interruptTargetPresentation]);

  const activate = useCallback((phase: VoiceWorldSnapshot["phase"] = "listening", transcript?: string) => {
    if (pendingTargetPresentation.current) return;
    clearTimers();
    const now = performance.now();
    const next: VoiceWorldSnapshot = {
      ...snapshotRef.current,
      entrance: "active",
      phase,
      sequence: snapshotRef.current.sequence + 1,
      ...(transcript ? { transcript } : {}),
      acknowledgedAt: now,
    };
    if (wakeStartedAt.current !== undefined) {
      const preparingStartedAt = window.__FLOW_LOCKED_HOME__?.preparingStartedAt;
      window.__FLOW_LOCKED_HOME__ = {
        ...window.__FLOW_LOCKED_HOME__,
        phase,
        entrance: "active",
        activeStartedAt: now,
        wakeToHomeMs: now - wakeStartedAt.current,
        wakeRewardMs: preparingStartedAt === undefined ? undefined : preparingStartedAt - wakeStartedAt.current,
        preparingMs: preparingStartedAt === undefined ? undefined : now - preparingStartedAt,
      };
      wakeStartedAt.current = undefined;
    }
    publish(next);
  }, [clearTimers, publish]);

  const wake = useCallback((transcript: string) => {
    if (snapshotRef.current.entrance === "active") return activate("listening", transcript);
    clearTimers();
    const at = performance.now();
    wakeStartedAt.current = at;
    window.__FLOW_LOCKED_HOME__ = {
      phase: "wake-detected",
      entrance: "wake-reward",
      wakeTranscriptAt: at,
      wakeFirstFrameAt: undefined,
      wakePaintedAt: undefined,
      wakeAcknowledgementMs: undefined,
      wakeElementEntries: undefined,
      wakeElementPaintedAt: undefined,
      wakeElementPaintMs: undefined,
      preparingStartedAt: undefined,
      activeStartedAt: undefined,
      wakeRewardMs: undefined,
      preparingMs: undefined,
    };
    let wakeAcknowledgementRecorded = false;
    let wakeRewardPublished = false;
    let elementObserver: PerformanceObserver | undefined;
    const wakeElementId = `flow-wake-shell-${snapshotRef.current.sequence + 1}`;
    let cancelled = false;
    const wakeFrames = new Set<number>();
    const frame = (callback: () => void) => {
      const id = window.requestAnimationFrame(() => {
        wakeFrames.delete(id);
        if (!cancelled) callback();
      });
      wakeFrames.add(id);
    };
    const later = (callback: () => void, delay: number) => {
      timers.current.push(window.setTimeout(() => { if (!cancelled) callback(); }, delay));
    };
    cancelWake.current = () => {
      cancelled = true;
      wakeFrames.forEach((id) => window.cancelAnimationFrame(id));
      wakeFrames.clear();
      elementObserver?.disconnect();
      cancelWakeAcknowledgement(wakeElementId);
    };
    const publishWakeReward = (paintedAt: number) => {
      if (wakeRewardPublished || cancelled) return;
      wakeRewardPublished = true;
      window.__FLOW_LOCKED_HOME__ = { ...window.__FLOW_LOCKED_HOME__!, wakeRewardPublishedAt: performance.now() };
      publish({
        ...snapshotRef.current,
        entrance: "wake-reward",
        phase: "wake-detected",
        transcript,
        sequence: snapshotRef.current.sequence + 1,
        acknowledgedAt: at,
        confidenceTier: "high",
      });
      const reportRichWake = () => {
        if (snapshotRef.current.entrance !== "wake-reward" || performance.now() - at > 1_500) return;
        const home = document.querySelector<HTMLElement>("[data-home-entrance='wake-reward']");
        const heading = [...document.querySelectorAll("h1")].find((node) => node.textContent?.trim() === "Hi there!");
        const mascot = document.querySelector<HTMLElement>("[data-wake-ceremony='active']");
        const expectedLeaves = reducedMotion ? 0 : 3;
        if (!home || !heading || !mascot || document.querySelectorAll("[data-authored-wake-leaf]").length !== expectedLeaves) {
          frame(reportRichWake);
          return;
        }
        window.dispatchEvent(new CustomEvent("flow:wake-painted", { detail: { transcript, paintedAt } }));
      };
      frame(reportRichWake);
      // The reward owns its duration from publication. A delayed observer
      // cannot skip straight to preparation or resurrect a superseded wake.
      later(() => {
        const presentedAt = performance.now();
        publish({ ...snapshotRef.current, entrance: "preparing", phase: "preparing", sequence: snapshotRef.current.sequence + 1 });
        window.__FLOW_LOCKED_HOME__ = {
          ...window.__FLOW_LOCKED_HOME__!, preparingStartedAt: presentedAt, preparingPresentedAt: presentedAt,
        };
        frame(() => frame(() => {
          if (snapshotRef.current.entrance !== "preparing") return;
          const heading = [...document.querySelectorAll("h1")].find((node) => node.textContent?.trim() === "All set.");
          window.__FLOW_LOCKED_HOME__ = { ...window.__FLOW_LOCKED_HOME__!, preparingPaintedAt: performance.now(), preparingPainted: Boolean(heading) };
        }));
        later(() => activate("listening", transcript), reducedMotion ? 160 : 1_100);
      }, reducedMotion ? 140 : 1_300);
    };
    const recordWakeAcknowledgement = (paintedAt: number, source: "element-timing" | "frame-fence") => {
      if (wakeAcknowledgementRecorded || cancelled) return;
      const acknowledgement = document.querySelector<HTMLElement>(`[data-wake-acknowledgement-id='${wakeElementId}']`);
      if (!acknowledgement || acknowledgement.getBoundingClientRect().width <= 0) return;
      wakeAcknowledgementRecorded = true;
      window.__FLOW_LOCKED_HOME__ = {
        ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
        wakePaintedAt: paintedAt,
        wakeAcknowledgementMs: paintedAt - at,
        wakePaintSource: source,
      };
      publishWakeReward(paintedAt);
    };
    const observesElementPaint = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("element");
    if (observesElementPaint) {
      elementObserver = new PerformanceObserver((list) => {
        if (cancelled) return;
        const entries = list.getEntries();
        const entry = entries.find((candidate) => (candidate as PerformanceEntry & { identifier?: string }).identifier === wakeElementId);
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          wakeElementEntries: entries.map((candidate) => (candidate as PerformanceEntry & { identifier?: string }).identifier ?? "unidentified"),
          wakeElementPaintedAt: entry?.startTime,
          wakeElementPaintMs: entry ? entry.startTime - at : undefined,
        };
        if (entry) {
          recordWakeAcknowledgement(entry.startTime, "element-timing");
          elementObserver?.disconnect();
        }
      });
      elementObserver.observe({ type: "element", buffered: true });
    }
    requestWakeAcknowledgement(wakeElementId);
    if (document.documentElement.clientWidth <= 0 || document.documentElement.clientHeight <= 0) publishWakeReward(at);
    frame(() => {
      const firstFrameAt = performance.now();
      window.__FLOW_LOCKED_HOME__ = {
        ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
        wakeFirstFrameAt: firstFrameAt,
      };
      // Chromium's Element Timing entry is the real rendered timestamp. The
      // frame fence is only a capability fallback; racing the two used to
      // replace real paint data with unrelated task-queue delay.
      if (!observesElementPaint) later(() => recordWakeAcknowledgement(performance.now(), "frame-fence"), 0);
    });
    later(() => {
      elementObserver?.disconnect();
      if (!wakeAcknowledgementRecorded) recordWakeAcknowledgement(performance.now(), "frame-fence");
    }, 1_000);
  }, [activate, clearTimers, publish, reducedMotion]);

  const waitForWake = useCallback((transcript: string) => {
    if (snapshotRef.current.entrance !== "wake-armed") return;
    publish({ ...snapshotRef.current, transcript, phase: "waiting-for-wake", sequence: snapshotRef.current.sequence + 1 });
  }, [publish]);

  const target = useCallback((projection: VoiceCommandProjection) => {
    clearTimers();
    const startedAt = performance.now();
    const phase = projection.confidenceTier === "clarify" ? "clarifying" : projection.confidenceTier === "unsupported" ? "error" : "targeting";
    publish({
      ...snapshotRef.current,
      ...projection,
      entrance: "active",
      phase,
      sequence: snapshotRef.current.sequence + 1,
      acknowledgedAt: startedAt,
      targetMotionStage: phase === "targeting" ? reducedMotion ? "pulse" : "eyes" : undefined,
    });
    window.__FLOW_LOCKED_HOME__ = {
      ...window.__FLOW_LOCKED_HOME__,
      phase,
      entrance: "active",
      targetAcknowledgementMs: undefined,
      targetAcknowledgedAt: startedAt,
      targetFirstFrameAt: undefined,
      targetPaintedAt: undefined,
      targetResponsePaintMs: undefined,
      targetPaintSource: undefined,
      targetPresentedMs: undefined,
      executionStartedAt: undefined,
      mutationCommittedAt: undefined,
      navigationAppliedAt: undefined,
      targetPaintBeforeExecute: undefined,
      targetElementPainted: undefined,
      targetPulsePainted: undefined,
      mascotAttentionPainted: undefined,
      continuitySourcePainted: undefined,
      targetEyeMotionAt: undefined,
      targetBodyMotionAt: undefined,
      targetWorldMotionAt: undefined,
      targetPulseMotionAt: undefined,
      targetMotionReadyAt: undefined,
      targetHandshakeStalled: undefined,
      targetMotionDegraded: undefined,
      targetStageScheduleMs: voiceTargetStageMilliseconds,
    };
  }, [clearTimers, publish, reducedMotion]);

  const waitForTargetPaint = useCallback((actionId: string): Promise<void> | undefined => {
    // DOM emulators have no paintable viewport. Keep controller/invariant tests
    // synchronous there; the browser gate owns the real frame-order contract.
    if (document.documentElement.clientWidth <= 0 || document.documentElement.clientHeight <= 0) {
      if (snapshotRef.current.actionId === actionId && snapshotRef.current.phase === "targeting") {
        publish({ ...snapshotRef.current, phase: "executing", sequence: snapshotRef.current.sequence + 1 });
      }
      return undefined;
    }
    return new Promise<void>((resolve) => {
      interruptTargetPresentation();
      const startedAt = window.__FLOW_LOCKED_HOME__?.targetAcknowledgedAt ?? performance.now();
      const minimumMs = reducedMotion ? 160 : 260;
      const homeChoreography = Boolean(document.querySelector("[data-home-entrance='active']"));
      let firstFrame = 0;
      let paintFallbackFrame = 0;
      let presentationFrame = 0;
      let pulseObservationFrame = 0;
      let settleTimer = 0;
      let diagnosticTimer = 0;
      let responseFallbackTimer = 0;
      let elementObserver: PerformanceObserver | undefined;
      let complete = false;
      let responsePainted = false;
      let presentationPainted = false;
      let motionReady = reducedMotion;
      let expectedStage: VoiceTargetMotionStage = homeChoreography ? "eyes" : "world";
      let observeMotion: (event: Event) => void = () => undefined;

      const finish = (interrupted = false) => {
        if (complete) return;
        complete = true;
        if (firstFrame) window.cancelAnimationFrame(firstFrame);
        if (paintFallbackFrame) window.cancelAnimationFrame(paintFallbackFrame);
        if (presentationFrame) window.cancelAnimationFrame(presentationFrame);
        if (pulseObservationFrame) window.cancelAnimationFrame(pulseObservationFrame);
        if (settleTimer) window.clearTimeout(settleTimer);
        if (diagnosticTimer) window.clearTimeout(diagnosticTimer);
        if (responseFallbackTimer) window.clearTimeout(responseFallbackTimer);
        elementObserver?.disconnect();
        window.removeEventListener(VOICE_TARGET_MOTION_EVENT, observeMotion);
        if (pendingTargetPresentation.current?.actionId === actionId) pendingTargetPresentation.current = undefined;
        if (!interrupted && snapshotRef.current.actionId === actionId && snapshotRef.current.phase === "targeting") {
          publish({ ...snapshotRef.current, phase: "executing", sequence: snapshotRef.current.sequence + 1 });
        }
        resolve();
      };
      const maybeFinish = () => {
        if (!responsePainted || !presentationPainted || !motionReady || complete || settleTimer) return;
        settleTimer = window.setTimeout(() => finish(), Math.max(0, minimumMs - (performance.now() - startedAt)));
      };
      const recordResponsePaint = (paintedAt: number, source: "element-timing" | "frame-fence") => {
        if (responsePainted || complete) return;
        responsePainted = true;
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          targetPaintedAt: paintedAt,
          targetResponsePaintMs: paintedAt - startedAt,
          targetAcknowledgementMs: paintedAt - startedAt,
          targetPaintSource: source,
        };
        maybeFinish();
      };
      const recordPresentationFrame = () => {
        if (presentationPainted || complete) return;
        const { domain, targetId } = snapshotRef.current;
        const heading = document.querySelector<HTMLElement>("[data-voice-target-acknowledgement]");
        const entity = targetId
          ? [...document.querySelectorAll<HTMLElement>("[data-life-entity-id]")].find((node) => node.dataset.lifeEntityId === targetId)
          : undefined;
        const domainElement = [...document.querySelectorAll<HTMLElement>("[data-home-domain], [data-world-continuity-surface]")]
          .find((node) => node.dataset.homeDomain === domain || node.dataset.worldContinuitySurface === domain);
        const targetElement = entity ?? domainElement ?? heading;
        const targetPulse = document.querySelector<HTMLElement>("[data-voice-target-pulse]");
        const mascot = document.querySelector<HTMLElement>("[data-mascot-attention-domain]");
        const continuitySource = targetId
          ? [...document.querySelectorAll<HTMLElement>("[data-calendar-event-continuity]")].find((node) => node.dataset.calendarEventContinuity === targetId)
          : undefined;
        const targetElementPainted = Boolean(targetElement && targetElement.getBoundingClientRect().width > 0);
        const targetPulsePainted = Boolean(targetPulse && targetPulse.getBoundingClientRect().width > 0);
        const mascotAttentionPainted = !homeChoreography || Boolean(mascot && mascot.dataset.mascotAttentionDomain === domain);
        if (!targetElementPainted || !targetPulsePainted || !mascotAttentionPainted) {
          presentationFrame = window.requestAnimationFrame(recordPresentationFrame);
          return;
        }
        presentationPainted = true;
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          targetElementPainted,
          targetPulsePainted,
          mascotAttentionPainted,
          continuitySourcePainted: Boolean(continuitySource),
        };
        window.dispatchEvent(new CustomEvent("flow:voice-target-painted", { detail: { actionId, domain, targetId } }));
        maybeFinish();
      };
      const acceptMotion = (detail: VoiceTargetMotionDetail) => {
        if (detail.actionId !== actionId || complete || reducedMotion) return;
        const advancement = advanceVoiceTargetMotion(expectedStage, detail.stage);
        if (!advancement.accepted) return;
        const diagnosticKey = ({ eyes: "targetEyeMotionAt", body: "targetBodyMotionAt", world: "targetWorldMotionAt", pulse: "targetPulseMotionAt" } as const)[detail.stage];
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          [diagnosticKey]: detail.observedAt,
        };
        const nextStage = advancement.next;
        if (nextStage) {
          expectedStage = nextStage;
          publish({ ...snapshotRef.current, targetMotionStage: nextStage });
          if (detail.stage === "world" && nextStage === "pulse") {
            // Motion may issue its final update before writing the DOM. There
            // need not be another onUpdate after that write, so observe the
            // actual next painted frame instead of waiting for a callback that
            // will never arrive. This cannot acknowledge a replaced action.
            const observePaintedPulse = () => {
              if (complete || snapshotRef.current.actionId !== actionId || expectedStage !== "pulse") return;
              const observedAt = visiblePulseStartAt(actionId);
              if (observedAt !== undefined) acceptMotion({ actionId, stage: "pulse", observedAt });
              else pulseObservationFrame = window.requestAnimationFrame(observePaintedPulse);
            };
            pulseObservationFrame = window.requestAnimationFrame(observePaintedPulse);
          }
          return;
        }
        motionReady = true;
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          targetMotionReadyAt: detail.observedAt,
        };
        // Motion reports during its render step. The following frame proves
        // that the non-zero pulse survived into a visible presentation.
        presentationFrame = window.requestAnimationFrame(recordPresentationFrame);
        maybeFinish();
      };
      observeMotion = (event: Event) => acceptMotion((event as CustomEvent<VoiceTargetMotionDetail>).detail);

      pendingTargetPresentation.current = { actionId, finish };
      window.addEventListener(VOICE_TARGET_MOTION_EVENT, observeMotion);
      if (!homeChoreography && !reducedMotion) publish({ ...snapshotRef.current, targetMotionStage: "world" });
      const observesElementPaint = typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("element");
      if (observesElementPaint) {
        const identifier = `flow-target-heading-${actionId}`;
        elementObserver = new PerformanceObserver((list) => {
          const entry = list.getEntries().find((candidate) => (candidate as PerformanceEntry & { identifier?: string }).identifier === identifier);
          if (entry) recordResponsePaint(entry.startTime, "element-timing");
        });
        elementObserver.observe({ type: "element", buffered: true });
      }
      firstFrame = window.requestAnimationFrame(() => {
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          targetFirstFrameAt: performance.now(),
        };
        if (!observesElementPaint) paintFallbackFrame = window.requestAnimationFrame(() => recordResponsePaint(performance.now(), "frame-fence"));
        presentationFrame = window.requestAnimationFrame(recordPresentationFrame);
      });
      // Some engines advertise Element Timing but never emit changed text.
      // An observed visible frame is a bounded fallback, never a fabricated
      // Element Timing timestamp; all authored motion conditions still apply.
      responseFallbackTimer = window.setTimeout(() => {
        if (responsePainted || complete) return;
        const heading = document.querySelector<HTMLElement>(`[data-voice-target-acknowledgement][data-voice-action-id='${actionId}']`);
        if (heading && heading.getBoundingClientRect().width > 0 && getComputedStyle(heading).visibility !== "hidden") {
          paintFallbackFrame = window.requestAnimationFrame(() => recordResponsePaint(performance.now(), "frame-fence"));
        }
      }, 200);
      // Presentation is a bounded observation, never a prerequisite for
      // persisting an already validated command. A removed/hidden heading
      // cannot hold the shared document lock or the next voice command.
      // Preserve absent paint fields: releasing this wait is not paint proof.
      diagnosticTimer = window.setTimeout(() => {
        if (complete) return;
        window.__FLOW_LOCKED_HOME__ = {
          ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
          targetHandshakeStalled: true,
          targetMotionDegraded: true,
        };
        finish();
      }, 2_000);
    });
  }, [interruptTargetPresentation, publish, reducedMotion]);

  const markExecutionStarted = useCallback(() => {
    const at = performance.now();
    const paintedAt = window.__FLOW_LOCKED_HOME__?.targetPaintedAt;
    const acknowledgedAt = window.__FLOW_LOCKED_HOME__?.targetAcknowledgedAt;
    window.__FLOW_LOCKED_HOME__ = {
      ...(window.__FLOW_LOCKED_HOME__ ?? { phase: snapshotRef.current.phase, entrance: snapshotRef.current.entrance }),
      executionStartedAt: at,
      targetPresentedMs: acknowledgedAt === undefined ? undefined : at - acknowledgedAt,
      targetPaintBeforeExecute: paintedAt !== undefined && paintedAt <= at,
    };
  }, []);

  const preview = useCallback((projection: VoiceCommandProjection) => {
    if (pendingTargetPresentation.current || snapshotRef.current.entrance !== "active" || projection.confidenceTier === "unsupported") return;
    clearTimers();
    publish({
      ...snapshotRef.current,
      ...projection,
      entrance: "active",
      phase: "targeting",
      actionId: undefined,
      targetMotionStage: undefined,
      sequence: snapshotRef.current.sequence + 1,
      acknowledgedAt: performance.now(),
    });
  }, [clearTimers, publish]);

  const reconcile = useCallback((feedback: PlannerPhase, live: FlowLiveStatus) => {
    if (snapshotRef.current.entrance !== "active") return;
    if (feedback === "clarification" || feedback === "confirmation") {
      clearTimers();
      return publish({ ...snapshotRef.current, phase: "clarifying", sequence: snapshotRef.current.sequence + 1 });
    }
    if (feedback === "error" || feedback === "conflict") {
      clearTimers();
      return publish({ ...snapshotRef.current, phase: "error", sequence: snapshotRef.current.sequence + 1 });
    }
    if (feedback === "completed") {
      if (snapshotRef.current.phase === "success") return;
      clearTimers();
      publish({ ...snapshotRef.current, phase: "success", sequence: snapshotRef.current.sequence + 1 });
      timers.current.push(window.setTimeout(() => publish({ ...snapshotRef.current, phase: live === "listening" || live === "live-idle" ? "listening" : "idle-session", domain: undefined, targetId: undefined, sequence: snapshotRef.current.sequence + 1 }), reducedMotion ? 120 : 720));
      return;
    }
    if (feedback === "ready" || feedback === "listening") {
      // Final-command targeting/execution owns this short presentation window.
      // Interim clearing calls `activate` directly before a final target is
      // published, so a stale feedback effect must never erase the new target.
      if (snapshotRef.current.phase === "targeting" || snapshotRef.current.phase === "executing") return;
      const phase = live === "listening" || live === "live-idle" || live === "interpreting" ? "listening" : "idle-session";
      if (snapshotRef.current.phase !== phase) publish({ ...snapshotRef.current, phase, sequence: snapshotRef.current.sequence + 1 });
    }
  }, [clearTimers, publish, reducedMotion]);

  const disableWakeGate = useCallback(() => {
    if (snapshotRef.current.entrance === "wake-armed") activate("idle-session");
  }, [activate]);

  return { snapshot, wake, waitForWake, target, preview, reconcile, activate, disableWakeGate, waitForTargetPaint, interruptTargetPresentation, markExecutionStarted };
}
