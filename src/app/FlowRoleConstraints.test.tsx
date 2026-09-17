import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import type { LifeDocument, LifeSnapshot } from "../domain/life-model";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { acceptanceClock, acceptanceFixture, type AcceptanceFixtureId } from "../features/voice-intelligence/acceptanceFixtures";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";

const cases: { fixture: AcceptanceFixtureId; text: string; phase: "error" | "clarification"; path?: string; prepare?: (document: LifeDocument) => void }[] = [
  { fixture: "outcome-reference", text: "Pause Missing project outcome", phase: "clarification" },
  { fixture: "outcome-reference", text: "Pause work on Home library, but leave its steps intact", phase: "clarification", prepare: (document) => { document.plans.push({ ...document.plans[0]!, id: "O3", stepIds: [], nextStepId: undefined }); } },
  { fixture: "outcome-reference", text: "Bring Garden notebook back into active work, not Garden notebook", phase: "clarification" },
  { fixture: "outcome-reference", text: "Keep Garden notebook active, but rename it 'A different name'", phase: "clarification" },
  { fixture: "outcome-reference", text: "In Missing project, Donate old books belongs ahead of Sort books", phase: "clarification" },
  { fixture: "commitment-reference", text: "The Return keys deadline needs to be Friday, with no change to Return keys", phase: "clarification" },
  { fixture: "commitment-reference", text: "Mark Return keys from Maya complete, not Maya's keys", phase: "clarification" },
  { fixture: "commitment-reference", text: "Daniel's delivery confirmation is still open; defer it until Thursday", phase: "clarification", prepare: (document) => { Object.assign(document.commitments[1]!, { status: "deferred", deferredUntil: "2026-09-10" }); } },
  { fixture: "atmosphere", text: "Keep the rain audible; reduce the tone instead", phase: "clarification", prepare: (document) => { document.studio.activeAtmosphere!.muted = true; } },
  { fixture: "atmosphere", text: "Keep the pulse audible; reduce the pulse instead", phase: "clarification" },
  { fixture: "atmosphere", text: "Lower the rain; keep its organizer unchanged", phase: "error" },
  { fixture: "atmosphere", text: "Lower the rain, not the rain", phase: "clarification" },
  { fixture: "atmosphere", text: "Lower the rain, but leave the rain alone", phase: "clarification" },
  { fixture: "memory-source", path: "/journal", text: "Keep the travel tag, but remove travel from this entry", phase: "clarification" },
  { fixture: "memory-source", text: "Make the words smaller, and keep the voice included", phase: "clarification", prepare: (document) => { document.studio.memories[0]!.audioEnabled = false; } },
  { fixture: "capture-reference", text: "This capture should say 'Go home'; teleport the moon", phase: "error" },
  { fixture: "memory-source", text: "Set the memory's words to 'No comma here', including the comma", phase: "error" },
  { fixture: "outcome-reference", text: "Pause work on Home library, but leave its unknown setting untouched", phase: "error" },
];
const paths: Partial<Record<AcceptanceFixtureId, string>> = { "outcome-reference": "/outcomes/O1", "commitment-reference": "/people?view=commitments", atmosphere: "/atmosphere", "memory-source": "/memories", "capture-reference": "/inbox" };
beforeEach(() => { localStorage.clear(); });
for (const mode of ["typed", "voice"] as const) it.each(cases)(`${mode} refuses a contradictory or unresolved role: $text`, async ({ fixture, text, phase, path, prepare }) => {
  const before = acceptanceFixture(fixture).snapshot; prepare?.(before.document);
  before.past = [{ document: structuredClone(before.document) }]; before.future = [{ document: structuredClone(before.document) }];
  localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(before)); window.history.replaceState({}, "", path ?? paths[fixture]!);
  const adapter = new FakeRecognitionAdapter(); render(<FlowEnvironmentApp now={() => acceptanceClock} recognitionAdapter={adapter}/>);
  const previousTrace = window.__FLOW_COMMAND_TRACE__?.interpretedAt;
  if (mode === "typed") {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const field = screen.getByLabelText("Tell Flow what to change"); fireEvent.change(field, { target: { value: text } }); fireEvent.submit(field.closest("form")!);
  } else {
    fireEvent.click(screen.getByRole("button", { name: "Start Flow Live" })); await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal(text, "role-guard"));
  }
  await waitFor(() => {
    expect(window.__FLOW_COMMAND_TRACE__?.interpretedAt).not.toBe(previousTrace);
    const feedback = document.querySelector("[data-flow-feedback]");
    expect(feedback).toHaveAttribute("data-feedback-transcript", text);
    expect(feedback).toHaveAttribute("data-feedback-phase", phase);
    expect(feedback).toHaveAttribute("data-pending-change", "false");
  });
  const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
  expect(after).toEqual(before);
});
