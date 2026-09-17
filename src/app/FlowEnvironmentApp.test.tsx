import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import {
  BrowserRecognitionAdapter,
  type RecognitionAdapter,
} from "../features/day-planner/voice/recognition";
import {
  LiveOwnershipCoordinator,
  type LiveOwnershipTransport,
} from "../features/voice/liveOwnership";
import { createLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { withEventDefaults } from "../features/day-planner/eventDefaults";
import { primaryWorldUiActions, type UiActionDescriptor } from "../shared/command/uiActionDescriptors";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { acceptanceFixture } from "../features/voice-intelligence/acceptanceFixtures";

type OwnershipMessage = Parameters<LiveOwnershipTransport["publish"]>[0];

class SharedLeaseBus {
  value: string | null = null;
  private listeners = new Map<string, (message: OwnershipMessage) => void>();
  subscriptions = 0;
  unsubscriptions = 0;
  closes = 0;

  get activeSubscriptions() { return this.listeners.size; }

  transport(id: string): LiveOwnershipTransport {
    return {
      read: () => this.value,
      write: (value) => { this.value = value; },
      remove: () => { this.value = null; },
      publish: (message) => this.listeners.forEach((listener, listenerId) => {
        if (listenerId !== id) listener(message);
      }),
      subscribe: (listener) => {
        this.subscriptions += 1;
        this.listeners.set(id, listener);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          this.unsubscriptions += 1;
          this.listeners.delete(id);
        };
      },
      close: () => { this.closes += 1; this.listeners.delete(id); },
    };
  }
}

const ownershipOptions = (ownerId: string) => ({ ownerId, settleMs: 5, releaseWaitMs: 20, heartbeatMs: 1_000, leaseMs: 2_000 });

class DelayedPhraseRecognition {
  static instances: DelayedPhraseRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  phrases: Array<{ phrase: string; boost: number }> = [];
  onstart: (() => void) | null = null;
  onresult: ((event: Event & { results: ArrayLike<unknown> }) => void) | null = null;
  onerror: ((event: Event & { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() { DelayedPhraseRecognition.instances.push(this); }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { window.setTimeout(() => this.onend?.(), 140); }
  error(error: string) { this.onerror?.({ error } as Event & { error: string }); }
  final(transcript: string) {
    const result = Object.assign({ 0: { transcript, confidence: 1 }, length: 1 }, { isFinal: true });
    this.onresult?.({ results: Object.assign({ 0: result }, { length: 1 }) } as unknown as Event & { results: ArrayLike<unknown> });
  }
}

class TestPhrase {
  constructor(public phrase: string, public boost = 1) {}
}

const fixedTestNow = () => new Date("2026-09-03T09:00:00");
const worldEvents = (snapshot: LifeSnapshot) => Object.values(snapshot.document.calendars).flatMap((plan) => plan.events);

function setup(adapter?: RecognitionAdapter, now: () => Date = fixedTestNow, liveOwnership?: LiveOwnershipCoordinator) {
  const rendered = render(<FlowEnvironmentApp liveOwnership={liveOwnership} now={now} recognitionAdapter={adapter} />);
  const command = (value: string) => {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const input = screen.getByLabelText("Tell Flow what to change");
    fireEvent.change(input, { target: { value } }); fireEvent.submit(input.closest("form")!);
  };
  return { command, ...rendered };
}

beforeEach(() => {
  localStorage.clear();
  delete window.__FLOW_MOTION__;
  window.history.replaceState({}, "", "/");
});

describe("Flow living environment", () => {
  it("presents the actual near-time choice before a separate removal confirmation", async () => {
    const fixture = acceptanceFixture("calendar-near");
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(fixture.snapshot));
    const { command } = setup(undefined, () => new Date(fixture.context.nowMs!));
    command("Open calendar");
    await screen.findByTestId("calendar-space");
    const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    command("Delete the eleven o'clock meeting");
    fireEvent.click(await screen.findByRole("button", { name: "Shareholders — Tuesday, Sep 8, 11:30 AM" }));
    const confirm = await screen.findByRole("button", { name: "Confirm removal" });
    expect(JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!)).toEqual(before);
    expect(document.querySelector("[data-event-id='E1']")).toBeInTheDocument();
    fireEvent.click(confirm);
    await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(before.past.length + 1));
    const expected = structuredClone(before.document);
    expected.calendar.events = []; expected.calendars[expected.calendar.dateKey]!.events = [];
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document).toEqual(expected);
    command("Undo");
    await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document).toEqual(before.document));
    command("Redo");
    await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document).toEqual(expected));
  });
  it("renders the four real Home projections and deep-link navigation", async () => {
    setup();
    expect(screen.getByTestId("home-space")).toBeInTheDocument();
    ["Today", "Capture", "Outcomes", "Commitments"].forEach((name) => expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: "Capture" })[0]!);
    expect(await screen.findByTestId("inbox-space")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/capture");
  });

  it("resolves Home attention into an outcome, reserves its next step, and schedules commitment preparation", async () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T09:00:00"));
    command("Capture renew passport before Senegal");
    fireEvent.click(screen.getByRole("button", { name: "Make outcome" }));
    await waitFor(() => expect(screen.getByTestId("plan-detail")).toBeInTheDocument(), { timeout: 1_800 });
    command("Home");
    fireEvent.click(await screen.findByRole("button", { name: "Find time" }));
    await waitFor(() => expect(screen.getByTestId("calendar-space")).toBeInTheDocument(), { timeout: 1_800 });
    command("I promised Maya the proposal by Friday");
    command("Home");
    fireEvent.click(await screen.findByRole("button", { name: "Reserve time" }));
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.links.filter(({ type }) => type === "step-scheduled-as-event")).toHaveLength(1);
      expect(state.document.links.filter(({ type }) => type === "commitment-reserved-by-event")).toHaveLength(1);
      expect(state.past).toHaveLength(5);
    });
  });

  it("expands a selected Home card into a matching destination shell while siblings recede", async () => {
    setup();
    const inbox = document.querySelector<HTMLButtonElement>("[data-home-space-card='inbox']")!;
    const calendar = document.querySelector<HTMLButtonElement>("[data-home-space-card='calendar']")!;
    expect(inbox).toHaveAttribute("data-layout-id", "space-inbox");
    fireEvent.click(inbox);
    expect(inbox).toHaveAttribute("data-home-space-selected", "true");
    expect(calendar).toHaveAttribute("data-home-space-receded", "true");
    const destination = await screen.findByTestId("inbox-space");
    const shell = destination.closest("[data-space-shell]");
    expect(shell).toHaveAttribute("data-layout-id", "space-inbox");
    expect(shell).toHaveAttribute("data-space-transition-mode", "shared-layout");
  });

  it("resets Home card transition state after returning and accepts keyboard entry immediately", async () => {
    setup();
    fireEvent.click(document.querySelector<HTMLButtonElement>("[data-home-space-card='plans']")!);
    expect(await screen.findByTestId("plans-space")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Flow home" }));
    const inbox = await waitFor(() => {
      const card = document.querySelector<HTMLButtonElement>("[data-home-space-card='inbox']");
      expect(card).not.toBeNull();
      expect(card).toHaveAttribute("data-home-space-selected", "false");
      return card!;
    });
    fireEvent.keyDown(inbox, { key: "Enter" });
    expect(await screen.findByTestId("inbox-space")).toBeInTheDocument();
  });

  it("keeps Flow Live presence visible in the header and lets it revoke the session", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    const presence = screen.getByTestId("flow-live-presence");
    expect(presence).toHaveAttribute("data-flow-live-status", "sleeping");
    fireEvent.click(presence);
    await waitFor(() => expect(presence).toHaveAttribute("data-flow-live-status", "listening"));
    expect(adapter.startCount).toBe(1);
    fireEvent.click(presence);
    await waitFor(() => expect(presence).toHaveAttribute("data-flow-live-status", "sleeping"));
    expect(adapter.abortCount).toBeGreaterThan(0);
  });

  it("survives the development StrictMode effect probe and tears ownership down exactly once", async () => {
    const bus = new SharedLeaseBus();
    const firstAdapter = new FakeRecognitionAdapter();
    const firstOwnership = new LiveOwnershipCoordinator(bus.transport("strict-first"), ownershipOptions("strict-tab-first"));
    const first = render(
      <StrictMode>
        <FlowEnvironmentApp recognitionAdapter={firstAdapter} liveOwnership={firstOwnership} />
      </StrictMode>,
    );

    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(firstOwnership.isDestroyed()).toBe(false);
    expect(bus.activeSubscriptions).toBe(1);
    expect(bus.unsubscriptions).toBe(0);
    expect(bus.closes).toBe(0);

    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(firstAdapter.startCount).toBe(1));
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
    expect(firstAdapter.abortCount).toBe(0);

    fireEvent.click(screen.getByLabelText("Stop Flow Live"));
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping"));
    expect(firstAdapter.abortCount).toBe(1);
    first.unmount();
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(firstAdapter.abortCount).toBe(1);
    expect(firstOwnership.isDestroyed()).toBe(true);
    expect(bus.activeSubscriptions).toBe(0);
    expect(bus.unsubscriptions).toBe(1);
    expect(bus.closes).toBe(1);

    const secondAdapter = new FakeRecognitionAdapter();
    const secondOwnership = new LiveOwnershipCoordinator(bus.transport("strict-second"), ownershipOptions("strict-tab-second"));
    const second = render(
      <StrictMode>
        <FlowEnvironmentApp recognitionAdapter={secondAdapter} liveOwnership={secondOwnership} />
      </StrictMode>,
    );
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(secondAdapter.startCount).toBe(1));
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
    second.unmount();
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    expect(secondAdapter.abortCount).toBe(1);
    expect(secondOwnership.isDestroyed()).toBe(true);
    expect(bus.activeSubscriptions).toBe(0);
    expect(bus.subscriptions).toBe(2);
    expect(bus.unsubscriptions).toBe(2);
    expect(bus.closes).toBe(2);
  });

  it("keeps the locked command surface present and holds actionable confirmation open", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal");
    expect(screen.getByLabelText("Tell Flow what to change")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "/" });
    const input = await screen.findByLabelText("Tell Flow what to change");
    await waitFor(() => expect(input).toHaveFocus());
    command("Delete this capture");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    expect(screen.getByLabelText("Tell Flow what to change")).toBeInTheDocument();
  });

  it("treats typed navigation as a completed result and retains its transcript", () => {
    const { command } = setup();
    command("Home");
    expect(screen.getByText("Opened Home")).toBeInTheDocument();
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Home");
  });

  it("recedes during quiet recognition and keeps the exact interim visible without expanding the reserved dock", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Home"));
    await waitFor(() => expect(adapter.startCount).toBe(2), { timeout: 600 });
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
    expect(screen.getByRole("button", { name: "Stop Flow Live" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Flow command" })).toBeInTheDocument(), { timeout: 2_500 });
    act(() => adapter.emitInterim("Renew passport"));
    expect(screen.getByRole("button", { name: "Open Flow command" })).toHaveTextContent("Renew passport");
    // September 8 layout contract: interim hypotheses remain visible but no
    // longer resize the shell before an actionable final/clarification.
    expect(document.querySelector("[data-command-expanded='true']")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Renew passport");
    expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  });

  it("settles each consecutive completed typed request, including a same-route Home command", () => {
    const { command } = setup();
    command("Home");
    expect(screen.getByTestId("home-space")).toHaveAttribute("data-voice-phase", "success");
    command("Home");
    expect(screen.getByTestId("home-space")).toHaveAttribute("data-voice-phase", "success");
    expect((JSON.parse(localStorage.getItem("flow.life.v3")!) as LifeSnapshot).past).toHaveLength(0);
  });

  it("suspends Flow Live while hidden, resumes once, and commits the resumed final exactly once", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    let hidden = false;
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    try {
      fireEvent.click(screen.getByLabelText("Start Flow Live"));
      await waitFor(() => expect(adapter.startCount).toBe(1));
      hidden = true;
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "suspended"));
      expect(adapter.abortCount).toBe(1);
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      expect(adapter.startCount).toBe(1);

      hidden = false;
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(() => expect(adapter.startCount).toBe(2));
      await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
      act(() => adapter.emitFinal("Capture Buy coffee", "resumed-final"));
      await waitFor(() => {
        const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
        expect(state.document.captures).toEqual([expect.objectContaining({ title: "Buy coffee" })]);
        expect(state.past).toHaveLength(1);
      });
      await waitFor(() => expect(adapter.startCount).toBe(3), { timeout: 700 });
      act(() => adapter.emitFinal("Capture Buy coffee", "resumed-final"));
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.captures).toHaveLength(1);
      expect(state.past).toHaveLength(1);
    } finally {
      hiddenSpy.mockRestore();
    }
  }, 12_000);

  it("does not auto-restart after permission denial but lets the user retry and commit after permission changes", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitError("permission-denied"));
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "permission-denied"));
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    expect(adapter.startCount).toBe(1);
    expect(screen.getByText(/Allow it in Site settings, then Retry/)).toBeInTheDocument();
    expect(screen.queryByText("Flow Live ready")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Retry Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(2));
    act(() => adapter.emitFinal("Capture Permission restored", "permission-retry-final"));
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.captures).toEqual([expect.objectContaining({ title: "Permission restored" })]);
      expect(state.past).toHaveLength(1);
    });
  });

  it("preserves microphone failure across visibility changes and retries without duplicate action", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    let hidden = false;
    const hiddenSpy = vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    try {
      fireEvent.click(screen.getByLabelText("Start Flow Live"));
      await waitFor(() => expect(adapter.startCount).toBe(1));
      act(() => adapter.emitError("microphone-unavailable"));
      await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "microphone-unavailable"));
      expect(screen.getByText(/Check the input device and macOS permission/)).toBeInTheDocument();

      hidden = true; act(() => document.dispatchEvent(new Event("visibilitychange")));
      hidden = false; act(() => document.dispatchEvent(new Event("visibilitychange")));
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "microphone-unavailable");
      expect(adapter.startCount).toBe(1);

      fireEvent.click(screen.getByLabelText("Retry Flow Live"));
      await waitFor(() => expect(adapter.startCount).toBe(2));
      act(() => adapter.emitFinal("Capture Retry succeeded", "retry-boundary"));
      await waitFor(() => expect(adapter.startCount).toBe(3), { timeout: 700 });
      act(() => adapter.emitFinal("Capture Retry succeeded", "retry-boundary"));
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.captures).toEqual([expect.objectContaining({ title: "Retry succeeded" })]);
      expect(state.past).toHaveLength(1);
    } finally {
      hiddenSpy.mockRestore();
    }
  });

  it("captures globally without changing Calendar", () => {
    const { command } = setup();
    const before = (JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.calendar;
    command("Capture Renew passport before Senegal");
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(after.document.captures).toContainEqual(expect.objectContaining({ title: "Renew passport before Senegal", status: "unresolved" }));
    expect(after.document.calendar).toEqual(before);
    expect(after.past).toHaveLength(1);
  });

  it("routes valid Calendar creation before capture ambiguity, clarifies duplicate meeting titles, and rejects an invalid clock", () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T09:00:00"));
    command("Add a 30 minute product meeting at 10");
    command("Add a 30 minute hiring meeting at 3");
    let state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.calendar.events).toContainEqual(expect.objectContaining({ title: "Product meeting", start: 600, end: 630 }));
    expect(state.document.calendar.events).toContainEqual(expect.objectContaining({ title: "Hiring meeting", start: 900, end: 930 }));
    expect(state.document.captures).toHaveLength(0);
    command("Move the meeting to 8:30 am");
    expect(screen.getByText("Which meeting do you mean?")).toBeInTheDocument();
    command("Put workout at 25");
    state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(screen.getByText("That time is outside a valid 24-hour clock.")).toBeInTheDocument();
    expect(state.document.captures).toHaveLength(0);
    expect(state.past).toHaveLength(2);
  });

  it("keeps a dated Calendar create in the active Calendar domain instead of treating it as a plan step", async () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T09:00:00"));
    command("Calendar");
    await screen.findByTestId("calendar-space");
    command("Schedule a 30 minute product meeting Friday at two");
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    const created = worldEvents(state)
      .find(({ title }) => title.toLowerCase() === "product meeting");
    expect(created).toMatchObject({ dateKey: "2026-09-04", start: 840, end: 870 });
    expect(state.document.captures).toHaveLength(0);
    expect(state.document.steps).toHaveLength(0);
    expect(state.past).toHaveLength(1);
    expect(screen.queryByText(/can't find the .* step/i)).not.toBeInTheDocument();
  });

  it("supplies current time to Calendar start and recovery commands in the shared Life pipeline", () => {
    let currentTime = "2026-09-03T13:00:00";
    const { command } = setup(undefined, () => new Date(currentTime));
    const emailBefore = (JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.calendar.events.find(({ id }) => id === "email");
    command("I'm 35 minutes behind. Keep dinner at seven");
    let state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.calendar.events.find(({ id }) => id === "email")).toEqual(emailBefore);
    expect(state.document.calendar.events.find(({ id }) => id === "roadmap")?.start).toBe(14 * 60 + 35);

    command("Undo");
    currentTime = "2026-09-03T14:10:00";
    command("Start roadmap");
    state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.calendar.events.find(({ id }) => id === "roadmap")?.status).toBe("active");
  });

  it("keeps the exact spoken history transcript visible after undo and redo", () => {
    const { command } = setup();
    command("Capture Buy coffee");
    command("Undo");
    expect(screen.getByText("“Undo”")).toBeInTheDocument();
    command("Redo");
    expect(screen.getByText("“Redo”")).toBeInTheDocument();
  });

  it("keeps Calendar reopen commands in Calendar and replays the latest movement geometry", async () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T14:10:00"));
    command("Calendar");
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    command("Start roadmap");
    command("Complete roadmap");
    command("Reopen roadmap");
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.calendar.events.find(({ id }) => id === "roadmap")?.status).toBe("planned");

    command("Move the 2 PM meeting to three");
    command("What changed?");
    await waitFor(() => expect(document.querySelector("[data-event-id='roadmap']")).toHaveAttribute("data-transaction-kind", "move"));
    expect(document.querySelector("[data-origin-id='roadmap']")).toBeNull();
  });

  it("converts a focused capture as one linked undoable transaction", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal");
    fireEvent.click(screen.getAllByRole("button", { name: "Capture" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }, { timeout: 2500 }));
    command("Turn that into a plan");
    await waitFor(() => expect(screen.getByTestId("plan-detail")).toBeInTheDocument(), { timeout: 1800 });
    expect(document.querySelectorAll("main > [data-space-shell]")).toHaveLength(1);
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText(/No due date/)).toBeInTheDocument();
    let state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.past).toHaveLength(2);
    expect(state.document.links).toContainEqual(expect.objectContaining({ type: "capture-origin-of-plan" }));
    fireEvent.click(screen.getByLabelText("Undo last change"));
    state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.plans).toHaveLength(0);
    expect(state.document.captures[0]?.status).toBe("unresolved");
    fireEvent.click(screen.getByLabelText("Redo last change"));
    state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.plans).toHaveLength(1);
    expect(state.document.captures[0]?.status).toBe("resolved");
  });

  it("routes one capture to Today or Commitments without duplicate retained text", async () => {
    const { command } = setup();
    command("Capture call the vet");
    command("Turn this capture into a 30 minute event tomorrow at two");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.captures).toEqual([expect.objectContaining({ title: "Call the vet", status: "resolved" })]);
      expect(worldEvents(state)).toContainEqual(expect.objectContaining({ title: "Call the vet", start: 14 * 60 }));
      expect(state.document.links).toContainEqual(expect.objectContaining({ type: "capture-origin-of-event" }));
    });
    command("Undo");
    command("Capture");
    fireEvent.click(await screen.findByRole("button", { name: "Call the vet" }));
    command("Turn this capture into a waiting on commitment with Daniel");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.commitments).toEqual([expect.objectContaining({ title: "Call the vet", direction: "waiting-on" })]);
      expect(state.document.people).toEqual([expect.objectContaining({ name: "Daniel" })]);
      expect(state.document.links).toContainEqual(expect.objectContaining({ type: "capture-origin-of-commitment" }));
      expect(state.document.captures[0]?.status).toBe("resolved");
    });
  });

  it("lets a newer navigation interrupt stale cross-space motion", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal"); command("Inbox");
    fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }));
    command("Turn that into a plan");
    command("Home");
    await new Promise((resolve) => window.setTimeout(resolve, 1_250));
    expect(screen.getByTestId("home-space")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-detail")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Home");
  });

  it("creates an idempotent person and dated promise", () => {
    const { command } = setup();
    command("I promised Maya I’d send the proposal by Friday");
    command("I promised Maya I'd review the draft by Friday");
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.people).toHaveLength(1);
    expect(state.document.people[0]?.name).toBe("Maya");
    expect(state.document.commitments).toHaveLength(2);
    expect(state.document.commitments[0]?.title).toBe("Send the proposal");
    expect(state.document.commitments.every(({ dueAt }) => Boolean(dueAt))).toBe(true);
  });

  it("shows undated promises and real plan and Calendar relationships", async () => {
    const { command } = setup();
    command("I promised Maya I'd send the proposal");
    await waitFor(() => expect(screen.getByTestId("people-space")).toBeInTheDocument(), { timeout: 4_000 });
    expect(screen.getByText("No due date")).toBeInTheDocument();
    command("Reserve 30 minutes for the proposal promise to Maya Friday at two");
    await waitFor(() => expect(screen.getByTestId("calendar-space")).toBeInTheDocument(), { timeout: 4_000 });
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    const reservation = state.document.links.find(({ type }) => type === "commitment-reserved-by-event");
    expect(reservation).toBeDefined();
    expect(worldEvents(state)).toContainEqual(expect.objectContaining({ id: reservation?.toId, start: 840, end: 870 }));
    command("People");
    expect(await screen.findByText(/Today · 2026-09-04 2 PM/)).toBeInTheDocument();
  });

  it("adds and schedules a plan step after a Calendar anchor as one transaction", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal"); command("Inbox");
    fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }, { timeout: 2500 }));
    command("Turn that into a plan");
    await waitFor(() => expect(screen.getByTestId("plan-detail")).toBeInTheDocument(), { timeout: 1800 });
    const before = (JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past.length;
    command("Add a 25 minute Photos step and schedule it after lunch");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      const photo = state.document.steps.find(({ title }) => title === "Photos");
      const link = state.document.links.find(({ fromId }) => fromId === photo?.id);
      const event = state.document.calendar.events.find(({ id }) => id === link?.toId);
      expect(photo?.status).toBe("scheduled"); expect(event?.start).toBe(13 * 60 + 15);
      expect(state.past).toHaveLength(before + 1);
      expect(state.lastTransaction?.actionTypes).toEqual(["plan.step.add", "step.schedule"]);
    });
  });

  it("opens a scheduled plan step's exact Calendar relationship", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal"); command("Inbox");
    fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }));
    command("Turn that into a plan");
    await waitFor(() => expect(screen.getByTestId("plan-detail")).toBeInTheDocument(), { timeout: 900 });
    command("Schedule Documents Friday at two");
    await waitFor(() => expect(screen.getByTestId("calendar-space")).toBeInTheDocument(), { timeout: 900 });
    command("Plans");
    fireEvent.click(await screen.findByRole("button", { name: /Renew passport before Senegal/ }));
    const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    const step = before.document.steps.find(({ title }) => title === "Documents")!;
    const link = before.document.links.find(({ type, fromId }) => type === "step-scheduled-as-event" && fromId === step.id)!;
    const reserved = worldEvents(before).find(({ id }) => id === link.toId)!;
    expect(reserved).toMatchObject({ dateKey: "2026-09-04", start: 840 });
    fireEvent.click(await screen.findByRole("button", { name: "Inspect Documents in Today" }));
    await waitFor(() => expect(document.querySelector(`[data-event-id='${reserved.id}']`)).toHaveAttribute("aria-pressed", "true"));
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(after.temporal?.scope).toEqual({ kind: "day", dateKey: "2026-09-04" });
    expect(after.document).toEqual({ ...before.document, calendar: before.document.calendars["2026-09-04"] });
    expect(after.past).toEqual(before.past); expect(after.future).toEqual(before.future);
    expect(after.document.links).toContainEqual(link);
    expect(screen.queryByTestId("calendar-relationship-inspector")).not.toBeInTheDocument();
  });

  it("keeps a future event's contextual styling visible from Today", async () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T09:00:00"));
    command("Book breakfast at Café Luna tomorrow at eight");
    await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(1));
    command("Make it blue and important");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(worldEvents(state)).toContainEqual(expect.objectContaining({ title: "Breakfast at Café Luna", color: "blue", importance: "important" }));
    });
    command("Calendar");
    const relationship = await screen.findByTestId("calendar-relationship-inspector");
    expect(relationship).toHaveAttribute("data-color", "blue");
    expect(relationship).toHaveAttribute("data-importance", "important");
    expect(relationship).toHaveTextContent("Breakfast at Café Luna");
  });

  it("keeps Calendar success and what-if outcomes observable on the global surface", async () => {
    const { command } = setup();
    command("Move the 2 PM meeting to four");
    expect(await screen.findByText("Day reshaped")).toBeInTheDocument();
    command("What if I add a 30 minute walk at six PM");
    expect(await screen.findByText("Preview — nothing committed")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(stored.document.calendar.events.some(({ title }) => title === "Walk")).toBe(false);
  });

  it("runs a final voice transcript through the same global command path", async () => {
    const adapter = new FakeRecognitionAdapter();
    setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitInterim("Renew passport"));
    expect(screen.getByDisplayValue("Renew passport")).toBeInTheDocument();
    act(() => adapter.emitFinal("Capture Renew passport before Senegal"));
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.captures[0]?.source).toBe("voice");
    });
    expect(screen.getByDisplayValue("Capture Renew passport before Senegal")).toBeInTheDocument();
    await waitFor(() => expect(adapter.startCount).toBe(2), { timeout: 800 });
  });

  it("keeps important Home, Today, Capture, Outcomes, and Commitments buttons in click, typed, and final-voice parity", async () => {
    type Mode = "click" | "typed" | "voice";
    type Prepared = ReturnType<typeof setup> & { adapter: FakeRecognitionAdapter };
    interface ParityCase {
      name: string;
      action: UiActionDescriptor;
      prepare: (prepared: Prepared) => Promise<void>;
      click: () => void;
      signature: (snapshot: LifeSnapshot) => unknown;
    }
    const noPreparation = async () => undefined;
    const cases: ParityCase[] = [
      {
        name: "Home",
        action: primaryWorldUiActions.home.seeFullDay,
        prepare: noPreparation,
        click: () => fireEvent.click(document.querySelector<HTMLButtonElement>('[data-flow-action="See full day"]')!),
        signature: (snapshot) => ({ path: window.location.pathname, past: snapshot.past.length, revision: snapshot.revision }),
      },
      {
        name: "Today",
        action: primaryWorldUiActions.today.protectEvent("Deep work — project brief"),
        prepare: async ({ command }) => {
          command("Calendar");
          await screen.findByTestId("calendar-space");
          fireEvent.click(document.querySelector<HTMLButtonElement>("[data-event-id='deep-work']")!);
        },
        click: () => fireEvent.click(screen.getByTitle("Protect")),
        signature: (snapshot) => ({
          protected: snapshot.document.calendar.events.find(({ id }) => id === "deep-work")?.protected,
          history: snapshot.past.map(({ lastTransaction }) => lastTransaction?.actionTypes ?? []),
        }),
      },
      {
        name: "Capture",
        action: primaryWorldUiActions.capture.turnIntoOutcome,
        prepare: async ({ command }) => {
          command("Capture Renew passport before Senegal");
          command("Capture");
          await screen.findByTestId("inbox-space");
          fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }));
        },
        click: () => fireEvent.click(screen.getByRole("button", { name: primaryWorldUiActions.capture.turnIntoOutcome.label })),
        signature: (snapshot) => ({
          captureStatus: snapshot.document.captures[0]?.status,
          plans: snapshot.document.plans.map(({ title, status }) => ({ title, status })),
          history: snapshot.past.map(({ lastTransaction }) => lastTransaction?.actionTypes ?? []),
        }),
      },
      {
        name: "Outcomes",
        action: primaryWorldUiActions.outcomes.complete,
        prepare: async ({ command }) => {
          command("Create an outcome called Renew passport before Senegal");
          await screen.findByTestId("plan-detail");
        },
        click: () => fireEvent.click(screen.getByRole("button", { name: primaryWorldUiActions.outcomes.complete.label })),
        signature: (snapshot) => ({
          statuses: snapshot.document.plans.map(({ status }) => status),
          history: snapshot.past.map(({ lastTransaction }) => lastTransaction?.actionTypes ?? []),
        }),
      },
      {
        name: "Commitments",
        action: primaryWorldUiActions.commitments.complete("Proposal", "Maya"),
        prepare: async ({ command }) => {
          command("I promised Maya the proposal by Friday");
          command("Commitments");
          await screen.findByTestId("people-space");
        },
        click: () => fireEvent.click(screen.getByRole("button", { name: "Complete" })),
        signature: (snapshot) => ({
          commitments: snapshot.document.commitments.map(({ title, status }) => ({ title, status })),
          history: snapshot.past.map(({ lastTransaction }) => lastTransaction?.actionTypes ?? []),
        }),
      },
    ];

    for (const parityCase of cases) {
      const results: unknown[] = [];
      for (const mode of ["click", "typed", "voice"] satisfies Mode[]) {
        localStorage.clear();
        window.history.replaceState({}, "", "/");
        const adapter = new FakeRecognitionAdapter();
        const prepared = { ...setup(adapter), adapter };
        await parityCase.prepare(prepared);
        if (mode === "click") parityCase.click();
        else if (mode === "typed") prepared.command(parityCase.action.phrase);
        else {
          fireEvent.click(screen.getByLabelText("Start Flow Live"));
          await waitFor(() => expect(adapter.startCount).toBe(1));
          act(() => adapter.emitFinal(parityCase.action.phrase, `parity-${parityCase.name}`));
        }
        const result = await waitFor(() => {
          const snapshot = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
          const signature = parityCase.signature(snapshot);
          if (parityCase.name === "Home") expect(screen.getByLabelText("Global Flow command")).toHaveTextContent(/Opened Today|already here|Day changed/);
          else expect(snapshot.past.length, `${parityCase.name} ${mode} committed through the canonical history boundary`).toBe(2 - Number(parityCase.name === "Today"));
          return signature;
        }, { timeout: 2_500 });
        results.push(result);
        prepared.unmount();
      }
      expect(results[1], `${parityCase.name} typed parity`).toEqual(results[0]);
      expect(results[2], `${parityCase.name} final-voice parity`).toEqual(results[0]);
    }
  }, 40_000);

  it("ranks an actionable Living transcript above a higher-confidence unusable alternative", async () => {
    const adapter = new FakeRecognitionAdapter();
    setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal([
      { transcript: "move later maybe", confidence: 0.98 },
      { transcript: "Capture Renew passport before Senegal", confidence: 0.52 },
    ]));
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.captures).toContainEqual(expect.objectContaining({ title: "Renew passport before Senegal" }));
    });
    expect(screen.getByDisplayValue("Capture Renew passport before Senegal")).toBeInTheDocument();
  });

  it("routes a lower-confidence navigation alternative ahead of explicit capture", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal([
      { transcript: "Capture open the calendar", confidence: 0.99 },
      { transcript: "Open the calendar", confidence: 0.2 },
    ]));
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.captures).toHaveLength(0); expect(state.past).toHaveLength(0);
  });

  it("lets complete Calendar actions beat higher-confidence fuzzy navigation alternatives", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal([
      { transcript: "Open focus aria", confidence: 0.99 },
      { transcript: "Move deep work to four", confidence: 0.2 },
    ]));
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.document.calendar.events.find(({ id }) => id === "deep-work")?.start).toBe(16 * 60);
      expect(state.past).toHaveLength(1);
    });
    expect(screen.getByDisplayValue("Move deep work to four")).toBeInTheDocument();
    expect(screen.queryByTestId("focus-space")).not.toBeInTheDocument();
  });

  it("inspects a Today event by noun and source time without mutating history", async () => {
    const { command } = setup();
    command("Show the meeting at two");
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("[data-event-id='roadmap']")).toHaveAttribute("aria-pressed", "true"));
    command("Open the two PM meeting");
    await waitFor(() => expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("Selected for your next command"));
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.past).toHaveLength(0);
    expect(state.document.calendar.events.find(({ id }) => id === "roadmap")?.start).toBe(14 * 60);
  });

  it("runs event inspection through a final fake-voice transcript without a navigation fallback", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Open the two PM meeting", "inspect-event"));
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("[data-event-id='roadmap']")).toHaveAttribute("aria-pressed", "true"));
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.past).toHaveLength(0);
    expect(screen.getByDisplayValue("Open the two PM meeting")).toBeInTheDocument();
  });

  it("uses person context and refines a pending Focus proposal through typed input without premature history", async () => {
    const now = () => new Date("2026-09-04T09:32:00");
    const snapshot = createLifeSnapshot("2026-09-04");
    const at = now().toISOString();
    snapshot.document.people.push({ id: "person-sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at });
    snapshot.document.commitments.push({ id: "commitment-sarah", kind: "commitment", personId: "person-sarah", title: "Send the proposal", direction: "i-owe", status: "open", createdAt: at, updatedAt: at });
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    const { command } = setup(undefined, now);

    command("Show Sarah");
    command("What do I owe her?");
    await waitFor(() => expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("Sarah: Send the proposal"));
    command("Give me forty minutes");
    await waitFor(() => expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("You asked for 40 minutes. You have 28 clear."));
    command("Actually make it 15.");
    await waitFor(() => expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("15 minutes ready"));
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(0);
    command("Do it");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.past).toHaveLength(1);
      expect(state.document.focus.active?.durationMinutes).toBe(15);
    });
  });

  it("uses person context and refines a pending Focus proposal through final fake-voice transcripts", async () => {
    const now = () => new Date("2026-09-04T09:32:00");
    const snapshot = createLifeSnapshot("2026-09-04");
    const at = now().toISOString();
    snapshot.document.people.push({ id: "person-sarah", kind: "person", name: "Sarah", createdAt: at, updatedAt: at });
    snapshot.document.commitments.push({ id: "commitment-sarah", kind: "commitment", personId: "person-sarah", title: "Send the proposal", direction: "i-owe", status: "open", createdAt: at, updatedAt: at });
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    const adapter = new FakeRecognitionAdapter(); setup(adapter, now);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    let cycle = 1;
    const speak = async (transcript: string) => {
      act(() => adapter.emitFinal(transcript, `context-${cycle}`));
      cycle += 1;
      await waitFor(() => expect(adapter.startCount).toBe(cycle), { timeout: 900 });
    };
    await speak("Show Sarah");
    await speak("What do I owe her?");
    expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("Sarah: Send the proposal");
    await speak("Give me forty minutes");
    await speak("Actually make it 15.");
    expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("15 minutes ready");
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(0);
    await speak("Do it");
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.past).toHaveLength(1);
    expect(state.document.focus.active?.durationMinutes).toBe(15);
    expect(screen.getByDisplayValue("Do it")).toBeInTheDocument();
  });

  it("never captures navigation, unsupported prose, or an incomplete domain command", async () => {
    const { command } = setup();
    command("Open the inbox");
    expect(await screen.findByTestId("inbox-space")).toBeInTheDocument();
    const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    command("Someday the moon may remember this sentence");
    expect(screen.getByText("Nothing changed")).toBeInTheDocument();
    command("Move the meeting");
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(after.document).toEqual(before.document); expect(after.past).toEqual(before.past);
  });

  it("keeps the resolved Calendar event through chained zero-selection edits and a buffer", () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T09:00:00.000Z"));
    command("Calendar");
    command("Move interview to 5"); command("Confirm");
    command("Move the 2 PM meeting to 4");
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).lastTransaction?.primaryEntity?.id).toBe("roadmap");
    command("Make it red");
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.calendar.events.find(({ id }) => id === "roadmap")?.color).toBe("red");
    command("Make it important");
    command("Give me 20 minutes before it");
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    const roadmap = state.document.calendar.events.find(({ id }) => id === "roadmap")!;
    expect(roadmap).toMatchObject({ id: "roadmap", start: 16 * 60, color: "red", importance: "important" });
    expect(state.document.calendar.breathingRooms).toContainEqual(expect.objectContaining({ linkedEventId: "roadmap", relation: "before" }));
    expect(state.lastTransaction?.primaryEntity).toMatchObject({ id: "roadmap", kind: "calendar-event" });
    // Moving Interview to the time it already occupies is a no-op. Canonical
    // event ordering ensures it cannot manufacture a history entry.
    expect(state.past).toHaveLength(4);
  });

  it("clarifies an expired pronoun without mutating a different current event", () => {
    let current = new Date("2026-09-03T09:00:00.000Z");
    const { command } = setup(undefined, () => current);
    command("Calendar"); command("Move interview to 5"); command("Confirm"); command("Move the 2 PM meeting to 4");
    const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    current = new Date(current.getTime() + 120_001);
    command("Make it red");
    expect(screen.getByText("Which Today event do you mean?")).toBeInTheDocument();
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(after.document).toEqual(before.document); expect(after.past).toEqual(before.past);
  });

  it("applies a spoken clarification choice through the pending stage", () => {
    const { command } = setup(undefined, () => new Date("2026-09-03T09:00:00.000Z"));
    command("Calendar"); command("Add a 30 minute product meeting at 10"); command("Add a 30 minute hiring meeting at 3");
    command("Move the meeting to 8:30 am");
    expect(screen.getByText("Which meeting do you mean?")).toBeInTheDocument();
    command("Product meeting — 10 AM");
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.calendar.events.find(({ title }) => title === "Product meeting")?.start).toBe(8 * 60 + 30);
    expect(state.past).toHaveLength(3);
  });

  it("deduplicates a repeated final boundary across persistent restarts", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Capture Buy coffee", "utterance-one"));
    await waitFor(() => expect(adapter.startCount).toBe(2), { timeout: 800 });
    act(() => adapter.emitFinal("Capture Buy coffee", "utterance-one"));
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.captures.filter(({ title }) => title === "Buy coffee")).toHaveLength(1);
    expect(state.past).toHaveLength(1);
  });

  it("accepts the same intentional command again on the next recognition cycle", async () => {
    const adapter = new FakeRecognitionAdapter(); const { command } = setup(adapter);
    command("Capture Buy coffee"); command("Capture Buy tea");
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Undo", "undo-one"));
    await waitFor(() => expect(adapter.startCount).toBe(2), { timeout: 800 });
    act(() => adapter.emitFinal("Undo", "undo-two"));
    await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.captures).toHaveLength(0));
  });

  it("keeps an interim voice transcript preview-only", async () => {
    const adapter = new FakeRecognitionAdapter();
    setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitInterim("Turn that into a plan"));
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.plans).toHaveLength(0);
    expect(state.past).toHaveLength(0);
  });

  it("suspends Flow Live on Escape", () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByLabelText("Start Flow Live")).toBeInTheDocument();
  });

  it("preempts an older tab, adopts its document, and preserves exact cross-tab undo history", async () => {
    const bus = new SharedLeaseBus();
    const firstOwnership = new LiveOwnershipCoordinator(bus.transport("first"), ownershipOptions("tab-a"));
    const secondOwnership = new LiveOwnershipCoordinator(bus.transport("second"), ownershipOptions("tab-b"));
    const adapter = new FakeRecognitionAdapter();
    const { command, unmount } = setup(adapter, undefined, firstOwnership);

    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    expect(await secondOwnership.claim()).toBe(true);
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "moved"));
    expect(adapter.abortCount).toBeGreaterThan(0);
    act(() => adapter.emitFinal("Capture Stale owner must not execute", "stale-owner"));
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.captures).toHaveLength(0);
    command("Calendar");
    command("What if I add a 30 minute walk at six?");
    expect(screen.getByText("What-if preview")).toBeInTheDocument();

    const initial = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    const at = "2026-09-03T10:00:00.000Z";
    const capture = { id: "capture-tab-b", kind: "capture" as const, title: "Created in tab B", status: "unresolved" as const, source: "voice" as const, createdAt: at, updatedAt: at };
    const document = structuredClone(initial.document); document.captures.push(capture);
    const external: LifeSnapshot = {
      revision: 1, document, past: [{ document: initial.document }], future: [],
      lastTransaction: { id: "tab-b-command", at, source: "voice", transcript: "Capture Created in tab B", summary: "Captured in Inbox.", before: initial.document, after: document, actionTypes: ["capture.create"] },
    };
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(external));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: LIFE_STORAGE_KEY, newValue: JSON.stringify(external) })));
    expect(screen.queryByText("What-if preview")).not.toBeInTheDocument();
    expect(screen.getByText("Updated from another Flow tab")).toBeInTheDocument();
    command("Capture");
    await waitFor(() => expect(screen.getAllByText("Created in tab B").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(2));
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
    act(() => adapter.emitFinal("Capture Cross tab owner", "cross-tab-final"));
    await waitFor(() => expect(adapter.startCount).toBe(3), { timeout: 800 });
    act(() => adapter.emitFinal("Capture Cross tab owner", "cross-tab-final"));
    let state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.captures).toEqual([
      expect.objectContaining({ title: "Created in tab B" }),
      expect.objectContaining({ title: "Cross tab owner" }),
    ]);
    expect(state.past).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("Undo last change"));
    state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.captures).toEqual([expect.objectContaining({ title: "Created in tab B" })]);
    expect(state.past).toHaveLength(1); expect(state.future).toHaveLength(1);
    fireEvent.click(screen.getByLabelText("Redo last change"));
    state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.captures.map(({ title }) => title)).toEqual(["Created in tab B", "Cross tab owner"]);
    expect(state.past).toHaveLength(2); expect(state.future).toHaveLength(0);

    unmount();
    secondOwnership.destroy();
  });

  it("keeps a claimant waiting until the losing shell confirms delayed native release", async () => {
    const bus = new SharedLeaseBus();
    const firstOwnership = new LiveOwnershipCoordinator(bus.transport("delayed-first"), { ...ownershipOptions("tab-delayed-a"), releaseWaitMs: 500 });
    const secondOwnership = new LiveOwnershipCoordinator(bus.transport("delayed-second"), { ...ownershipOptions("tab-delayed-b"), releaseWaitMs: 500 });
    const adapter = new FakeRecognitionAdapter();
    adapter.releaseDelayMs = 140;
    const { unmount } = setup(adapter, undefined, firstOwnership);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));

    const startedAt = performance.now();
    const claim = secondOwnership.claimWithRelease();
    await expect(claim).resolves.toEqual({ granted: true, priorRelease: "confirmed" });
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(120);
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "moved"));
    expect(adapter.releaseCount).toBe(1);
    expect(adapter.abortCount).toBe(1);
    act(() => adapter.emitFinal("Capture Must not execute", "released-stale-final"));
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.captures).toHaveLength(0);

    unmount(); secondOwnership.destroy();
  });

  it("cancels an in-flight phrase fallback when another tab preempts the Live shell", async () => {
    DelayedPhraseRecognition.instances = [];
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: DelayedPhraseRecognition });
    Object.defineProperty(window, "SpeechRecognitionPhrase", { configurable: true, value: TestPhrase });
    const bus = new SharedLeaseBus();
    const firstOwnership = new LiveOwnershipCoordinator(bus.transport("phrase-first"), { ...ownershipOptions("tab-phrase-a"), releaseWaitMs: 500 });
    const secondOwnership = new LiveOwnershipCoordinator(bus.transport("phrase-second"), { ...ownershipOptions("tab-phrase-b"), releaseWaitMs: 500 });
    const adapter = new BrowserRecognitionAdapter();
    const { unmount } = setup(adapter, undefined, firstOwnership);
    try {
      fireEvent.click(screen.getByLabelText("Start Flow Live"));
      await waitFor(() => expect(DelayedPhraseRecognition.instances).toHaveLength(1));
      const first = DelayedPhraseRecognition.instances[0]!;
      await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));

      first.error("phrases-not-supported");
      const claim = secondOwnership.claimWithRelease();
      await expect(claim).resolves.toEqual({ granted: true, priorRelease: "confirmed" });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      expect(DelayedPhraseRecognition.instances).toHaveLength(1);
      expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "moved");
      first.final("Capture stale fallback");
      expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.captures).toHaveLength(0);

      secondOwnership.release();
      fireEvent.click(screen.getByLabelText("Start Flow Live"));
      await waitFor(() => expect(DelayedPhraseRecognition.instances).toHaveLength(2));
      await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening"));
      act(() => DelayedPhraseRecognition.instances[1]!.final("Capture Fresh owner"));
      await waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).document.captures).toEqual([
        expect.objectContaining({ title: "Fresh owner" }),
      ]));
    } finally {
      unmount(); secondOwnership.destroy();
      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: undefined });
      Object.defineProperty(window, "SpeechRecognitionPhrase", { configurable: true, value: undefined });
    }
  });

  it("retries a recognition-busy start once and never enters an automatic retry loop", async () => {
    const adapter = new FakeRecognitionAdapter(); setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitError("recognition-busy"));
    await waitFor(() => expect(adapter.startCount).toBe(2), { timeout: 1_300 });
    act(() => adapter.emitError("recognition-busy"));
    await waitFor(() => expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "recognition-busy"));
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    expect(adapter.startCount).toBe(2);
    expect(screen.getByLabelText("Retry Flow Live")).toBeInTheDocument();
  });

  it("cancels a Calendar what-if preview on Escape without history or mutation", async () => {
    const { command } = setup();
    command("Calendar");
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    command("What if I add a 30 minute walk at six?");
    expect(screen.getByText("What-if preview")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByText("What-if preview")).not.toBeInTheDocument();
    expect(screen.getByText("Preview cancelled")).toBeInTheDocument();
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(after.document).toEqual(before.document);
    expect(after.past).toEqual(before.past);
  });

  it("cancels a pending destructive action on Escape", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal"); command("Inbox");
    fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }));
    command("Delete this capture");
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.captures).toHaveLength(1);
    expect(state.past).toHaveLength(1);
  });

  it("shows deterministic Now recommendations without creating Now records", async () => {
    const { command } = setup();
    command("Capture Renew passport before Senegal"); fireEvent.click(screen.getAllByRole("button", { name: "Capture" })[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }, { timeout: 2500 })); command("Turn that into a plan");
    command("What fits right now?");
    expect(await screen.findByTestId("home-space")).toBeInTheDocument();
    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.document.steps.length).toBe(3);
    expect(Object.keys(state.document)).not.toContain("now");
  });

  it.each(["/", "/today", "/focus", "/weather-outfit", "/people", "/good-to-know", "/capture", "/outcomes"])("answers what am I forgetting from %s without writing data or history", async (path) => {
    window.history.replaceState({}, "", path);
    const { command } = setup(undefined, () => new Date("2026-09-03T10:15:00"));
    command("Capture check passport expiry");
    const before = localStorage.getItem(LIFE_STORAGE_KEY);
    command("What am I forgetting?");
    await waitFor(() => expect(document.querySelector('[data-flow-feedback][data-feedback-phase="completed"]')).toHaveTextContent("Check passport expiry"));
    expect(document.querySelector('[data-flow-feedback][data-feedback-phase="completed"]')).toHaveTextContent("10m triage fits");
    expect(localStorage.getItem(LIFE_STORAGE_KEY)).toBe(before);
  });

  it("uses the short crossfade path with no frame sampler under reduced motion", async () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"), media: query, onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => true,
    }) });
    try {
      const { command } = setup();
      fireEvent.click(document.querySelector<HTMLButtonElement>("[data-home-space-card='inbox']")!);
      const inboxSpace = await screen.findByTestId("inbox-space");
      const shell = inboxSpace.closest("[data-space-shell]");
      expect(shell).toHaveAttribute("data-space-transition-mode", "reduced");
      expect(shell).not.toHaveAttribute("data-layout-id");
      command("Capture Renew passport before Senegal");
      fireEvent.click(await screen.findByRole("button", { name: "Renew passport before Senegal" }));
      command("Turn that into a plan");
      expect(window.__FLOW_MOTION__?.activeFrameLoops ?? 0).toBe(0);
      await waitFor(() => expect(document.querySelector("[data-transition-clone-count]")).toBeNull(), { timeout: 500 });
      expect(await screen.findByTestId("plan-detail", {}, { timeout: 700 })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
    }
  });

  it("runs the exact 24-step product-rescue journey through one persistent shared voice pipeline", async () => {
    const now = () => new Date("2026-09-04T09:32:00");
    const snapshot = createLifeSnapshot("2026-09-04");
    const tomorrow = "2026-09-05";
    snapshot.document.people.push({ id: "person-sarah", kind: "person", name: "Sarah", createdAt: now().toISOString(), updatedAt: now().toISOString() });
    snapshot.document.calendars[tomorrow]!.events = snapshot.document.calendars[tomorrow]!.events
      .filter(({ id }) => !id.startsWith("creative-review-"));
    snapshot.document.calendars[tomorrow]!.events.push(withEventDefaults({
      id: "meeting-tomorrow-2pm", title: "Team meeting", dateKey: tomorrow,
      start: 14 * 60, end: 15 * 60, kind: "flexible", priority: "medium",
    }));
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));

    const adapter = new FakeRecognitionAdapter();
    setup(adapter, now);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    let cycle = 1;
    const transcripts: string[] = [];
    const speak = async (transcript: string, restart = true) => {
      transcripts.push(transcript);
      act(() => adapter.emitFinal(transcript, `rescue-${cycle}`));
      cycle += 1;
      if (restart) await waitFor(() => expect(adapter.startCount).toBe(cycle), { timeout: 900 });
    };
    const history = async (length: number) => waitFor(() => expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(length));

    await speak("Open the focus area.");
    await waitFor(() => expect(screen.getByTestId("focus-space")).toBeInTheDocument());
    await speak("Go back home.");
    await speak("Could you show me my calendar screen please?");
    await speak("Go to the weather and outfit section.");
    await speak("What should I wear tomorrow?");
    await speak("Home.");
    await speak("Open my capture page.");
    await speak("Capture renew passport before Senegal."); await history(1);
    await speak("Take me to outcomes.");
    await speak("Turn the passport item into an outcome."); await history(2);
    await speak("Show commitments.");
    await speak("I promised Maya the proposal by Friday."); await history(3);
    await speak("Open the calendar area.");
    await speak("Move the two PM meeting to four."); await history(4);
    await speak("Make it red and important."); await history(5);
    await speak("Show Sarah.");
    await speak("Open the good to know area.");
    await speak("What should I know?");
    await speak("Give me forty minutes.");
    expect(screen.getByLabelText("Global Flow command")).toHaveTextContent("You asked for 40 minutes. You have 28 clear.");
    await speak("Do it."); await history(6);
    await speak("Undo."); await history(5);
    await speak("Redo."); await history(6);
    await speak("Go back home.");
    await speak("Pause listening.", false);

    const result = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    const moved = result.document.calendars[tomorrow]!.events.find(({ id }) => id === "meeting-tomorrow-2pm");
    expect(transcripts).toHaveLength(24);
    expect(adapter.startCount).toBeGreaterThanOrEqual(24);
    expect(result.past).toHaveLength(6);
    expect(result.document.captures).toHaveLength(1);
    expect(result.document.plans).toHaveLength(1);
    expect(result.document.commitments).toHaveLength(1);
    expect(moved).toMatchObject({ start: 16 * 60, end: 17 * 60, color: "red", importance: "important" });
    expect(result.document.focus.active?.durationMinutes).toBe(28);
    expect(screen.getByTestId("home-space")).toBeInTheDocument();
    expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  }, 15_000);

  it("preserves a commitment-specific clarification through its natural follow-up", async () => {
    const { command } = setup();
    command("Open commitments");
    expect(await screen.findByTestId("people-space")).toBeInTheDocument();
    command("add Miguel");
    expect(screen.getByText("What are you committing to Miguel?")).toBeInTheDocument();
    command("send the proposal Friday");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      const miguel = state.document.people.find(({ name }) => name === "Miguel");
      expect(miguel).toBeDefined();
      expect(state.document.commitments).toContainEqual(expect.objectContaining({ personId: miguel!.id, title: "Send the proposal", direction: "i-owe" }));
      expect(state.past).toHaveLength(1);
    });
  });

  it("opens Calendar and its requested week as one composed command", async () => {
    const { command } = setup();
    command("open my calendar for the whole week");
    expect(await screen.findByTestId("calendar-space")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/today");
    await waitFor(() => {
      const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(state.temporal?.scope).toMatchObject({ kind: "week", dateKey: "2026-08-31", endDateKey: "2026-09-06" });
      expect(state.past).toHaveLength(0);
    });
    const week = await screen.findByRole("region", { name: "Week calendar" });
    expect(week.querySelectorAll("[data-week-date]")).toHaveLength(7);
    expect(week.querySelectorAll("[data-week-event-id]").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Fri, Sep 4" }));
    expect(await screen.findByRole("region", { name: "Scrollable day timeline" })).toBeInTheDocument();
    expect((JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot).past).toHaveLength(0);
  });
});
