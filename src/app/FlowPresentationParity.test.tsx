import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { acceptanceClock, acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { REWARD_PREFERENCES_KEY } from "../core/rewards/reward-preferences";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/today");
  // jsdom has no Web Animations inventory. This only supplies the inspector's
  // native diagnostic read; it does not simulate motion or its completion.
  Object.defineProperty(document, "getAnimations", { configurable: true, value: vi.fn(() => []) });
});
afterEach(() => { Reflect.deleteProperty(document, "getAnimations"); });
function setup() {
  const before = acceptanceFixture("empty-home").snapshot;
  before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before));
  const preferences = { motion: "system", sound: true, mascot: "helpful" };
  localStorage.setItem(REWARD_PREFERENCES_KEY, JSON.stringify(preferences));
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => acceptanceClock} recognitionAdapter={adapter}/>);
  async function command(text: string, mode: "typed" | "voice") {
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const input = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
    } else {
      if (!adapter.startCount) { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); }
      act(() => adapter.emitFinal(text, `presentation-${text}`));
    }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
  }
  const unchanged = () => { const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!); expect(after.document).toEqual(before.document); expect(after.past).toEqual(before.past); expect(after.future).toEqual(before.future); };
  return { command, unchanged, preferences };
}
it.each(["click", "typed", "voice"] as const)("opens sensory settings through %s", async (mode) => {
  const view = setup();
  if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" })); else await view.command("Open sensory settings", mode);
  await waitFor(() => expect(document.querySelector("[data-reward-settings]")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Reward and motion settings" })).toHaveAttribute("aria-expanded", "true"); view.unchanged();
});
it.each(["click", "typed", "voice"] as const)("uses the existing preference store for reduced motion, minimal mascot and sound-off through %s", async (mode) => {
  const view = setup(); fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
  for (const [utterance, role, label, patch] of [
    ["Use reduced motion", "radio", "Reduced", { motion: "reduced" }],
    ["Use minimal mascot responses", "radio", "Minimal", { mascot: "minimal" }],
    ["Turn reward sound off", "button", "On · consented", { sound: false }],
  ] as const) {
    if (mode === "click") fireEvent.click(screen.getByRole(role, { name: label })); else await view.command(utterance, mode);
    Object.assign(view.preferences, patch);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(REWARD_PREFERENCES_KEY)!)).toEqual(view.preferences)); view.unchanged();
    expect(document.querySelector("[data-reward-settings]")).toBeInTheDocument();
    if (role === "radio") expect(screen.getByRole(role, { name: label })).toHaveAttribute("aria-checked", "true");
  }
});
it.each(["typed", "voice"] as const)("keeps sound disabled until its real pointer continuation after a %s request", async (mode) => {
  const view = setup(); fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
  fireEvent.click(screen.getByRole("button", { name: "On · consented" }));
  await view.command("Enable reward sound", mode);
  await waitFor(() => expect(document.querySelector('[data-sensory-continuation="awaiting-user-gesture"]')).toBeInTheDocument());
  expect(JSON.parse(localStorage.getItem(REWARD_PREFERENCES_KEY)!).sound).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Off" }));
  await waitFor(() => expect(JSON.parse(localStorage.getItem(REWARD_PREFERENCES_KEY)!).sound).toBe(true));
  expect(document.querySelector("[data-sensory-continuation]")).not.toBeInTheDocument(); view.unchanged();
});
it.each(["click", "typed", "voice"] as const)("preserves every other preference while choosing full, system and helpful through %s", async (mode) => {
  const view = setup(); fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
  for (const [utterance, label, patch] of [
    ["Use full motion", "Full", { motion: "full" }],
    ["Follow the system motion preference", "System", { motion: "system" }],
    ["Use minimal mascot responses", "Minimal", { mascot: "minimal" }],
    ["Use helpful mascot responses", "Helpful", { mascot: "helpful" }],
  ] as const) {
    if (mode === "click") fireEvent.click(screen.getByRole("radio", { name: label })); else await view.command(utterance, mode);
    Object.assign(view.preferences, patch);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(REWARD_PREFERENCES_KEY)!)).toEqual(view.preferences));
    expect(screen.getByRole("radio", { name: label })).toHaveAttribute("aria-checked", "true"); view.unchanged();
  }
});
it.each(["typed", "voice"] as const)("opens and closes the existing development inspectors through %s", async (mode) => {
  const view = setup(); await view.command("Open voice inspector", mode);
  expect(document.querySelector("[data-voice-inspector] dl")).toBeInTheDocument();
  await view.command("Close voice inspector", mode); expect(document.querySelector("[data-voice-inspector] dl")).not.toBeInTheDocument();
  await view.command("Open reward inspector", mode); expect(document.querySelector("[data-reward-inspector]")).toBeInTheDocument();
  await view.command("Close reward inspector", mode); expect(document.querySelector("[data-reward-inspector]")).not.toBeInTheDocument(); view.unchanged();
});
it.each(["typed", "voice"] as const)("opens and focuses keyboard input through %s without a synthetic keypress", async (mode) => {
  const view = setup(); await view.command("Open the command field", mode);
  await waitFor(() => expect(screen.getByLabelText("Tell Flow what to change")).toHaveFocus()); view.unchanged();
});
it("hides the idle main command field from a typed request without consuming history", async () => {
  const view = setup(); await view.command("Hide Flow command", "typed");
  await waitFor(() => expect(screen.getByRole("button", { name: "Open Flow command" })).toBeInTheDocument()); view.unchanged();
});
