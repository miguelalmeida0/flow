import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";

const worldEvents = (snapshot: LifeSnapshot) => Object.values(snapshot.document.calendars).flatMap((plan) => plan.events);

beforeEach(() => {
  localStorage.clear();
  delete window.__FLOW_MOTION__;
  window.history.replaceState({}, "", "/");
});

describe("Flow living environment", () => {
  it("runs the Apple acceptance journey through one persistent fake voice session with exactly eight domain entries", async () => {
    const adapter = new FakeRecognitionAdapter();
    render(<FlowEnvironmentApp now={() => new Date("2026-09-03T09:00:00")} recognitionAdapter={adapter} />);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    let cycle = 1;
    const speak = async (transcript: string, restart = true) => {
      act(() => adapter.emitFinal(transcript, `apple-${cycle}`));
      cycle += 1;
      if (restart) await waitFor(() => expect(adapter.startCount).toBe(cycle), { timeout: 900 });
    };
    const expectHistory = async (length: number) => waitFor(() => {
      const current = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
      expect(current.past, document.body.textContent?.slice(-500)).toHaveLength(length);
    });

    await speak("Home");
    await speak("Book dinner at Pizzeria Roma tomorrow at eight"); await expectHistory(1);
    await speak("Make it red and important"); await expectHistory(2);
    // September 8 contract: ordinary goals are not permission to create data.
    await speak("I need to renew my passport before Senegal"); await expectHistory(2);
    await speak("Create an outcome called Renew my passport before Senegal"); await expectHistory(3);
    await speak("The first step is check the requirements"); await expectHistory(4);
    await speak("Schedule it Thursday after work"); await expectHistory(5);
    await speak("I promised Maya the proposal by Friday"); await expectHistory(6);
    await speak("I am waiting for Daniel's contract confirmation"); await expectHistory(7);
    await speak("What needs me now");
    await speak("Move the two PM meeting to four"); await expectHistory(8);
    await speak("Undo"); await expectHistory(7);
    await speak("Redo"); await expectHistory(8);
    await speak("Home");
    await speak("Pause listening", false);

    const state = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(state.past).toHaveLength(8);
    expect(state.document.captures).toHaveLength(0);
    expect(state.document.plans).toEqual([expect.objectContaining({ title: "Renew my passport before Senegal", targetCondition: "Before Senegal" })]);
    const outcome = state.document.plans[0]!;
    expect(outcome.stepIds).toHaveLength(3);
    expect(state.document.steps).toContainEqual(expect.objectContaining({ id: outcome.nextStepId, title: "Check the requirements", status: "scheduled" }));
    expect(state.document.links.filter(({ type }) => type === "step-scheduled-as-event")).toHaveLength(1);
    expect(state.document.commitments).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Proposal", direction: "i-owe" }),
      expect.objectContaining({ title: "Contract confirmation", direction: "waiting-on" }),
    ]));
    expect(state.document.calendar.events.find(({ id }) => id === "roadmap")?.start).toBe(16 * 60);
    expect(worldEvents(state).filter(({ title }) => title === "Dinner at Pizzeria Roma")).toHaveLength(1);
    expect(screen.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  }, 15_000);
});
