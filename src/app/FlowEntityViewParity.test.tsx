import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { acceptanceClock, acceptanceFixture, type AcceptanceFixtureId } from "../features/voice-intelligence/acceptanceFixtures";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { FlowEnvironmentProvider, useFlowEnvironment } from "./FlowEnvironmentProvider";
import { GlobalCommandDock } from "../shared/command/GlobalCommandDock";
import { NowInset } from "../features/now/NowInset";
import { NowSpace } from "../features/now/NowSpace";
import { InboxSpace } from "../features/inbox/InboxSpace";

function ConditionalNowSurface({ adapter, variant }: { adapter: FakeRecognitionAdapter; variant: "open" | "select" }) {
  const environment = useFlowEnvironment();
  return <main data-last-transcript={environment.lastTranscript} data-focused-id={environment.focusedEntityId}>
    {environment.route === "capture" ? <InboxSpace/> : variant === "open" ? <NowInset/> : <NowSpace/>}
    <GlobalCommandDock recognitionAdapter={adapter}/>
  </main>;
}
function setup(fixtureId: AcceptanceFixtureId, path: string, conditionalNow?: "open" | "select") {
  const before = acceptanceFixture(fixtureId).snapshot;
  before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before)); window.history.replaceState({}, "", path);
  const adapter = new FakeRecognitionAdapter(), view = render(conditionalNow
    ? <FlowEnvironmentProvider now={() => acceptanceClock}><ConditionalNowSurface adapter={adapter} variant={conditionalNow}/></FlowEnvironmentProvider>
    : <FlowEnvironmentApp now={() => acceptanceClock} recognitionAdapter={adapter}/>);
  const command = async (text: string, mode: "typed" | "voice") => {
    if (mode === "typed") {
      if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
      const input = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
    } else {
      if (!adapter.startCount) { fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1)); }
      act(() => adapter.emitFinal(text, `entity-${text}`));
    }
    await waitFor(() => expect(document.querySelector("[data-last-transcript]")).toHaveAttribute("data-last-transcript", text));
    await waitFor(() => expect(document.querySelector("[data-flow-feedback]")).not.toHaveAttribute("data-feedback-phase", "understanding"));
  };
  const unchanged = () => { const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot; expect(after.document).toEqual(before.document); expect(after.past).toEqual(before.past); expect(after.future).toEqual(before.future); };
  return { ...view, command, unchanged };
}
beforeEach(() => { localStorage.clear(); });

describe("canonical entity view controls", () => {
  it.each(["click", "typed", "voice"] as const)("opens and cancels a Capture draft through %s without saving it", async (mode) => {
    const view = setup("capture-reference", mode === "click" ? "/inbox" : "/");
    if (mode === "click") fireEvent.click(within(document.querySelector('[data-capture-id="C1"]') as HTMLElement).getByRole("button", { name: "Edit" }));
    else await view.command("Edit Boiler receipt capture", mode);
    const input = await screen.findByRole("textbox", { name: "Edit Boiler receipt" }); expect(input).toHaveValue("Boiler receipt");
    fireEvent.change(input, { target: { value: "Unsaved words only" } });
    if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Cancel" })); else await view.command("Cancel editing", mode);
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Edit Boiler receipt" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Boiler receipt" })).toBeInTheDocument(); view.unchanged();
  });
  it.each(["click", "typed", "voice"] as const)("opens the exact Outcome step editor through %s", async (mode) => {
    const view = setup("outcome-scheduled", mode === "click" ? "/plans/O1" : "/");
    if (mode === "click") fireEvent.click(within(document.querySelector('[data-step-id="S1"]') as HTMLElement).getByRole("button", { name: "Rename" }));
    else await view.command("Rename Measure shelves step", mode);
    const input = await screen.findByRole("textbox", { name: "Rename Measure shelves" }); expect(input).toHaveValue("Measure shelves");
    expect(document.querySelector('[data-step-id="S2"] input')).toBeNull(); view.unchanged();
  });
  it.each(["click", "typed", "voice"] as const)("selects named entities and follows the linked step into Today through %s", async (mode) => {
    const view = setup("outcome-scheduled", mode === "click" ? "/outcomes/O1" : "/");
    if (mode === "click") fireEvent.click(document.querySelector('[data-step-id="S1"] [data-action-id="outcomes.step-select"]')!);
    else await view.command("Select Measure shelves step", mode);
    expect(document.querySelector('[data-step-id="S1"]')).toHaveClass("ring-2");
    if (mode === "click") fireEvent.click(screen.getByRole("button", { name: "Inspect Sort books in Today" }));
    else await view.command("Inspect Sort books step in Today", mode);
    expect(window.location.pathname).toBe("/today");
    expect(document.querySelector('[data-event-id="R1"]')).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector('[data-event-id="R1"]')).toHaveAttribute("aria-label", expect.stringContaining("11 AM–11:40 AM"));
    expect(document.querySelector('[data-calendar-event-continuity="R1"]')).toHaveStyle({ top: "240px", height: "40px" });
    expect(window.__FLOW_COMMAND_TRACE__?.entities).toEqual(["S2", "R1"]); view.unchanged();
  });
  it.each(["click", "typed", "voice"] as const)("selects the named commitment with its person through %s", async (mode) => {
    const view = setup("commitment-reference", mode === "click" ? "/people?view=commitments" : "/");
    if (mode === "click") fireEvent.click(document.querySelector('[data-commitment-id="K1"] [data-action-id="commitments.select"]')!);
    else await view.command("Select Send sketch commitment with Maya", mode);
    expect(document.querySelector('[data-commitment-id="K1"]')).toHaveClass("border-flow-blue");
    expect(window.__FLOW_COMMAND_TRACE__?.entities).toEqual(["K1"]); view.unchanged();
  });
  it.each(["click", "typed", "voice"] as const)("opens the conditional noncompact Now surface's first recommendation through %s", async (mode) => {
    const view = setup("capture-reference", "/", "open");
    if (mode === "click") fireEvent.click(document.querySelector('[data-action-id="now.open-source"]')!);
    else await view.command("Open the first recommendation", mode);
    expect(document.querySelector('[data-capture-id="C1"]')).toHaveClass("ring-2");
    expect(window.__FLOW_COMMAND_TRACE__?.entities).toEqual(["C1"]); view.unchanged();
  });
  it.each(["click", "typed", "voice"] as const)("selects the conditional Now surface's first recommendation without navigation through %s", async (mode) => {
    const view = setup("capture-reference", "/", "select");
    if (mode === "click") fireEvent.click(document.querySelector('[data-action-id="now.select"]')!);
    else await view.command("Select the first recommendation", mode);
    expect(document.querySelector("[data-focused-id]")).toHaveAttribute("data-focused-id", "C1");
    expect(window.location.pathname).toBe("/"); expect(window.__FLOW_COMMAND_TRACE__?.entities).toEqual(["C1"]); view.unchanged();
  });
});
