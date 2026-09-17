import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { deliveryReceipts, localMessagingAdapter } from "../features/friends/messaging";
import type { PromptSpeechAdapter } from "../features/voice/promptSpeech";

const now = () => new Date("2026-09-12T12:00:00+02:00");
const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, "locks", { configurable: true, value: { request: async (_key: string, optionsOrTask: unknown, task?: () => Promise<unknown>) => typeof optionsOrTask === "function" ? optionsOrTask() : task!() } }); window.history.replaceState({}, "", "/people"); localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(createFreshLifeSnapshot("2026-09-12"))); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(mode: "typed" | "voice", promptSpeechAdapter?: PromptSpeechAdapter) {
  const adapter = new FakeRecognitionAdapter();
  const view = render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} promptSpeechAdapter={promptSpeechAdapter} />);
  await waitFor(() => expect(adapter.startCount).toBe(1));
  let sequence = 0;
  async function command(text: string) {
    if (mode === "voice") act(() => adapter.emitFinal(text, `friends-${++sequence}`));
    else {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const input = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
    }
    await waitFor(() => { expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text); expect(document.querySelector("[data-flow-feedback]")).not.toHaveAttribute("data-feedback-phase", "understanding"); });
  }
  return { command, adapter, view };
}
for (const mode of ["typed", "voice"] as const) describe(`Friends through ${mode} command dock`, () => {
  it("coordinates a changed meeting time and Tell him without duplicating the linked event", async () => {
    const { command } = await setup(mode);
    await command("Add friend John"); await command("Tell John I booked a meeting Thursday at ten"); await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
    await command("Open John"); await command("When are we meeting?"); const before = read(), id = before.document.calendars["2026-09-17"]!.events[0]!.id;
    await command("Tell John the meeting moved to eleven"); expect(read().past).toHaveLength(before.past.length); expect(document.body.textContent).toContain("11 AM");
    await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(2)); expect(read().past).toHaveLength(before.past.length + 1); expect(read().document.calendars["2026-09-17"]!.events).toMatchObject([{ id, start: 660 }]);
    await command("Open John"); await command("When are we meeting?"); await command("Tell him"); expect(read().document.friends!.messages.at(-1)?.body).toContain("11 AM"); expect(deliveryReceipts()).toHaveLength(2);
  });
  it("keeps person and selected meeting identity across open, meeting query, move, and pronoun message", async () => {
    const { command } = await setup(mode);
    await command("Add friend John"); await command("Tell John I booked a meeting Thursday at ten"); await command("yes");
    await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
    const eventId = read().document.calendars["2026-09-17"]!.events[0]!.id, personId = read().document.people[0]!.id;
    await command("Open John"); await command("When are we meeting?");
    expect(document.querySelector("[data-flow-feedback]")).toHaveTextContent("Thursday");
    await command("Move it to Friday");
    await waitFor(() => expect(read().document.calendars["2026-09-18"]?.events.some(({ id }) => id === eventId)).toBe(true));
    await command("Tell him we'll meet on Friday");
    expect(read().document.friends?.messages.at(-1)).toMatchObject({ recipient: { id: personId }, body: "we'll meet on Friday" });
    expect(deliveryReceipts()).toHaveLength(1);
  });
  it("refines warmth and emphasis without changing names, dates, times, or facts", async () => {
    const { command } = await setup(mode);
    await command("Add friend Sarah"); await command("Text Sarah I'll be there Friday at six!");
    await command("Make it warmer");
    expect(read().document.friends?.messages.at(-1)?.body).toBe("Hi Sarah, I'll be there Friday at six!");
    await command("Less dramatic");
    expect(read().document.friends?.messages.at(-1)?.body).toBe("Hi Sarah, I'll be there Friday at six.");
    expect(deliveryReceipts()).toHaveLength(0);
  });
  it("confirms an unquoted booking and message as one calendar transaction, with persistent participant identity", async () => {
    const { command } = await setup(mode);
    await command("Add friend John");
    const before = read();
    await command("Tell John I booked a meeting Thursday at ten");
    expect(document.querySelector("[data-flow-feedback]")).toHaveTextContent("Book this and deliver");
    expect(read().past).toHaveLength(before.past.length); expect(deliveryReceipts()).toHaveLength(0);
    await command("yes");
    await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
    expect(read().past).toHaveLength(before.past.length + 1);
    expect(read().document.calendars["2026-09-17"]?.events[0]).toMatchObject({ start: 600, participantIds: [before.document.people[0]!.id] });
    expect(deliveryReceipts()[0]?.message.calendarEventId).toBe(read().document.calendars["2026-09-17"]?.events[0]?.id);
  });
  it("refines an occupied Thursday booking to Friday without moving the protected event", async () => {
    const initial = read(); initial.document.calendars["2026-09-17"] = { dateKey: "2026-09-17", events: [{ id: "friends-fixture-dentist", title: "Dentist", dateKey: "2026-09-17", start: 600, end: 660, kind: "fixed", priority: "high" }], deferred: [] }; localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(initial));
    const { command } = await setup(mode);
    await command("Add friend John"); await command("Tell John I booked a meeting Thursday at ten");
    expect(document.querySelector("[data-flow-feedback]")).toHaveTextContent("Dentist already occupies");
    await command("Actually Friday");
    expect(document.querySelector("[data-flow-feedback]")).toHaveTextContent("Friday, Sep 18");
    await command("yes"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
    expect(read().document.calendars["2026-09-17"]?.events[0]).toMatchObject({ id: "friends-fixture-dentist", start: 600, end: 660 });
    expect(read().document.calendars["2026-09-18"]?.events[0]).toMatchObject({ start: 600 });
    expect(deliveryReceipts()[0]?.message.body).toContain("Friday");
  });
  it("preserves correction words, quotes and body punctuation through the mounted pipeline", async () => {
    const { command } = await setup(mode);
    await command("Add friend Sarah");
    const before = read().document.calendars;
    for (const [text, body] of [
      ["Text Sarah that I can come, actually cancel lunch", "I can come, actually cancel lunch"],
      ["Text Sarah please call me, sorry delete the meeting", "please call me, sorry delete the meeting"],
      ["Text Sarah that call me please", "call me please"],
      ['Text Sarah "Call at 10:00"', "Call at 10:00"],
      ['Text Sarah "I said that we should go"', "I said that we should go"],
      ["Text Sarah hello, are you free?", "hello, are you free?"],
      ['Tell Sarah "I booked a meeting Thursday at ten"', "I booked a meeting Thursday at ten"],
      ["Tell Sarah I have not booked a meeting Thursday at ten", "I have not booked a meeting Thursday at ten"],
    ]) {
      await command(text!); expect(read().document.friends?.messages.at(-1)?.body).toBe(body);
      expect(read().document.calendars).toEqual(before); expect(deliveryReceipts()).toHaveLength(0);
    }
    await command("Add 'are you free this weekend?'");
    expect(read().document.friends?.messages.at(-1)?.body).toBe("I have not booked a meeting Thursday at ten are you free this weekend?");
  });
  it("adds a real person, refines literal message, delivers latest draft once, preserves receipt through undo", async () => {
    const { command } = await setup(mode);
    await command("Add friend Sarah Miller");
    expect(read().document.people).toHaveLength(1);
    const id = read().document.people[0]!.id;
    await command("Text Sarah I'll be there at six");
    expect(read().document.friends?.messages[0]).toMatchObject({ recipient: { id }, body: "I'll be there at six", revision: 1 });
    expect(deliveryReceipts()).toHaveLength(0);
    await command("Add See you soon");
    expect(read().document.friends?.messages[0]?.body).toBe("I'll be there at six See you soon");
    await command("Send it");
    await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
    expect(deliveryReceipts()[0]?.message.body).toBe("I'll be there at six See you soon");
    await command("yes"); expect(deliveryReceipts()).toHaveLength(1);
    await command("Undo"); expect(deliveryReceipts()).toHaveLength(1);
  });
  it("binds an ambiguous recipient choice and retires send authority after cancellation", async () => {
    const { command } = await setup(mode);
    await command("Add friend Sarah Miller"); await command("Add friend Sarah Jones");
    await command("Text Sarah: cancel the meeting and go home");
    expect(read().document.friends?.messages).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Sarah Miller" })).toBeInTheDocument();
    await command("the second one");
    expect(read().document.friends?.messages[0]?.recipient.id).toBe(read().document.people[1]!.id);
    expect(read().document.friends?.messages[0]?.body).toBe("cancel the meeting and go home");
    await command("Never mind"); await command("yes");
    expect(deliveryReceipts()).toHaveLength(0);
  });
});

class ControlledPromptSpeech implements PromptSpeechAdapter {
  supported = true;
  spoken: string[] = [];
  finish?: () => void;
  speak(text: string) { this.spoken.push(text); return new Promise<void>((resolve) => { this.finish = resolve; }); }
  cancel() { this.finish?.(); this.finish = undefined; }
}
describe("spoken Friends continuations through the mounted final-transcript seam", () => {
  it("keeps the Calendar commit when delivery fails and retries only the exact message", async () => {
    const { command } = await setup("voice"); await command("Add friend John"); await command("Tell John I booked a meeting Thursday at ten");
    vi.spyOn(localMessagingAdapter, "deliver").mockRejectedValueOnce(new Error("Local delivery unavailable"));
    await command("yes"); await waitFor(() => expect(document.body.textContent).toContain("Calendar saved; message was not delivered"));
    const saved = read(); expect(saved.document.calendars["2026-09-17"]?.events).toHaveLength(1); expect(deliveryReceipts()).toHaveLength(0);
    await command("Retry"); await waitFor(() => expect(deliveryReceipts()).toHaveLength(1)); expect(read().document.calendar).toEqual(saved.document.calendar); expect(read().document.calendars).toEqual(saved.document.calendars); expect(read().past).toHaveLength(saved.past.length);
  });
  it("reads the same draft again for each separate spoken request", async () => {
    const speech = new ControlledPromptSpeech(); const { command } = await setup("voice", speech);
    await command("Add friend Sarah"); await command("Text Sarah that see you Friday"); await act(async () => speech.finish?.());
    await command("Read it"); await act(async () => speech.finish?.()); const first = speech.spoken.length;
    await command("Read it"); await waitFor(() => expect(speech.spoken).toHaveLength(first + 1)); expect(speech.spoken.at(-1)).toContain("see you Friday");
  });
  it("speaks recipient choices, accepts the full name after playback, then allows a body refinement to interrupt the next prompt", async () => {
    const speech = new ControlledPromptSpeech();
    const { command, adapter } = await setup("voice", speech);
    await command("Add friend Sarah Miller"); await command("Add friend Sarah Jones");
    await command("Text Sarah I'll be there at six");
    await waitFor(() => expect(speech.spoken.at(-1)).toContain("Which person"));
    await act(async () => speech.finish?.());
    await command("Sarah Miller");
    expect(read().document.friends?.messages[0]?.recipient.id).toBe(read().document.people[0]!.id);
    await waitFor(() => expect(speech.spoken.at(-1)).toContain("Message to Sarah Miller"));
    act(() => adapter.emitInterim("Add are you free this weekend"));
    await command("Add 'are you free this weekend?'");
    expect(read().document.friends?.messages[0]?.body).toBe("I'll be there at six are you free this weekend?");
  });
  it("speaks a reask and keeps the exact draft when yes overlaps its prompt", async () => {
    const speech = new ControlledPromptSpeech();
    const { command, adapter } = await setup("voice", speech);
    await command("Add friend Sarah"); await command("Text Sarah I'll be there at six");
    await waitFor(() => expect(speech.spoken.at(-1)).toContain("Message to Sarah"));
    await act(async () => adapter.emitFinal("yes", "overlapping-yes"));
    expect(deliveryReceipts()).toHaveLength(0);
    expect(speech.spoken.at(-1)).toContain("repeat your choice");
    await act(async () => speech.finish?.());
    await command("yes");
    await waitFor(() => expect(deliveryReceipts()).toHaveLength(1));
  });
});
