import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { contextualCalendarFixture } from "../test/contextualCalendarFixture";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { allCalendarEvents } from "../domain/life-calendar-world";
import * as media from "../features/studio/mediaRepository";
import type { PromptSpeechAdapter } from "../features/voice/promptSpeech";
import { resolveGlobalCommand } from "../shared/command/globalInterpreter";

const now = () => new Date("2026-09-12T12:00:00");
const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
const feedback = () => document.querySelector("[data-flow-feedback]")!;
const events = () => allCalendarEvents(read().document);
function fixture(journal = false) {
  const snapshot = contextualCalendarFixture(); snapshot.temporal!.todayDateKey = "2026-09-12";
  if (journal) {
    snapshot.document.studio.journalEntries = [{ id: "saved-journal", kind: "journal-entry", title: "Saturday walk", text: "The street was quiet.", status: "saved", recordingState: "idle", recordingDurationMs: 65000, audioAssetId: "original-audio", photoAssetIds: [], bookmarks: [], markers: [], transcriptSegments: [], drawings: [], tags: [], createdAt: now().toISOString(), updatedAt: now().toISOString() }];
    snapshot.document.studio.mediaAssets.push({ id: "original-audio", kind: "journal-audio", name: "Original voice", mimeType: "audio/webm", size: 12, createdAt: now().toISOString() });
  }
  return snapshot;
}
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/today"); });
afterEach(() => vi.restoreAllMocks());
async function setup(mode: "typed" | "voice", snapshot = fixture(), promptSpeechAdapter?: PromptSpeechAdapter, clock = now) {
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
  const adapter = new FakeRecognitionAdapter(), view = render(<FlowEnvironmentApp now={clock} recognitionAdapter={adapter} promptSpeechAdapter={promptSpeechAdapter} />);
  await waitFor(() => expect(adapter.startCount).toBe(1)); let sequence = 0;
  async function command(text: string) {
    if (mode === "voice") act(() => adapter.emitFinal(text, `screenshot-${++sequence}`));
    else {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
    }
    await waitFor(() => { expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text); expect(feedback()).not.toHaveAttribute("data-feedback-phase", "understanding"); });
  }
  return { command, adapter, view };
}

for (const mode of ["typed", "voice"] as const) describe(`${mode} screenshot journeys through the real command field`, () => {
  it("curated-0618 preserves the explicit 11 AM conflict instead of substituting a morning slot", async () => {
    const snapshot = createFreshLifeSnapshot("2026-09-05");
    const text = "Add a 20-minute writing workshop to your schedule for 11:00 AM tomorrow";
    expect(snapshot.document.calendars["2026-09-06"]!.events).toContainEqual(expect.objectContaining({ title: "Review and respond to email", start: 660, end: 722 }));
    expect(resolveGlobalCommand(text, { route: "home" }, "2026-09-05").intent).toMatchObject({ type: "calendar", request: { actions: [{ type: "create", title: "writing workshop", durationMinutes: 20, destination: { type: "absolute", minutes: 660, date: { dateKey: "2026-09-06" } } }] } });
    window.history.replaceState({}, "", "/");
    const { command, adapter } = await setup(mode, snapshot, undefined, () => new Date("2026-09-05T12:00:00.000Z")), before = read();
    if (mode === "voice") {
      act(() => adapter.emitFinal("Flow", "curated-conflict-wake"));
      await waitFor(() => expect(screen.getByTestId("home-space")).not.toHaveAttribute("data-home-entrance", "wake-armed"));
    }
    await command(text);
    await waitFor(() => expect(feedback()).toHaveAttribute("data-feedback-phase", "error"));
    expect(feedback().textContent).toMatch(/11 AM/); expect(feedback().textContent).toMatch(/Review and respond to email/);
    expect(read()).toEqual(before); expect(read().past).toHaveLength(0);
  });
  it("commits adjacent dotted clocks in either named-slot order and rejects a contradictory clock", async () => {
    const { command } = await setup(mode);
    await command("Book a meeting called Dentist at9a.m. for Wednesday.");
    expect(events().find(({ title }) => title === "Dentist"), feedback().textContent ?? "").toMatchObject({ dateKey: "2026-09-16", start: 540, end: 570 });
    await command("Book a meeting on Tuesday called Gym at17p.m.");
    expect(events().find(({ title }) => title === "Gym"), feedback().textContent ?? "").toMatchObject({ dateKey: "2026-09-15", start: 1020, end: 1050 });
    expect(read().past).toHaveLength(2);
    const before = read(); await command("Book a meeting called Wrong clock at17a.m. for Wednesday");
    expect(read()).toEqual(before);
  });
  it("confirms only the visible Saturday dentist and restores the complete document with undo", async () => {
    const snapshot = fixture();
    for (const dateKey of ["2026-09-12", "2026-09-19"]) snapshot.document.calendars![dateKey] = {
      dateKey, deferred: [], breathingRooms: [], events: [{ id: `dentist-${dateKey}`, title: "Dentist appointment", dateKey, start: 540, end: 570, kind: "flexible", priority: "medium" }],
    };
    const { command } = await setup(mode, snapshot), before = read();
    await command("Remove Saturdays dentist appointment");
    expect(feedback()).toHaveAttribute("data-feedback-phase", "confirmation");
    expect(feedback().textContent).toMatch(/Dentist appointment/); expect(feedback().textContent).toMatch(/Sep 12|September 12/);
    expect(read().document).toEqual(before.document); expect(read().past).toEqual(before.past);
    await command("Confirm");
    expect(events().some(({ id }) => id === "dentist-2026-09-12")).toBe(false);
    expect(events().some(({ id }) => id === "dentist-2026-09-19")).toBe(true);
    expect(read().past).toHaveLength(1);
    await command("Undo"); expect(read().document).toEqual(before.document); expect(read().past).toHaveLength(0);
  });
  it("creates and reveals the next-week exact named appointment, one history entry, undo/redo and reload", async () => {
    const { command, view } = await setup(mode), before = read().document;
    await command("Book an8:00 a.m. meeting on Wednesday called Dentist");
    const dentist = events().find(({ title }) => title === "Dentist");
    expect(dentist).toMatchObject({ start: 480, end: 510, dateKey: "2026-09-16" });
    expect(read().temporal?.scope).toEqual({ kind: "week", dateKey: "2026-09-14", endDateKey: "2026-09-20" });
    await waitFor(() => expect(document.querySelector(`[data-week-event-id='${dentist!.id}']`)).toHaveAttribute("data-start", "480"));
    expect(read().past).toHaveLength(1); const after = read().document;
    await command("Undo"); expect(read().document).toEqual(before);
    await command("Redo"); expect(read().document).toEqual(after); expect(read().past).toHaveLength(1);
    view.unmount(); render(<FlowEnvironmentApp now={now} recognitionAdapter={new FakeRecognitionAdapter()} />);
    await waitFor(() => expect(document.querySelector(`[data-week-event-id='${dentist!.id}']`)).toBeInTheDocument());
    expect(read().document).toEqual(after);
  });
  it("retains the in-week view, rejects bad clocks and occupied exact clocks without a scope/history jump", async () => {
    const { command } = await setup(mode), originalScope = read().temporal!.scope;
    await command("Book a meeting called Dentist for today at 9am");
    expect(events().find(({ title }) => title === "Dentist"), feedback().textContent ?? "").toMatchObject({ dateKey: "2026-09-12", start: 540 }); expect(read().temporal!.scope).toEqual(originalScope);
    const before = read();
    for (const text of ["Book a meeting called Bad time for Wednesday at 17am", "Book a meeting called Truncated at 8:3 on Wednesday", "Book a meeting called Conflict on Wednesday at 12:30pm"]) {
      await command(text); expect(read().document).toEqual(before.document); expect(read().past).toEqual(before.past); expect(read().temporal!.scope).toEqual(originalScope);
    }
  });
  it("uses the revealed week for Saturday deletion and never silently removes an older week's event", async () => {
    const { command } = await setup(mode);
    const viewport = document.querySelector<HTMLElement>("[data-primary-content-rect]")!, scroll = vi.fn();
    Object.defineProperty(viewport, "scrollTo", { configurable: true, value: scroll });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.start === "1020" ? 900 : 100;
      return { top, bottom: this === viewport ? 600 : top + 30, left: 0, right: 800, width: 800, height: this === viewport ? 500 : 30, x: 0, y: top, toJSON: () => ({}) };
    });
    await command("Book a meeting called Dentist for today at 9am");
    const previous = events().find(({ title }) => title === "Dentist")!;
    await command("Book a meeting called Gym for Tuesday at17pm");
    expect(events().find(({ title }) => title === "Gym")).toMatchObject({ dateKey: "2026-09-15", start: 1020 });
    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 776, behavior: "smooth" })); scroll.mockClear();
    const before = read(); await command("Delete Saturdays dentist appointment");
    expect(feedback(), JSON.stringify({ feedback: feedback().textContent, scope: read().temporal?.scope, events: events(), trace: window.__FLOW_COMMAND_TRACE__ })).toHaveAttribute("data-feedback-phase", "clarification");
    expect(events().find(({ id }) => id === previous.id)).toBeDefined(); expect(read().past).toEqual(before.past);
    expect(scroll).not.toHaveBeenCalled();
  });
  it("asks for capture content in empty Friends, treats the answer as literal data, and creates exactly one history entry", async () => {
    const { command, adapter } = await setup(mode); await command("Open Friends"); const before = read();
    await command("Capture that"); expect(feedback()).toHaveTextContent("What should I capture?"); expect(read().document).toEqual(before.document);
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    const words = "I can come, actually cancel lunch please";
    await command(words); expect(read().document.captures.at(-1)?.title).toBe(words); expect(read().document.calendar).toEqual(before.document.calendar); expect(read().past).toHaveLength(before.past.length + 1);
    act(() => adapter.emitInterim("")); expect(feedback()).toHaveAttribute("data-feedback-phase", "completed");
  });
  it("revokes an unanswered capture on cancellation and navigation, preserving quoted pronouns", async () => {
    const { command } = await setup(mode); await command("Open Friends");
    await command("Capture that"); await command("Never mind"); await command("Some unrelated words"); expect(read().document.captures).toHaveLength(0);
    await command("Capture that"); await command("Home"); await command("More unrelated words"); expect(read().document.captures).toHaveLength(0);
    await command('Capture "that"'); expect(read().document.captures.at(-1)?.title.toLowerCase()).toBe("that");
  });
  it("plays, pauses, resumes, seeks and stops the actual Journal source without altering the recording or history", async () => {
    vi.spyOn(media, "getStudioMedia").mockResolvedValue(new Blob(["actual asset"])); vi.spyOn(media, "removeOrphanedStudioMedia").mockResolvedValue(undefined);
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:journal-test" }); Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => undefined });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("play")); return Promise.resolve(); });
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("pause")); });
    const { command } = await setup(mode, fixture(true)); await command("Open my journal");
    const audio = await screen.findByLabelText<HTMLAudioElement>("Original journal recording"); const before = read();
    expect(screen.getByText("0:00 position / 1:05 saved")).toBeInTheDocument();
    await command("Play the audio"); await waitFor(() => expect(play).toHaveBeenCalled());
    const pausesBefore = pause.mock.calls.length; await command("Pause"); await waitFor(() => expect(pause.mock.calls.length).toBeGreaterThan(pausesBefore));
    await command("Resume"); await command("Seek the audio to 30 seconds"); await waitFor(() => expect(audio.currentTime).toBe(30));
    fireEvent.timeUpdate(audio); expect(screen.getByText("0:30 position / 1:05 saved")).toBeInTheDocument();
    await command("Stop"); await waitFor(() => expect(audio.currentTime).toBe(0));
    expect(read().document).toEqual(before.document); expect(read().past).toEqual(before.past);
    play.mockRejectedValueOnce(new Error("Browser blocked playback")); await command("Listen to the recording"); await waitFor(() => expect(feedback()).toHaveAttribute("data-feedback-phase", "error"));
    expect(read().document).toEqual(before.document);
  });
});

it("never reveals a proposed date when CAS persistence fails", async () => {
  const { command } = await setup("typed"), before = read(), write = localStorage.setItem;
  vi.spyOn(localStorage, "setItem").mockImplementation((key, value) => { if (key === LIFE_STORAGE_KEY) throw new Error("Storage denied"); write.call(localStorage, key, value); });
  await command("Book Dentist for Wednesday at 8am"); expect(read()).toEqual(before);
  expect(document.querySelector("[data-week-date='2026-09-07']")).toBeInTheDocument(); expect(document.querySelector("[data-week-date='2026-09-16']")).not.toBeInTheDocument();
});

it("retains the exact heard command and result after the dock recedes, then shows new quiet interims compactly", async () => {
  const { command, adapter } = await setup("voice"); const text = "Book a meeting called Dentist for Wednesday at9am";
  await command(text); act(() => adapter.emitInterim(""));
  await waitFor(() => expect(screen.getByRole("button", { name: "Open Flow command" })).toBeInTheDocument(), { timeout: 2500 });
  const open = screen.getByRole("button", { name: "Open Flow command" }); expect(open).toHaveTextContent(text); expect(open).toHaveTextContent("Day reshaped");
  act(() => adapter.emitInterim("Move the dentist")); expect(open).toHaveTextContent("Move the dentist"); expect(document.querySelector("[data-command-expanded='true']")).toBeNull();
});

it("keeps its spoken question audible and visible through echo interims; overlapping yes cannot create a capture", async () => {
  let finish: (() => void) | undefined;
  const speech: PromptSpeechAdapter = { supported: true, speak: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })), cancel: vi.fn(() => finish?.()) };
  const { command, adapter } = await setup("voice", fixture(), speech); await command("Open Friends"); await command("Capture that");
  await waitFor(() => expect(speech.speak).toHaveBeenCalled()); const calls = vi.mocked(speech.cancel).mock.calls.length;
  act(() => adapter.emitInterim("What should I capture"));
  expect(speech.cancel).toHaveBeenCalledTimes(calls); expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Capture that"); expect(feedback()).toHaveTextContent("What should I capture?");
  act(() => adapter.emitFinal("yes", "overlap-yes")); await waitFor(() => expect(screen.getByText(/That answer overlapped playback/)).toBeInTheDocument());
  expect(read().document.captures).toHaveLength(0); expect(feedback()).toHaveTextContent("What should I capture?");
  await act(async () => finish?.());
  await command("Bring the camera on Saturday"); expect(read().document.captures.at(-1)?.title).toBe("Bring the camera on Saturday");
});
