import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";

const now = () => new Date("2026-09-06T09:00:00");
const voicePermissionMarker = "flow.voice.permission-granted.v1";

function stored() {
  return JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
}

function typeCommand(value: string) {
  if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
  const input = screen.getByLabelText("Tell Flow what to change");
  fireEvent.change(input, { target: { value } });
  fireEvent.submit(input.closest("form")!);
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  delete window.__FLOW_LOCKED_HOME__;
});

describe("locked no-click voice Home", () => {
  it("shows current and upcoming Calendar events instead of expired morning events", () => {
    render(<FlowEnvironmentApp now={() => new Date("2026-09-06T14:22:00")} recognitionAdapter={new FakeRecognitionAdapter()} />);
    const visibleIds = [...document.querySelectorAll<HTMLElement>("[data-home-calendar-preview] [data-life-entity-id]")].map((node) => node.dataset.lifeEntityId);
    expect(visibleIds).toEqual(["roadmap", "workout", "interview", "dinner"]);
  });

  it("initializes an already-active Home and subsequent returns with the light surface immediately", async () => {
    window.history.replaceState({}, "", "/journal");
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    typeCommand("Home");
    const firstHome = await screen.findByTestId("home-space");
    expect(firstHome).toHaveAttribute("data-home-entrance", "active");
    expect(firstHome).toHaveStyle({ backgroundColor: "#F2E8DB" });
    typeCommand("Open my journal");
    await screen.findByTestId("journal-space");
    typeCommand("Home");
    expect(await screen.findByTestId("home-space")).toHaveStyle({ backgroundColor: "#F2E8DB" });
  });

  it("waits for a bounded wake phrase, preserves the exact transcript, and never turns pre-wake speech into data", async () => {
    localStorage.setItem(voicePermissionMarker, "granted");
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
    await waitFor(() => expect(adapter.startCount).toBe(1));
    expect(await screen.findByRole("heading", { name: "Say “Flow” to wake me up." })).toBeInTheDocument();
    const restingFlight = document.querySelector("[data-home-mascot-flight]");
    expect(restingFlight).toHaveAttribute("data-home-mascot-layout-owner", "flow-layout");
    expect(restingFlight).toHaveAttribute("data-home-mascot-placement", "wake-anchor");
    expect(restingFlight).toHaveClass("relative", "w-[clamp(140px,24vh,206px)]");
    expect(restingFlight).not.toHaveClass("absolute", "fixed");
    expect(restingFlight?.parentElement).toHaveAttribute("data-home-composition");
    expect(document.querySelectorAll("[data-home-mascot-layout-owner]")).toHaveLength(1);

    act(() => adapter.emitFinal("Capture buy milk", "pre-wake"));
    await waitFor(() => expect(adapter.startCount).toBe(2));
    expect(screen.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Capture buy milk");
    expect(stored().past).toHaveLength(0);
    expect(stored().document.studio.journalEntries).toHaveLength(0);
  });

  it("moves autonomously from wake acknowledgement through preparation into a rich active Home", async () => {
    localStorage.setItem(voicePermissionMarker, "granted");
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Flow", "wake-only"));
    expect(await screen.findByRole("heading", { name: "Hi there!" })).toBeInTheDocument();
    expect(document.querySelector("[data-mascot-form='sprout']")).toHaveAttribute("data-mascot-face", "happy");
    expect(document.querySelector("[data-mascot-form='sprout']")).toHaveAttribute("data-wake-lift-px", "22");
    expect(document.querySelectorAll("[data-authored-wake-leaf]")).toHaveLength(3);
    expect(document.querySelector("[data-home-mascot-flight]")).toHaveAttribute("data-home-mascot-placement", "wake-anchor");
    expect(window.__FLOW_LOCKED_HOME__?.wakeTranscriptAt).toBeDefined();
    expect(stored().past).toHaveLength(0);

    expect(await screen.findByRole("heading", { name: "All set." }, { timeout: 1_900 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "I’m listening…" }, { timeout: 1_900 })).toBeInTheDocument();
    expect(screen.getByTestId("locked-home-previews")).toBeInTheDocument();
    for (const name of ["Calendar", "Journal", "Friends", "Memories"]) {
      expect(screen.getByRole("button", { name: `Open ${name}` })).toBeVisible();
    }
    expect(window.__FLOW_LOCKED_HOME__?.wakeRewardMs).toBeGreaterThanOrEqual(1_200);
    expect(window.__FLOW_LOCKED_HOME__?.wakeRewardMs).toBeLessThanOrEqual(2_000);
    expect(window.__FLOW_LOCKED_HOME__?.preparingMs).toBeGreaterThanOrEqual(800);
    expect(window.__FLOW_LOCKED_HOME__?.preparingMs).toBeLessThanOrEqual(1_400);
    expect(window.__FLOW_LOCKED_HOME__?.wakeToHomeMs).toBeLessThanOrEqual(3_000);
  });

  it("lets follow-up speech interrupt the wake reward and executes it through the global router", async () => {
    localStorage.setItem(voicePermissionMarker, "granted");
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Flow", "wake-interrupt"));
    expect(await screen.findByRole("heading", { name: "Hi there!" })).toBeInTheDocument();
    await waitFor(() => expect(adapter.startCount).toBe(2));
    act(() => adapter.emitFinal("Open my journal", "interrupt-command"));
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/journal");
  });

  it("supports a prefixed wake-and-command transcript without a second microphone activation", async () => {
    localStorage.setItem(voicePermissionMarker, "granted");
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Flow, open my journal", "wake-command"));
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Flow, open my journal");
    expect(adapter.startCount).toBeGreaterThanOrEqual(1);
  });

  it("projects a stable interim target without executing or entering history", async () => {
    localStorage.setItem(voicePermissionMarker, "granted");
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Flow", "wake-interim"));
    expect(await screen.findByRole("heading", { name: "I’m listening…" }, { timeout: 6_000 })).toBeInTheDocument();
    await waitFor(() => expect(adapter.startCount).toBe(2));
    act(() => adapter.emitInterim("Open my calendar"));
    expect(screen.getByTestId("home-space")).toHaveAttribute("data-voice-phase", "targeting");
    expect(screen.getByRole("button", { name: "Open Calendar" })).toHaveAttribute("data-voice-targeted", "true");
    expect(stored().past).toHaveLength(0);
    expect(window.location.pathname).toBe("/");
  });

  it("applies the locked Journal plus Sunday evening command as one undoable transaction", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    typeCommand("Open my journal and leave Sunday evening playing");
    expect(await screen.findByTestId("journal-space")).toBeInTheDocument();
    await waitFor(() => expect(stored().document.studio.activeAtmosphere).toMatchObject({ playing: true }));
    expect(stored().document.studio.workspace).toMatchObject({ primary: "journal", secondary: "atmosphere" });
    expect(stored().past).toHaveLength(1);

    typeCommand("Undo");
    await waitFor(() => expect(stored().past).toHaveLength(0));
    expect(stored().document.studio.activeAtmosphere).toBeUndefined();
    typeCommand("Redo");
    await waitFor(() => expect(stored().document.studio.activeAtmosphere).toMatchObject({ playing: true }));
    expect(stored().past).toHaveLength(1);
  });

  it("keeps the non-painting DOM controller synchronous while exposing execution diagnostics", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    typeCommand("Open my calendar");
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    expect(window.__FLOW_LOCKED_HOME__?.targetPaintedAt).toBeUndefined();
    expect(window.__FLOW_LOCKED_HOME__?.executionStartedAt).toBeDefined();
    expect(window.__FLOW_LOCKED_HOME__!.executionStartedAt!).toBeLessThanOrEqual(window.__FLOW_LOCKED_HOME__!.navigationAppliedAt!);
  });
});
