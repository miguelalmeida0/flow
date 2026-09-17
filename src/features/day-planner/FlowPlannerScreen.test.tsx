import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlowPlannerScreen } from "./FlowPlannerScreen";
import { createInitialPlan } from "./seed";
import { localDateKey } from "./time";
import { FakeRecognitionAdapter } from "./voice/fakeRecognition";
import { CurrentTimeMarker } from "./CurrentTimeMarker";

const motionPreference = vi.hoisted(() => ({ reduced: true }));

vi.mock("motion/react", async (importOriginal) => {
  const original = await importOriginal();
  return { ...(original as Record<string, unknown>), useReducedMotion: () => motionPreference.reduced };
});

function command(text: string) {
  if (!screen.queryByRole("textbox", { name: "Tell Flow what to change" })) {
    fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
  }
  const input = screen.getByRole("textbox", { name: "Tell Flow what to change" });
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}

function pointer(target: Element, type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture", clientY: number, pointerId: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });
  fireEvent(target, event);
}

function persistPlanAtTwo({ withoutWorkout = false } = {}) {
  const dateKey = localDateKey();
  const plan = createInitialPlan(dateKey);
  plan.events = plan.events
    .filter((event) => !withoutWorkout || event.id !== "workout")
    .map((event) => event.id === "roadmap" ? { ...event, start: 14 * 60, end: 15 * 60 } : event);
  localStorage.setItem("flow.planner.v3", JSON.stringify({ version: 3, plan, past: [], future: [] }));
}

describe("FlowPlannerScreen", () => {
  beforeEach(() => {
    motionPreference.reduced = true;
    localStorage.clear();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string): MediaQueryList => ({
        matches: motionPreference.reduced, media: query, onchange: null,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        addListener: () => undefined, removeListener: () => undefined,
        dispatchEvent: () => true,
      }),
    });
  });

  it("runs ordinary typed commands through one controller and preserves the transcript", () => {
    render(<FlowPlannerScreen />);
    command("Move my workout to 6");
    expect(screen.getByRole("button", { name: /Workout, 6 PM–7 PM/ })).toBeInTheDocument();
    expect(screen.getByText("Tide is reshaping the day")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Move my workout to 6");

    command("Make email 20 minutes");
    expect(screen.getByRole("button", { name: /Review and respond to email, 11 AM–11:20 AM/ })).toBeInTheDocument();

    command("Move the roadmap to tomorrow morning");
    expect(screen.getByText("1 planned for later")).toBeInTheDocument();
    expect(screen.getAllByText("Planning — Q3 roadmap").length).toBeGreaterThan(0);
  });

  it("keeps a time-only source addressable after a neighboring anchor moves", async () => {
    render(<FlowPlannerScreen />);
    command("Move interview to 5");
    expect(screen.getByText("Move anchored Interview?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move anyway" }));
    expect(screen.getByRole("button", { name: /Interview, 5 PM–6 PM/ })).toBeInTheDocument();

    command("Move the 2 PM to 4");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 4 PM–5 PM/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Day reshaped").closest("[data-flow-feedback]"))
      .toHaveAttribute("data-feedback-transcript", "Move the 2 PM to 4"), { timeout: 2500 });
  });

  it("undoes and redoes the exact schedule", () => {
    render(<FlowPlannerScreen />);
    command("Move my workout to 6");
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Workout, 5:30 PM–6:30 PM/ })).toHaveAttribute("data-transaction-kind", "move");
    fireEvent.click(screen.getByRole("button", { name: "Redo last change" }));
    expect(screen.getByRole("button", { name: /Workout, 6 PM–7 PM/ })).toHaveAttribute("data-transaction-kind", "move");
  });

  it("restores change metadata together with undo and redo", () => {
    render(<FlowPlannerScreen />);
    command("Move my workout to 6");
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    command("What changed?");
    expect(screen.getByText("No changes yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Redo last change" }));
    command("What changed?");
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.getAllByText(/Workout → 6 PM/).length).toBeGreaterThan(0);
  });

  it("shows exact natural-source geometry when asked what changed", () => {
    persistPlanAtTwo();
    render(<FlowPlannerScreen />);
    command("Move the 2 PM meeting to three");
    command("What changed?");
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap, 3 PM–4 PM/ });
    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(roadmap).toHaveAttribute("data-transaction-kind", "move");
    expect(document.querySelector('[data-origin-id="roadmap"]')).not.toBeInTheDocument();
  });

  it("keeps the timeline vertically scrollable without a forced-width mobile canvas", () => {
    render(<FlowPlannerScreen />);
    const scroller = screen.getByRole("region", { name: "Scrollable day timeline" });
    expect(scroller).toHaveClass("min-w-0", "overflow-y-auto", "overflow-x-hidden");
    expect(scroller.firstElementChild).toHaveClass("min-w-0");
  });

  it("keeps the command surface quiet until typing or voice is requested", () => {
    render(<FlowPlannerScreen />);
    expect(screen.queryByRole("textbox", { name: "Tell Flow what to change" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    expect(screen.getByRole("textbox", { name: "Tell Flow what to change" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide Flow command" }));
    expect(screen.queryByRole("textbox", { name: "Tell Flow what to change" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start voice command" })).toBeInTheDocument();
  });

  it("provides complete static equivalents when reduced motion is requested", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    expect(screen.getByRole("button", { name: "Start voice command" })).toHaveAttribute("data-reduced-motion", "true");
    expect(screen.getByRole("region", { name: "Scrollable day timeline" })).toHaveAttribute("data-reduced-motion", "true");
    command("Give me 20 minutes before the interview and move anything flexible out of the way");
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toHaveAttribute("data-wave-motion", "reduced");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap/ })).toHaveAttribute("data-motion-kind", "reduced");
  });

  it("clarifies an ambiguous title and resumes the original request", () => {
    const dateKey = localDateKey();
    const plan = createInitialPlan(dateKey);
    plan.events = [
      ...plan.events.filter((event) => event.id !== "workout"),
      { id: "product-meeting", title: "Product meeting", dateKey, start: 600, end: 630, kind: "flexible", priority: "medium" },
      { id: "hiring-meeting", title: "Hiring meeting", dateKey, start: 900, end: 930, kind: "flexible", priority: "medium" },
    ];
    localStorage.setItem("flow.planner.v3", JSON.stringify({ version: 3, plan, past: [], future: [] }));
    render(<FlowPlannerScreen />);
    command("Move the meeting to 8:30 am");
    expect(screen.getByText("Which meeting do you mean?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Product meeting — 10 AM/ }));
    expect(screen.getByRole("button", { name: /Product meeting, 8:30 AM–9 AM/ })).toBeInTheDocument();
  });

  it("previews destructive changes, supports cancel, confirms, then undoes", async () => {
    render(<FlowPlannerScreen />);
    command("Cancel the dentist appointment");
    expect(screen.getByText("Remove Dentist appointment?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dentist appointment/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /Dentist appointment/ })).toBeInTheDocument();
    command("Cancel the dentist appointment");
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Dentist appointment/ })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Dentist appointment/ })).toBeInTheDocument();
  });

  it("executes a final fake voice transcript exactly once and never executes interim text", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitInterim("Move my workout"));
    expect(screen.getByRole("button", { name: /Workout, 5:30 PM–6:30 PM/ })).toBeInTheDocument();
    act(() => adapter.emitFinal("Move my workout to 6"));
    expect(screen.getByRole("button", { name: /Workout, 6 PM–7 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Move my workout to 6");
    expect(screen.getAllByText(/Workout → 6 PM/)).toHaveLength(1);
  });

  it("routes a compound final voice transcript through the typed command pipeline", () => {
    const adapter = new FakeRecognitionAdapter();
    const transcript = "Fit a 40 minute workout before dinner and don't move lunch";
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal(transcript));
    expect(screen.getByRole("textbox")).toHaveValue(transcript);
    expect(screen.getByText(`“${transcript}”`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 6:20 PM–7 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ })).toBeInTheDocument();
  });

  it("shows meaningful microphone errors without mutating the calendar", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitError("permission-denied"));
    expect(screen.getByText("Microphone access is blocked.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 5:30 PM–6:30 PM/ })).toBeInTheDocument();
  });

  it("configures English recognition, supplies live titles, and semantically reranks alternatives", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: /Interview, 4 PM–5 PM/ }));
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    expect(adapter.lastOptions?.locale).toBe("en-US");
    expect(adapter.lastOptions?.contextPhrases.map((item) => item.phrase)).toEqual(expect.arrayContaining([
      "move", "important", "Breathing Room", "Interview", "Dentist appointment", "Planning — Q3 roadmap",
    ]));
    expect(adapter.lastOptions?.contextPhrases.find((item) => item.phrase === "Interview")?.boost).toBe(5);
    act(() => adapter.emitFinal([
      { transcript: "movimento vio", confidence: 0.96 },
      { transcript: "move interview", confidence: 0.82 },
      { transcript: "move interview to six", confidence: 0.51 },
    ]));
    expect(screen.getByRole("textbox")).toHaveValue("move interview to six");
    expect(screen.getByText("Move anchored Interview?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Interview, 4 PM–5 PM/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move anyway" }));
    expect(screen.getByRole("button", { name: /Interview, 6 PM–7 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 8 PM–9 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dinner, 7 PM–8 PM/ })).toBeInTheDocument();
  });

  it("does not route unusable speech into the calendar pipeline", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal([{ transcript: "movimento vio", confidence: 0.94 }]));
    expect(screen.getByRole("textbox")).toHaveValue("movimento vio");
    expect(screen.getByText("Didn't catch that")).toBeInTheDocument();
    expect(screen.getByText("I didn't catch that clearly.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Interview, 4 PM–5 PM/ })).toBeInTheDocument();
  });

  it("honors an explicit supported English locale", () => {
    const adapter = new FakeRecognitionAdapter("en-GB");
    render(<FlowPlannerScreen recognitionAdapter={adapter} voiceLocale="en-GB" />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    expect(adapter.lastOptions?.locale).toBe("en-GB");
  });

  it("finalizes an in-flight voice command against the latest typed plan and history", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));

    command("Add a 30 minute sync at 3");
    expect(screen.getByRole("button", { name: /Sync, 3 PM–3:30 PM/ })).toBeInTheDocument();

    act(() => adapter.emitFinal([
      { transcript: "movement sink", confidence: 0.94 },
      { transcript: "move sync to six", confidence: 0.42 },
    ]));
    expect(screen.getByRole("button", { name: /Sync, 6 PM–6:30 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 8 PM–9 PM/ })).toBeInTheDocument();
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(9);

    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Sync, 3 PM–3:30 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 5:30 PM–6:30 PM/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.queryByRole("button", { name: /Sync,/ })).not.toBeInTheDocument();
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(8);
  });

  it("keeps the destructive transcript when confirmation is clicked", () => {
    render(<FlowPlannerScreen />);
    command("Cancel the dentist appointment");
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(screen.getByRole("textbox")).toHaveValue("Cancel the dentist appointment");
    expect(screen.getAllByText("“Cancel the dentist appointment”").length).toBeGreaterThan(0);
  });

  it("uses a selected event reference through the real controller", () => {
    render(<FlowPlannerScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Workout, 5:30 PM–6:30 PM/ }));
    command("Shorten the selected event by 15 minutes");
    expect(screen.getByRole("button", { name: /Workout, 5:30 PM–6:15 PM/ })).toBeInTheDocument();
  });

  it("reloads the persisted plan and history", () => {
    const first = render(<FlowPlannerScreen />);
    command("Move my workout to 6");
    first.unmount();
    render(<FlowPlannerScreen />);
    expect(screen.getByRole("button", { name: /Workout, 6 PM–7 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeEnabled();
  });

  it("moves the screenshot meeting alias atomically, persists it, and undoes exactly once", () => {
    const first = render(<FlowPlannerScreen />);
    const transcript = "move my deep work meeting to 3:00 p.m.";
    command(transcript);
    expect(screen.getByRole("textbox")).toHaveValue(transcript);
    expect(screen.getByText(`“${transcript}”`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deep work — project brief, 3 PM–4 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Interview, 4 PM–5 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dinner, 7 PM–8 PM/ })).toBeInTheDocument();
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(8);

    first.unmount();
    render(<FlowPlannerScreen />);
    expect(screen.getByRole("button", { name: /Deep work — project brief, 3 PM–4 PM/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("routes the exact final voice alias through the same atomic command path", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    const transcript = "move my deep work meeting to 3:00 p.m.";
    act(() => adapter.emitFinal([
      { transcript: "movement my deep words", confidence: 0.97 },
      { transcript, confidence: 0.34 },
    ]));
    expect(screen.getByRole("textbox")).toHaveValue(transcript);
    expect(screen.queryByText("Didn't catch that")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deep work — project brief, 3 PM–4 PM/ })).toBeInTheDocument();
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("routes a well-formed missing voice reference to precise planner feedback", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal([
      { transcript: "movimento vio", confidence: 0.97 },
      { transcript: "move quarterly meeting to three", confidence: 0.34 },
    ]));
    expect(screen.getByRole("textbox")).toHaveValue("move quarterly meeting to three");
    expect(screen.getByText("Event not found")).toBeInTheDocument();
    expect(screen.getByText("I could not find “quarterly meeting” on today’s calendar.")).toBeInTheDocument();
    expect(screen.queryByText("Didn't catch that")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("clarifies the screenshot request, applies one safe choice, and undoes it as one operation", () => {
    persistPlanAtTwo({ withoutWorkout: true });
    render(<FlowPlannerScreen />);
    const transcript = "change my 2:00 p.m. meeting to another time";
    command(transcript);

    expect(screen.getByRole("textbox")).toHaveValue(transcript);
    expect(screen.getByText("When should I move Planning — Q3 roadmap?")).toBeInTheDocument();
    expect(screen.getByText(`“${transcript}”`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
    const choices = screen.getAllByRole("button").filter((button) => !button.hasAttribute("data-event-id") && /(?:AM|PM)–.*(?:AM|PM)$/.test(button.textContent ?? ""));
    expect(choices).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Never mind" })).toBeInTheDocument();

    fireEvent.click(choices[0]!);
    expect(screen.getByText("Tide is reshaping the day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();
  });

  it("cancels destination clarification without schedule or history mutation", () => {
    persistPlanAtTwo({ withoutWorkout: true });
    render(<FlowPlannerScreen />);
    command("change my 2 pm meeting to another time");
    fireEvent.click(screen.getByRole("button", { name: "Never mind" }));
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("accepts a concise typed time follow-up without creating history for a no-op", () => {
    persistPlanAtTwo({ withoutWorkout: true });
    render(<FlowPlannerScreen />);
    command("change my 2 pm meeting to another time");
    command("2 pm");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();

    command("change my 2 pm meeting to another time");
    command("3 pm");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 3 PM–4 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeEnabled();
  });

  it("routes the exact final voice transcript to the same focused clarification", () => {
    persistPlanAtTwo({ withoutWorkout: true });
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    const transcript = "change my 2:00 p.m. meeting to another time";
    act(() => adapter.emitFinal([
      { transcript: "change my 2:00 p.m. meeting", confidence: 0.94 },
      { transcript, confidence: 0.52 },
    ]));
    expect(screen.getByRole("textbox")).toHaveValue(transcript);
    expect(screen.getByText("When should I move Planning — Q3 roadmap?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal([{ transcript: "3 PM", confidence: 0.73 }]));
    expect(screen.getByRole("textbox")).toHaveValue("3 PM");
    expect(screen.queryByText("Didn't catch that")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 3 PM–4 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();
  });

  it("supports an unresolved move through the selected-event reference", () => {
    persistPlanAtTwo();
    render(<FlowPlannerScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ }));
    command("change this to another time");
    expect(screen.getByText("When should I move Planning — Q3 roadmap?")).toBeInTheDocument();
  });

  it("runs the Tide signature through the real command field as one exact undo step", () => {
    render(<FlowPlannerScreen />);
    const transcript = "Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way";
    command(transcript);
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ });
    expect(roadmap).toHaveAttribute("data-color", "red");
    expect(roadmap).toHaveAttribute("data-importance", "important");
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue(transcript);

    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.queryByLabelText("Breathing room, 20 minutes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toHaveAttribute("data-color", "neutral");
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("routes the exact signature final transcript through the same voice boundary", () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    const transcript = "Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way";
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal(transcript));
    expect(screen.getByRole("textbox")).toHaveValue(transcript);
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toHaveAttribute("data-color", "red");
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toBeInTheDocument();
  });

  it("keeps the voice source when a voice-created preview is committed", async () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal("What if I add a 30 minute walk at five?"));
    expect(screen.getByText("Preview — nothing committed")).toBeInTheDocument();
    command("Do it");
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}") as { lastChange?: { source?: string } };
      expect(persisted.lastChange?.source).toBe("voice");
    });
  });

  it("persists generated Tide moves inside the same history record", async () => {
    render(<FlowPlannerScreen />);
    command("Add a twenty minute buffer at two");
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}") as { lastChange?: { actions?: Array<Record<string, unknown>> } };
      expect(persisted.lastChange?.actions).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "move", origin: "tide", selector: { type: "id", id: "roadmap" } }),
      ]));
    });
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2:20 PM–3:20 PM/ })).toBeInTheDocument();
  });

  it("recedes after a successful result but stays open for actionable errors", async () => {
    render(<FlowPlannerScreen />);
    command("Make roadmap red");
    expect(screen.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue("Make roadmap red");
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Tell Flow what to change" })).not.toBeInTheDocument(), { timeout: 2_500 });
    expect(screen.getByRole("button", { name: "Open Flow command" })).toBeInTheDocument();

    command("Teleport the universe");
    expect(screen.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue("Teleport the universe");
    await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    expect(screen.getByRole("textbox", { name: "Tell Flow what to change" })).toBeInTheDocument();
  });

  it("previews without history, adjusts, commits, and undoes the exact preview", () => {
    render(<FlowPlannerScreen />);
    command("What if I add a 30 minute walk at five?");
    expect(screen.getByText("Preview — nothing committed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Walk, 5 PM–5:30 PM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();

    command("Try six instead");
    expect(screen.getByRole("button", { name: /Walk, 6 PM–6:30 PM/ })).toBeInTheDocument();
    command("Do it");
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.queryByRole("button", { name: /Walk,/ })).not.toBeInTheDocument();
  });

  it("uses quick actions, Arrow focus, Space status, and keyboard move through shared dispatch", () => {
    render(<FlowPlannerScreen now={() => new Date("2026-09-02T14:10:00")} />);
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ });
    fireEvent.click(roadmap);
    fireEvent.click(screen.getByRole("button", { name: "Complete" }));
    expect(screen.getByLabelText("Planning — Q3 roadmap completed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));

    const restored = screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ });
    fireEvent.keyDown(restored, { key: "ArrowDown", shiftKey: true });
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2:15 PM–3:15 PM/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeInTheDocument();

    const email = screen.getByRole("button", { name: /Review and respond to email/ });
    email.focus();
    fireEvent.keyDown(email, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /Lunch/ })).toHaveFocus();

    const roadmapAgain = screen.getByRole("button", { name: /Planning — Q3 roadmap/ });
    fireEvent.keyDown(roadmapAgain, { key: " " });
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap/ })).toHaveAttribute("data-status", "active");
    fireEvent.keyDown(screen.getByRole("button", { name: /Planning — Q3 roadmap/ }), { key: " " });
    expect(screen.getByLabelText("Planning — Q3 roadmap completed")).toBeInTheDocument();
    command("Reopen roadmap");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap/ })).toHaveAttribute("data-status", "planned");
  });

  it("announces independent scheduling properties and live direct-manipulation values", () => {
    render(<FlowPlannerScreen />);
    command("Make roadmap important and red, make it fluid, and protect it");
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM, important importance, fluid mobility, protected, planned, red/ });
    expect(roadmap).toHaveAttribute("data-kind", "flexible");
    expect(roadmap).toHaveAttribute("data-protected", "true");

    command("Unprotect roadmap");
    const draggable = screen.getByRole("button", { name: /Planning — Q3 roadmap/ });
    pointer(draggable, "pointerdown", 100, 1);
    pointer(draggable, "pointermove", 120, 1);
    expect(screen.getByText("Moving to 2:20 PM")).toBeInTheDocument();
    pointer(draggable, "pointerup", 120, 1);
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2:20 PM–3:20 PM/ })).toBeInTheDocument();

    const moved = screen.getByRole("button", { name: /Planning — Q3 roadmap/ });
    fireEvent.click(moved);
    const handle = moved.parentElement?.querySelector<HTMLButtonElement>('button[title="Resize event"]');
    expect(handle).toBeTruthy();
    pointer(handle!, "pointerdown", 100, 2);
    pointer(handle!, "pointermove", 115, 2);
    expect(screen.getByText("75 minutes")).toBeInTheDocument();
    pointer(handle!, "pointerup", 115, 2);
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2:20 PM–3:35 PM/ })).toBeInTheDocument();
  });

  it("routes protected and anchored drags to focused confirmation without premature mutation", () => {
    render(<FlowPlannerScreen />);
    const lunch = screen.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ });
    const resizeHandle = lunch.parentElement!.querySelector<HTMLButtonElement>('button[title="Resize event"]')!;
    expect(resizeHandle).toHaveClass("size-11", "right-2", "-bottom-7", "pointer-events-none", "opacity-0");
    expect(resizeHandle).not.toHaveClass("left-1/2", "-translate-x-1/2");
    pointer(lunch, "pointerdown", 100, 1);
    const initialTop = lunch.parentElement?.style.top;
    pointer(lunch, "pointermove", 120, 1);
    expect(screen.getByText("Protected — release to request 12:50 PM")).toBeInTheDocument();
    expect(lunch).toHaveAttribute("data-interaction-state", "dragging");
    expect(lunch.parentElement?.style.top).toBe(initialTop);
    pointer(lunch, "pointerup", 120, 1);
    expect(screen.getByText("Move anchored Lunch?")).toBeInTheDocument();
    expect(screen.getByText(/Lunch is fixed or protected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    const interview = screen.getByRole("button", { name: /Interview, 4 PM–5 PM/ });
    pointer(interview, "pointerdown", 100, 2);
    pointer(interview, "pointermove", 120, 2);
    expect(screen.getByText("Anchored — release to request 4:20 PM")).toBeInTheDocument();
    pointer(interview, "pointerup", 120, 2);
    expect(screen.getByText("Move anchored Interview?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Interview, 4 PM–5 PM/ })).toBeInTheDocument();
  });

  it("batch edits matching colors without requiring selection", () => {
    render(<FlowPlannerScreen />);
    command("Make roadmap red");
    command("Make email red");
    command("Make every red task blue");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap/ })).toHaveAttribute("data-color", "blue");
    expect(screen.getByRole("button", { name: /Review and respond to email/ })).toHaveAttribute("data-color", "blue");
  });

  it("blocks unsafe Space starts with local feedback and never creates two active events", () => {
    render(<FlowPlannerScreen now={() => new Date("2026-09-02T09:15:00")} />);
    const dinner = screen.getByRole("button", { name: /Dinner, 7 PM–8 PM/ });
    dinner.focus();
    fireEvent.keyDown(dinner, { key: " " });
    expect(screen.getByText("Dinner is not current")).toBeInTheDocument();
    expect(dinner).toHaveAttribute("data-status", "planned");
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
    const callout = screen.getByText("Dinner is not current").closest("section");
    expect(callout?.style.top).not.toBe("");
  });

  it("keeps live resize previews pure, reflows neighbors, and cancels cleanly", () => {
    const dateKey = localDateKey();
    const plan = createInitialPlan(dateKey);
    plan.events = plan.events.map((event) => event.id === "workout" ? { ...event, start: 15 * 60, end: 16 * 60 } : event);
    plan.breathingRooms = [{ id: "quiet", dateKey, start: 10 * 60 + 30, end: 10 * 60 + 45, protected: true, source: "user", label: "Quiet" }];
    localStorage.setItem("flow.planner.v4", JSON.stringify({ version: 4, plan, past: [], future: [] }));
    render(<FlowPlannerScreen />);
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ });
    fireEvent.click(roadmap);
    const handle = roadmap.parentElement!.querySelector<HTMLButtonElement>('button[title="Resize event"]')!;
    expect(handle.className).toContain("size-11");
    pointer(handle, "pointerdown", 100, 7);
    pointer(handle, "pointermove", 115, 7);
    expect(screen.getByText("75 minutes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 5 PM–6 PM/ })).toHaveAttribute("data-manipulation-preview", "true");
    expect(screen.getByTestId("breathing-room-quiet")).toHaveAttribute("data-preview-reaction", "holding");
    pointer(handle, "pointercancel", 115, 7);
    expect(screen.queryByText("75 minutes")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Workout, 3 PM–4 PM/ })).toHaveAttribute("data-manipulation-preview", "false");
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("cancels lost pointer capture without committing or leaving a live drag", () => {
    render(<FlowPlannerScreen />);
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap/ });
    pointer(roadmap, "pointerdown", 100, 8);
    pointer(roadmap, "pointermove", 120, 8);
    expect(screen.getByText("Moving to 2:20 PM")).toBeInTheDocument();
    pointer(roadmap, "lostpointercapture", 120, 8);
    expect(screen.queryByText("Moving to 2:20 PM")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toHaveAttribute("data-interaction-state", "settled");
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("does not write no-op reset history and records exact transaction identity, time, source, and action", async () => {
    const now = () => new Date("2026-09-02T14:10:00.000Z");
    render(<FlowPlannerScreen now={now} createTransactionId={() => "tx-controller"} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset day" }));
    expect(screen.getByText("Already at the starting day")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
    command("Move my workout to 6");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}");
      expect(stored.lastChange).toMatchObject({
        transactionId: "tx-controller", timestamp: "2026-09-02T14:10:00.000Z",
        source: "type", transcript: "Move my workout to 6", actions: [expect.objectContaining({ type: "move" })],
      });
    });
  });

  it("keeps prior provenance and history untouched for no-op success", async () => {
    let sequence = 0;
    render(<FlowPlannerScreen createTransactionId={() => `tx-${++sequence}`} />);
    command("Make roadmap red");
    await waitFor(() => expect(JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}").lastChange.transactionId).toBe("tx-1"));
    command("Make roadmap red");
    expect(screen.getByText("No change needed")).toBeInTheDocument();
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}");
      expect(stored.lastChange.transactionId).toBe("tx-1");
      expect(stored.past).toHaveLength(1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap/ })).toHaveAttribute("data-color", "neutral");
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeDisabled();
  });

  it("keeps no-op compound anaphors on their resolved event instead of the UI selection", () => {
    render(<FlowPlannerScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ }));
    command("Unprotect email, then make it red");
    expect(screen.getByRole("button", { name: /Review and respond to email/ })).toHaveAttribute("data-color", "red");
    expect(screen.getByRole("button", { name: /Lunch/ })).toHaveAttribute("data-color", "neutral");
  });

  it("does not render a linked Breathing Room after its event is deferred", () => {
    render(<FlowPlannerScreen />);
    command("Give me 20 minutes before interview");
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toBeInTheDocument();
    command("Move interview to tomorrow");
    fireEvent.click(screen.getByRole("button", { name: "Move anyway" }));
    expect(screen.queryByLabelText("Breathing room, 20 minutes")).not.toBeInTheDocument();
    expect(screen.getByText("1 planned for later")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByLabelText("Breathing room, 20 minutes")).toBeInTheDocument();
  });

  it("splits two 45-minute sessions and keeps a bound part before lunch through the real command field", () => {
    render(<FlowPlannerScreen />);
    command("Split deep work into two 45-minute sessions and keep one before lunch");
    expect(screen.getByRole("button", { name: /Deep work — project brief · 1\/2, 9 AM–9:45 AM/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Deep work — project brief · 2\/2, 9:45 AM–10:30 AM/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeInTheDocument();
  });

  it("provides a reduced-motion equivalent while protection markers reverse out", async () => {
    render(<FlowPlannerScreen />);
    const lunch = screen.getByRole("button", { name: /Lunch/ });
    expect(lunch.querySelector('[data-protection-marker="anchored"]')).toBeInTheDocument();
    command("Unprotect lunch");
    await waitFor(() => expect(screen.getByRole("button", { name: /Lunch/ }).querySelector('[data-protection-marker="anchored"]')).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Lunch/ })).toHaveAttribute("data-motion-kind", "reduced");
  });

  it("attributes a voice reset to voice and preserves it as one typed domain action", async () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowPlannerScreen recognitionAdapter={adapter} createTransactionId={() => "tx-reset"} now={() => new Date("2026-09-02T14:10:00.000Z")} />);
    command("Move my workout to 6");
    fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
    act(() => adapter.emitFinal("Start over"));
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}");
      expect(stored.lastChange).toMatchObject({ source: "voice", transcript: "Start over", actions: [{ type: "reset" }] });
    });
  });

  it("invalidates stale result timers when undo interrupts applying", () => {
    vi.useFakeTimers();
    const view = render(<FlowPlannerScreen />);
    try {
      command("Move my workout to 6");
      expect(screen.getByText("Tide is reshaping the day")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
      expect(screen.getByText("Change undone")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(2_000));
      expect(screen.getByText("Change undone")).toBeInTheDocument();
      expect(screen.queryByText("Day reshaped")).not.toBeInTheDocument();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("restores one compound request exactly while an exit ghost remains non-semantic", async () => {
    motionPreference.reduced = false;
    render(<FlowPlannerScreen />);
    command("Move flexible work after 2, protect lunch, and fit 40 minutes of exercise before dinner");
    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(9);

    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));

    expect(document.querySelectorAll("button[data-event-id]")).toHaveLength(8);
    expect(screen.queryByRole("button", { name: /Exercise,/ })).not.toBeInTheDocument();
    const exitGhost = document.querySelector('[data-event-presence="exit-ghost"]');
    if (exitGhost) {
      expect(exitGhost).toBeDisabled();
      expect(exitGhost).not.toHaveAttribute("data-event-id");
      expect(exitGhost.closest("[aria-hidden='true']")).not.toBeNull();
    }
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}");
      expect(stored.plan.events).toHaveLength(8);
      expect(stored.plan.events.some((event: { id: string }) => event.id === "exercise")).toBe(false);
      expect(stored.past).toHaveLength(0);
    });
  });

  it("marks each completed result with its own transaction and exact transcript", () => {
    vi.useFakeTimers();
    const ids = ["tx-first", "tx-second"];
    const view = render(<FlowPlannerScreen createTransactionId={() => ids.shift() ?? "tx-extra"} />);
    try {
      command("Move my workout to 6");
      expect(document.querySelector('[data-flow-feedback][data-feedback-phase="applying"][data-feedback-transaction-id="tx-first"][data-feedback-transcript="Move my workout to 6"]')).not.toBeNull();
      act(() => vi.advanceTimersByTime(520));
      expect(document.querySelector('[data-flow-feedback][data-feedback-phase="completed"][data-feedback-transaction-id="tx-first"]')).not.toBeNull();

      command("Make email 20 minutes");
      expect(document.querySelector('[data-flow-feedback][data-feedback-phase="applying"][data-feedback-transaction-id="tx-second"][data-feedback-transcript="Make email 20 minutes"]')).not.toBeNull();
      expect(document.querySelector('[data-flow-feedback][data-feedback-phase="completed"][data-feedback-transaction-id="tx-second"]')).toBeNull();
      act(() => vi.advanceTimersByTime(520));
      expect(document.querySelector('[data-flow-feedback][data-feedback-phase="completed"][data-feedback-transaction-id="tx-second"]')).not.toBeNull();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("updates only the current-time marker on minute ticks and cleans its timer", () => {
    vi.useFakeTimers();
    let value = new Date(2026, 8, 2, 10, 0, 0);
    const view = render(<CurrentTimeMarker now={() => value} />);
    try {
      expect(screen.getByText("Now 10 AM").parentElement).toHaveAttribute("data-current-minute", "600");
      expect(screen.getByText("Now 10 AM").parentElement).toHaveClass("pointer-events-none");
      value = new Date(2026, 8, 2, 10, 1, 0);
      act(() => vi.advanceTimersByTime(60_000));
      expect(screen.getByText("Now 10:01 AM").parentElement).toHaveAttribute("data-current-minute", "601");
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it("supports normal importance, active selectors, and safe selected label removal through the UI", () => {
    render(<FlowPlannerScreen now={() => new Date("2026-09-02T14:10:00")} />);
    command("Start roadmap");
    command("Make the active event red");
    command("Make roadmap important");
    command("Make roadmap normal");
    const roadmap = screen.getByRole("button", { name: /Planning — Q3 roadmap/ });
    expect(roadmap).toHaveAttribute("data-color", "red");
    expect(roadmap).toHaveAttribute("data-importance", "normal");
    fireEvent.click(roadmap);
    command("Add client label to roadmap");
    command("Remove the client label");
    expect(screen.getByRole("button", { name: /Planning — Q3 roadmap/ })).not.toHaveTextContent("client");
  });

  it("undoes, redoes, and persists linked Breathing Room geometry exactly", async () => {
    render(<FlowPlannerScreen />);
    command("Give me 20 minutes before interview");
    let room = screen.getByTestId("breathing-room-breathing-room");
    expect(room).toHaveAttribute("data-room-link", "interview");
    expect(room).toHaveAttribute("data-room-relation", "before");
    expect(room).toHaveAttribute("data-room-start", "940");
    command("Move interview to six");
    fireEvent.click(screen.getByRole("button", { name: "Move anyway" }));
    room = screen.getByTestId("breathing-room-breathing-room");
    expect(room).toHaveAttribute("data-room-start", "1060");
    expect(room).toHaveAttribute("data-room-end", "1080");
    fireEvent.click(screen.getByRole("button", { name: "Undo last change" }));
    expect(screen.getByTestId("breathing-room-breathing-room")).toHaveAttribute("data-room-start", "940");
    fireEvent.click(screen.getByRole("button", { name: "Redo last change" }));
    expect(screen.getByTestId("breathing-room-breathing-room")).toHaveAttribute("data-room-start", "1060");
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("flow.planner.v4") ?? "{}");
      expect(stored.plan.breathingRooms[0]).toMatchObject({ linkedEventId: "interview", relation: "before", start: 1060, end: 1080 });
      expect(stored.plan.events.find((event: { id: string }) => event.id === "interview")).toMatchObject({ bufferBeforeMinutes: 20, start: 1080 });
    });
  });
});
