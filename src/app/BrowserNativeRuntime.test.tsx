import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { deriveVoiceInputOwner } from "../kernel/voice/voiceOwnership";

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, "", "/");
  window.__FLOW_RUNTIME__ = { mode: "browser-native", inferenceEnabled: false, releaseId: "wip" };
});
afterEach(() => { delete window.__FLOW_RUNTIME__; localStorage.clear(); });

it("keeps browser ownership even when a stale companion claims availability", () => {
  expect(deriveVoiceInputOwner(true)).toBe("browser-fallback");
});

it("starts on click, dispatches commands, sleeps, wakes and stops through the existing pipeline", async () => {
  const adapter = new FakeRecognitionAdapter();
  render(<FlowEnvironmentApp recognitionAdapter={adapter} />);
  const status = screen.getByTestId("flow-live-presence");
  expect(status).toHaveAttribute("data-flow-live-status", "sleeping");
  expect(screen.getByRole("button", { name: "Open Calendar" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "listening"));
  act(() => adapter.emitFinal("Open my journal"));
  await waitFor(() => expect(screen.getByTestId("journal-space")).toBeVisible());
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "listening"));
  act(() => adapter.emitFinal("Pause listening"));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "sleeping"));
  fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "listening"));
  act(() => adapter.emitFinal("Flow"));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "listening"));
  fireEvent.click(screen.getByRole("button", { name: "Stop Flow Live" }));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "sleeping"));
});

it.each(["permission-denied", "microphone-unavailable"] as const)("surfaces %s and supports retry", async (error) => {
  const adapter = new FakeRecognitionAdapter();
  render(<FlowEnvironmentApp recognitionAdapter={adapter} />);
  fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" }));
  const status = screen.getByTestId("flow-live-presence");
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "listening"));
  act(() => adapter.emitError(error));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", error));
  expect(screen.getByText(/Chrome (blocked microphone access|cannot access a microphone)/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry Flow Live" }));
  await waitFor(() => expect(status).toHaveAttribute("data-flow-live-status", "listening"));
});

it("explains unavailable browser recognition while keeping typed commands available", async () => {
  render(<FlowEnvironmentApp />);
  expect(screen.getByRole("button", { name: "Start Flow Live" })).toBeDisabled();
  await waitFor(() => expect(screen.getByText(/Voice recognition is unavailable here/)).toBeVisible());
});
