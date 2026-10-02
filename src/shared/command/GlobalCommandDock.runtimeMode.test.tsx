import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FlowEnvironmentProvider } from "../../app/FlowEnvironmentProvider";
import { FakeRecognitionAdapter } from "../../features/day-planner/voice/fakeRecognition";
import { GlobalCommandDock } from "./GlobalCommandDock";

afterEach(() => { delete window.__FLOW_RUNTIME__; localStorage.clear(); window.history.replaceState({}, "", "/"); });

it("a reclaimed tab yields automatic capture while keeping explicit Start available", async () => {
  window.__FLOW_RUNTIME__ = { mode: "local", inferenceEnabled: false, releaseId: "test" };
  window.history.replaceState({}, "", "/?flow-live-yield=claimant");
  const adapter = new FakeRecognitionAdapter();
  render(<FlowEnvironmentProvider><GlobalCommandDock recognitionAdapter={adapter} /></FlowEnvironmentProvider>);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  expect(adapter.startCount).toBe(0);
  fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 80)); });
  expect(adapter.startCount).toBe(1);
});

it.each(["local", "hosted", "typed-only"] as const)("only autostarts the browser recognizer in local mode: %s", async (mode) => {
  window.__FLOW_RUNTIME__ = { mode, inferenceEnabled: true, releaseId: "test" };
  const adapter = new FakeRecognitionAdapter();
  await act(async () => { render(<FlowEnvironmentProvider><GlobalCommandDock recognitionAdapter={adapter} /></FlowEnvironmentProvider>); });
  // Allow the real ownership coordinator's 45 ms claim window to settle.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
  expect(adapter.startCount).toBe(mode === "local" ? 1 : 0);
});

it.each(["hosted", "typed-only"] as const)("cannot manually start the legacy recognizer in %s mode", async (mode) => {
  window.__FLOW_RUNTIME__ = { mode, inferenceEnabled: true, releaseId: "test" };
  const adapter = new FakeRecognitionAdapter();
  render(<FlowEnvironmentProvider><GlobalCommandDock recognitionAdapter={adapter} /></FlowEnvironmentProvider>);
  const control = screen.getByRole("button", { name: mode === "hosted" ? "Enable cloud features" : "Start Flow Live" });
  fireEvent.click(control);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 80)); });
  expect(adapter.startCount).toBe(0);
  if (mode === "typed-only") expect(control).toBeDisabled();
  else expect(screen.getByLabelText("Invitation code")).toBeVisible();
});
