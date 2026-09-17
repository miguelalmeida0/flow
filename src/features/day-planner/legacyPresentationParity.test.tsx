import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowPlannerScreen } from "./FlowPlannerScreen";
import { FakeRecognitionAdapter } from "./voice/fakeRecognition";
import { createInitialPlan } from "./seed";
import { savePlannerState } from "./storage";

beforeEach(() => localStorage.clear());
function setup() {
  const plan = createInitialPlan("2026-09-08");
  savePlannerState({ plan, past: [{ plan: structuredClone(plan) }], future: [{ plan: structuredClone(plan) }] });
  const before = localStorage.getItem("flow.planner.v4");
  const adapter = new FakeRecognitionAdapter();
  render(<FlowPlannerScreen recognitionAdapter={adapter} now={() => new Date("2026-09-08T10:00:00+02:00")}/>);
  function type(text: string) {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
  }
  return { adapter, type, unchanged: () => expect(JSON.parse(localStorage.getItem("flow.planner.v4")!)).toEqual(JSON.parse(before!)) };
}
it.each(["click", "typed", "voice"] as const)("hides only the mounted legacy command surface through %s", async (mode) => {
  const view = setup();
  if (mode === "voice") { fireEvent.click(screen.getByRole("button", { name: "Start voice command" })); act(() => view.adapter.emitFinal("Hide Flow command")); }
  else { fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Hide Flow command" })); else view.type("Hide Flow command"); }
  await waitFor(() => expect(screen.getByRole("button", { name: "Open Flow command" })).toBeInTheDocument());
  view.unchanged();
});
it.each(["click", "typed", "voice"] as const)("retries the same legacy adapter through %s without a calendar transaction", async (mode) => {
  const view = setup(); fireEvent.click(screen.getByRole("button", { name: "Start voice command" }));
  act(() => view.adapter.emitFinal("movimento vio")); expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  else if (mode === "typed") view.type("Retry voice command");
  else {
    // A failed recognizer cannot hear. Re-arm the existing adapter before the
    // synthetic final; this is not evidence of hearing while permission failed.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    act(() => view.adapter.emitFinal("Retry voice command"));
  }
  await waitFor(() => expect(view.adapter.startCount).toBe(mode === "voice" ? 3 : 2));
  expect(screen.getByRole("button", { name: "Stop listening" })).toBeInTheDocument(); view.unchanged();
});
