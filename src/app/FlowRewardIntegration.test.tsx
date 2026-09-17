import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { REWARD_PREFERENCES_KEY } from "../core/rewards/reward-preferences";

const now = () => new Date("2026-09-04T12:00:00.000Z");

async function typeCommand(command: string) {
  const open = screen.queryByRole("button", { name: "Open Flow command" });
  if (open) fireEvent.click(open);
  const input = screen.getByRole("textbox", { name: "Tell Flow what to change" });
  fireEvent.change(input, { target: { value: command } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(screen.queryByText("Understanding")).not.toBeInTheDocument());
}

describe("committed reward boundary", () => {
  beforeEach(() => {
    window.localStorage.removeItem(LIFE_STORAGE_KEY);
    window.localStorage.removeItem(REWARD_PREFERENCES_KEY);
    window.history.replaceState({}, "", "/today");
  });

  it("rewards only after a real typed commit and undo replaces it with neutral restoration", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    expect(document.querySelector("[data-reward-sequence='0']")).toBeInTheDocument();
    await typeCommand("Move deep work to 10 am");
    await waitFor(() => expect(document.querySelector("[data-reward-level='2'][data-reward-family='tide']")).toBeInTheDocument());
    const stored = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!) as { lastTransaction?: { transcript: string } };
    expect(stored.lastTransaction?.transcript).toBe("Move deep work to 10 am");
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    await waitFor(() => expect((window as typeof window & { __FLOW_REWARD__?: { plan?: { recipe: { family: string } } } }).__FLOW_REWARD__?.plan?.recipe.family).toBe("neutral"));
  });

  it("does not reward unsupported input or hydration and voice finals share the same boundary", async () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} />);
    await typeCommand("Invent a purple dimension");
    expect((window as typeof window & { __FLOW_REWARD__?: { sequence: number; active: boolean } }).__FLOW_REWARD__).toMatchObject({ sequence: 0, active: false });
    fireEvent.click(screen.getByRole("button", { name: /Start Flow Live/ }));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    (window as typeof window & { __FLOW_REWARD_EVENT_LOG__?: unknown[] }).__FLOW_REWARD_EVENT_LOG__ = [];
    await act(async () => adapter.emitFinal("Move deep work to 10 am", "voice-reward-boundary"));
    await waitFor(() => expect((window as typeof window & { __FLOW_REWARD__?: { event?: { type: string; source?: string } } }).__FLOW_REWARD__?.event).toMatchObject({ type: "transaction-committed", source: "voice" }));
    expect((window as typeof window & { __FLOW_REWARD_EVENT_LOG__?: Array<{ type: string; level: number; id: string }> }).__FLOW_REWARD_EVENT_LOG__).toEqual([
      expect.objectContaining({ type: "voice-understood", level: 1, id: expect.stringContaining("voice-reward-boundary") }),
      expect.objectContaining({ type: "transaction-committed", level: 2 }),
    ]);
  });

  it("persists explicit sensory preferences separately from life history", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
    fireEvent.click(screen.getByRole("radio", { name: "Reduced" }));
    fireEvent.click(screen.getByRole("button", { name: "Off" }));
    fireEvent.click(screen.getByRole("radio", { name: "Minimal" }));
    expect(JSON.parse(window.localStorage.getItem(REWARD_PREFERENCES_KEY)!)).toEqual({ motion: "reduced", sound: true, mascot: "minimal" });
    expect(window.localStorage.getItem(LIFE_STORAGE_KEY)).not.toContain("reward-preferences");
  });

  it("applies the in-app reduced preference to calendar events and Breathing Room", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
    fireEvent.click(screen.getByRole("radio", { name: "Reduced" }));
    await typeCommand("Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way");
    expect(screen.getByRole("region", { name: "Scrollable day timeline" })).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap,/ })).toHaveAttribute("data-motion-kind", "reduced");
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toHaveAttribute("data-wave-motion", "reduced");
    fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
    fireEvent.click(screen.getByRole("radio", { name: "Full" }));
    expect(screen.getByRole("region", { name: "Scrollable day timeline" })).toHaveAttribute("data-reduced-motion", "false");
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toHaveAttribute("data-wave-motion", "settled");
  });

  it("keeps sensory preferences open when the resting command dock expands", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    await typeCommand("Move deep work to 10 am");
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Flow command" })).toBeInTheDocument(), { timeout: 2_000 });
    fireEvent.click(screen.getByRole("button", { name: "Reward and motion settings" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Reduced" })).toBeInTheDocument());
    expect(screen.getByLabelText("Global Flow command")).toHaveAttribute("data-command-expanded", "true");
    await typeCommand("Make email 20 minutes");
    expect(screen.queryByRole("radio", { name: "Reduced" })).not.toBeInTheDocument();
  });

  it("coalesces a compound Calendar request into one persisted reward and one history entry", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    await typeCommand("Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way");
    const stored = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!) as { past: unknown[]; lastTransaction?: { transcript: string } };
    expect(stored.past).toHaveLength(1);
    expect(stored.lastTransaction?.transcript).toBe("Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way");
    const diagnostics = (window as typeof window & { __FLOW_REWARD__?: { sequence: number; event?: { type: string; facts?: unknown[] } } }).__FLOW_REWARD__;
    expect(diagnostics).toMatchObject({ sequence: 1, event: { type: "transaction-committed" } });
    expect(diagnostics?.event?.facts?.length).toBeGreaterThan(1);
  });

  it("keeps one transaction reward when a shared flight later opens its destination", async () => {
    window.history.replaceState({}, "", "/capture");
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    await typeCommand("Capture renew passport before Senegal");
    (window as typeof window & { __FLOW_REWARD_EVENT_LOG__?: unknown[] }).__FLOW_REWARD_EVENT_LOG__ = [];
    await typeCommand("Turn that into an outcome");
    await waitFor(() => expect(screen.getByTestId("plan-detail")).toBeInTheDocument(), { timeout: 2_000 });
    await waitFor(() => expect(document.querySelector("[data-transition-clone-count]")).not.toBeInTheDocument(), { timeout: 2_000 });
    expect((window as typeof window & { __FLOW_REWARD_EVENT_LOG__?: unknown[] }).__FLOW_REWARD_EVENT_LOG__).toEqual([
      expect.objectContaining({ type: "transaction-committed", level: 2 }),
    ]);
    const snapshot = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!);
    expect(snapshot.past).toHaveLength(2);
    expect(snapshot.document.captures[0].status).toBe("resolved");
  });

  it("compacts duplicate historical documents and rehydrates exact undo and redo state", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    await typeCommand("Move deep work to 10 am");
    const afterFirst = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!).document;
    await typeCommand("Make email 20 minutes");
    const afterSecond = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!).document;
    const stored = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!) as { past: Array<{ lastTransaction?: { before?: unknown; after?: unknown; calendarChange?: { before?: unknown; after?: unknown } } }>; lastTransaction?: { before?: unknown; after?: unknown; calendarChange?: { before?: unknown; after?: unknown } } };
    expect(stored.past[1]?.lastTransaction).not.toHaveProperty("before");
    expect(stored.past[1]?.lastTransaction).not.toHaveProperty("after");
    expect(stored.past[1]?.lastTransaction?.calendarChange).not.toHaveProperty("before");
    expect(stored.past[1]?.lastTransaction?.calendarChange).not.toHaveProperty("after");
    expect(stored.lastTransaction).not.toHaveProperty("before");
    expect(stored.lastTransaction).not.toHaveProperty("after");
    expect(stored.lastTransaction?.calendarChange).not.toHaveProperty("before");
    expect(stored.lastTransaction?.calendarChange).not.toHaveProperty("after");
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!).document).toEqual(afterFirst));
    fireEvent.click(screen.getByRole("button", { name: "Redo last change" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!).document).toEqual(afterSecond));
  });

  it("does not emit or enter history when a supported command needs clarification", async () => {
    render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    await typeCommand("Add a 30 minute review at 3 PM");
    await typeCommand("Add a 30 minute review at 8 PM");
    const before = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!) as { past: unknown[] };
    const sequence = (window as typeof window & { __FLOW_REWARD__?: { sequence: number } }).__FLOW_REWARD__?.sequence;
    await typeCommand("Move review to 4 PM");
    expect(screen.getByText("Which review do you mean?")).toBeInTheDocument();
    const after = JSON.parse(window.localStorage.getItem(LIFE_STORAGE_KEY)!) as { past: unknown[] };
    expect(after.past).toHaveLength(before.past.length);
    expect((window as typeof window & { __FLOW_REWARD__?: { sequence: number } }).__FLOW_REWARD__?.sequence).toBe(sequence);
  });
});
