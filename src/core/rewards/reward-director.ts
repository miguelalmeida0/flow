import { RewardSoundDirector } from "../sound/sound-director";
import { rewardLevelForEvent } from "./reward-level";
import { prefersReducedRewardMotion } from "./reward-preferences";
import { recipeForReward } from "./reward-recipes";
import { rewardFingerprint, suppressionReason } from "./reward-suppression";
import { rewardEntityIds } from "./derive-reward-facts";
import type { RewardEvent, RewardPlan, RewardPreferences, RewardRuntimeEventLogEntry, RewardRuntimeSnapshot, RewardSuppressionReason } from "./reward-types";

const initialSnapshot: RewardRuntimeSnapshot = {
  sequence: 0,
  active: false,
  suppressionReason: "none",
  activeMotionOwner: "none",
  animationCount: 0,
  transitionClones: 0,
  audioContextState: "not-created",
  mascotState: "resting",
  completedCount: 0,
  cancelledCount: 0,
};

function freezeEvent(event: RewardEvent): RewardEvent {
  if (event.type === "transaction-committed") {
    event.facts.forEach((fact) => Object.freeze(fact));
    Object.freeze(event.facts);
  }
  return Object.freeze(event);
}

function mascotDwellMs(plan: RewardPlan) {
  if (plan.recipe.mascot === "understood") return 8_000;
  if (plan.recipe.mascot === "small-win") return 15_000;
  if (plan.recipe.mascot === "big-win") return 60_000;
  return plan.recipe.durationMs;
}

export class RewardDirector {
  private processedIds: string[] = [];
  private ceremonyFingerprintAt = new Map<string, number>();
  private subscribers = new Set<(snapshot: RewardRuntimeSnapshot) => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private mascotTimer?: ReturnType<typeof setTimeout>;
  private lastFingerprint?: string;
  private lastAt?: number;
  private lastAudioAt = -Infinity;
  private snapshot: RewardRuntimeSnapshot = initialSnapshot;
  private sound = new RewardSoundDirector();

  constructor(private preferences: RewardPreferences, private readonly clock: () => number = () => Date.now()) {
    this.publishGlobal();
  }

  subscribe(listener: (snapshot: RewardRuntimeSnapshot) => void) {
    this.subscribers.add(listener);
    listener(this.snapshot);
    return () => { this.subscribers.delete(listener); };
  }

  getSnapshot() { return this.snapshot; }

  async updatePreferences(preferences: RewardPreferences, fromGesture = false) {
    this.preferences = preferences;
    if (preferences.sound && fromGesture) await this.sound.enableFromGesture();
    if (!preferences.sound) this.sound.disable();
    this.setSnapshot({ ...this.snapshot, audioContextState: this.sound.state });
  }

  emit(rawEvent: RewardEvent): RewardPlan | undefined {
    const event = freezeEvent(rawEvent);
    const now = this.clock();
    const level = rewardLevelForEvent(event);
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    const reason = suppressionReason(event, {
      hidden,
      level,
      processedIds: new Set(this.processedIds),
      now,
      lastFingerprint: this.lastFingerprint,
      lastAt: this.lastAt,
      activeCeremony: Boolean(this.snapshot.active && this.snapshot.plan?.level === 3),
      ceremonyFingerprintAt: this.ceremonyFingerprintAt,
    });
    this.remember(event.id);
    if (reason !== "none") {
      this.setSnapshot({ ...this.snapshot, sequence: this.snapshot.sequence + 1, event, suppressionReason: reason });
      this.recordEvent(event, level, reason);
      return undefined;
    }
    this.cancel("interrupted", false);
    const reducedMotion = prefersReducedRewardMotion(this.preferences);
    const recipe = recipeForReward(event, level, this.preferences, reducedMotion);
    const facts = event.type === "transaction-committed" ? event.facts : [];
    const plan: RewardPlan = {
      event,
      level,
      recipe,
      facts,
      entityIds: rewardEntityIds(facts),
      reducedMotion,
    };
    const fingerprint = rewardFingerprint(event);
    this.lastFingerprint = fingerprint;
    this.lastAt = now;
    if (level === 3) this.ceremonyFingerprintAt.set(fingerprint, now);
    const shouldPlay = Boolean(recipe.sound && now - this.lastAudioAt >= 300 && !reducedMotion && !hidden);
    if (shouldPlay && recipe.sound) {
      this.lastAudioAt = now;
      void this.sound.play(recipe.sound).then(() => this.setSnapshot({ ...this.snapshot, audioContextState: this.sound.state }));
    }
    this.setSnapshot({
      ...this.snapshot,
      sequence: this.snapshot.sequence + 1,
      active: level > 0,
      event,
      plan,
      suppressionReason: "none",
      activeMotionOwner: level > 0 ? "motion" : "none",
      animationCount: level > 0 ? 1 : 0,
      transitionClones: 0,
      audioContextState: this.sound.state,
      soundCue: shouldPlay ? recipe.sound : undefined,
      mascotState: recipe.mascot,
    });
    this.recordEvent(event, level, "none");
    if (recipe.durationMs > 0) this.timer = setTimeout(() => this.complete(plan), recipe.durationMs);
    return plan;
  }

  cancel(reason: Extract<RewardSuppressionReason, "interrupted" | "cancelled"> = "cancelled", publish = true) {
    if (this.timer) clearTimeout(this.timer);
    if (this.mascotTimer) clearTimeout(this.mascotTimer);
    this.timer = undefined;
    this.mascotTimer = undefined;
    this.sound.cancel();
    if (!this.snapshot.active && !this.snapshot.soundCue && this.snapshot.mascotState === "resting") return;
    const next = {
      ...this.snapshot,
      active: false,
      suppressionReason: reason,
      activeMotionOwner: "none" as const,
      animationCount: 0,
      transitionClones: 0,
      soundCue: undefined,
      mascotState: "resting" as const,
      cancelledCount: this.snapshot.cancelledCount + 1,
    };
    if (publish) this.setSnapshot(next); else this.snapshot = next;
  }

  dispose() {
    this.cancel("cancelled");
    void this.sound.dispose();
    this.subscribers.clear();
  }

  private complete(plan: RewardPlan) {
    this.timer = undefined;
    const dwellMs = mascotDwellMs(plan);
    const keepMascot = plan.recipe.mascot !== "resting" && dwellMs > plan.recipe.durationMs;
    this.setSnapshot({
      ...this.snapshot,
      active: false,
      activeMotionOwner: "none",
      animationCount: 0,
      transitionClones: 0,
      soundCue: undefined,
      mascotState: keepMascot ? plan.recipe.mascot : "resting",
      completedCount: this.snapshot.completedCount + 1,
    });
    if (keepMascot) {
      this.mascotTimer = setTimeout(() => {
        this.mascotTimer = undefined;
        this.setSnapshot({ ...this.snapshot, mascotState: "resting" });
      }, dwellMs - plan.recipe.durationMs);
    }
  }

  private remember(id: string) {
    this.processedIds.push(id);
    if (this.processedIds.length > 256) this.processedIds.splice(0, this.processedIds.length - 256);
  }

  private setSnapshot(snapshot: RewardRuntimeSnapshot) {
    this.snapshot = snapshot;
    this.publishGlobal();
    this.subscribers.forEach((listener) => listener(snapshot));
  }

  private publishGlobal() {
    if (typeof window !== "undefined") (window as typeof window & { __FLOW_REWARD__?: RewardRuntimeSnapshot }).__FLOW_REWARD__ = this.snapshot;
  }

  private recordEvent(event: RewardEvent, level: RewardPlan["level"], suppressionReason: RewardSuppressionReason) {
    if (typeof window === "undefined") return;
    const runtime = window as typeof window & { __FLOW_REWARD_EVENT_LOG__?: RewardRuntimeEventLogEntry[] };
    runtime.__FLOW_REWARD_EVENT_LOG__ = [...(runtime.__FLOW_REWARD_EVENT_LOG__ ?? []).slice(-31), {
      id: event.id,
      type: event.type,
      level,
      suppressionReason,
    }];
  }
}
