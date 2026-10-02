import { act, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import type { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";

/** Mount starts local recognition asynchronously, after ownership acquisition.
 * A visible Stop control or an earlier start count alone is not readiness. */
export async function awaitFlowListening(adapter?: Pick<FakeRecognitionAdapter, "startCount">) {
  await waitFor(() => {
    if (adapter) expect(adapter.startCount).toBeGreaterThan(0);
    expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  });
}

/** Domain journeys starting on Home must perform the real wake interaction.
 * Keep acquisition/Stop/retry tests on awaitFlowListening when wake is irrelevant. */
export async function activateFlowVoice(adapter: FakeRecognitionAdapter) {
  await awaitFlowListening(adapter);
  if (document.querySelector('[data-home-entrance="wake-armed"]')) {
    const before = localStorage.getItem(LIFE_STORAGE_KEY);
    const cycle = adapter.startCount;
    act(() => adapter.emitFinal("Flow", `fixture-wake-${cycle}`));
    await waitFor(() => expect(adapter.startCount).toBe(cycle + 1));
    // The next utterance may interrupt the acknowledged wake animation, as
    // real speech does; do not bypass the wake gate by changing app state.
    expect(document.querySelector('[data-home-entrance="wake-armed"]')).toBeNull();
    await awaitFlowListening(adapter);
    expect(localStorage.getItem(LIFE_STORAGE_KEY)).toBe(before);
  }
}
