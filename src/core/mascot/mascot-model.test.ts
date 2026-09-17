import { describe, expect, it } from "vitest";
import { RewardDirector } from "../rewards/reward-director";
import { DEFAULT_REWARD_PREFERENCES, type MascotState } from "../rewards/reward-types";
import { isHighLeverageMascotMoment, mascotPresentation } from "./mascot-model";

describe("sparse mascot presence", () => {
  it.each<MascotState>(["resting", "attentive", "focused", "resolved", "small-win", "uncertain", "understood", "big-win"])("does not summon %s from hydration or stale state", (state) => {
    const director = new RewardDirector(DEFAULT_REWARD_PREFERENCES);
    expect(isHighLeverageMascotMoment({ state, sequence: 0 }, director.getSnapshot(), false)).toBe(false);
    director.dispose();
  });

  it("keeps explicit listening meaningful across navigation but leaves focused work quiet", () => {
    const director = new RewardDirector(DEFAULT_REWARD_PREFERENCES);
    const snapshot = director.getSnapshot();
    expect(isHighLeverageMascotMoment(mascotPresentation(snapshot, "sleeping", "understanding", false), snapshot, false)).toBe(false);
    for (const phase of ["ready", "listening", "completed"] as const) {
      const presentation = mascotPresentation(snapshot, "listening", phase, false);
      expect(presentation.state).toBe("listening");
      expect(isHighLeverageMascotMoment(presentation, snapshot, false)).toBe(true);
      expect(isHighLeverageMascotMoment(presentation, snapshot, true)).toBe(false);
    }
    director.dispose();
  });

  it("shows an earned active milestone, not ordinary navigation, edits or post-ceremony dwell", () => {
    const director = new RewardDirector(DEFAULT_REWARD_PREFERENCES);
    director.emit({ type: "world-opened", id: "nav", at: Date.now(), from: "today", to: "home", source: "typed" });
    let snapshot = director.getSnapshot();
    expect(isHighLeverageMascotMoment(mascotPresentation(snapshot, "sleeping", "completed", false), snapshot, false)).toBe(false);
    director.emit({ type: "transaction-committed", id: "edit", at: Date.now(), source: "type", facts: [{ type: "event-created", eventId: "a" }] });
    snapshot = director.getSnapshot();
    expect(isHighLeverageMascotMoment(mascotPresentation(snapshot, "sleeping", "completed", false), snapshot, false)).toBe(false);
    director.emit({ type: "transaction-committed", id: "earned", at: Date.now(), source: "type", facts: [{ type: "commitment-kept", commitmentId: "a" }] });
    snapshot = director.getSnapshot();
    const presentation = mascotPresentation(snapshot, "sleeping", "completed", false);
    expect(isHighLeverageMascotMoment(presentation, snapshot, false)).toBe(true);
    expect(isHighLeverageMascotMoment(presentation, { ...snapshot, active: false }, false)).toBe(false);
    director.dispose();
  });
});
