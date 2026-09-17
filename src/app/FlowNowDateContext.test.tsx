import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createFreshLifeSnapshot, LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { NowInset } from "../features/now/NowInset";
import { NowSpace } from "../features/now/NowSpace";
import { projectCalendarDate } from "../domain/life-calendar-world";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { FlowEnvironmentProvider, useFlowEnvironment } from "./FlowEnvironmentProvider";

const read = () => JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
function command(text: string) {
  if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
  const input = screen.getByLabelText("Tell Flow what to change");
  fireEvent.change(input, { target: { value: text } }); fireEvent.submit(input.closest("form")!);
}

function NowProbe() {
  const environment = useFlowEnvironment();
  return <><NowInset /><output data-testid="candidates">{JSON.stringify(environment.nowCandidates)}</output>
    <button onClick={() => environment.runCommand("What fits right now?")}>Query</button>
    <button onClick={() => environment.runCommand("Nothing administrative")}>Refine</button>
    <button onClick={() => environment.runCommand("Keep the time free")}>Keep free</button>
    <button onClick={() => environment.runCommand("Capture check passport")}>Capture</button>
    <button onClick={() => environment.runCommand("Archive all captures")}>Archive</button>
    <button onClick={() => environment.runCommand("Schedule documents step")}>Incomplete schedule</button>
    <button onClick={() => environment.runCommand("Schedule documents Monday at three pm")}>Dated schedule</button>
    <button onClick={() => environment.undo()}>Undo</button><button onClick={() => environment.redo()}>Redo</button>
    <output data-testid="feedback">{environment.feedback.title}</output>
  </>;
}

beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/today"); });

describe("Now follows actual time, not the browsed date", () => {
  it.each(["Show tomorrow", "Previous day"])("keeps today's Dinner blocker while browsing %s, without a query transaction", async (browse) => {
    render(<FlowEnvironmentApp now={() => new Date("2026-09-03T19:10:00")} />);
    command("Capture check passport"); command(browse);
    const before = read();
    expect(before.document.calendar.dateKey).not.toBe("2026-09-03");
    command("What fits right now?");
    await waitFor(() => expect(screen.getByTestId("now-space")).toHaveTextContent("Stay with what is here"));
    expect(screen.getByTestId("now-space")).toHaveTextContent("Now · Today");
    expect(document.querySelector("[data-flow-feedback]")).toHaveTextContent("Keep this space free");
    expect(read()).toEqual(before);
  });

  it("recomputes an existing query when the clock reaches a blocker and retains filters", async () => {
    let clock = new Date("2026-09-03T10:15:00");
    const snapshot = createFreshLifeSnapshot("2026-09-03");
    snapshot.document.captures = ["Check passport", "Admin paperwork"].map((title, index) => ({ id: `note-${index}`, kind: "capture", title, status: "unresolved", source: "typed", createdAt: clock.toISOString(), updatedAt: clock.toISOString() }));
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    render(<FlowEnvironmentProvider now={() => clock}><NowProbe /></FlowEnvironmentProvider>);
    fireEvent.click(screen.getByText("Query")); fireEvent.click(screen.getByText("Refine"));
    expect(screen.getByTestId("candidates")).toHaveTextContent("Check passport");
    expect(screen.getByTestId("candidates")).not.toHaveTextContent("Admin paperwork");
    const before = read();
    clock = new Date("2026-09-03T11:10:00");
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getByTestId("candidates")).toHaveTextContent("[]"));
    expect(read()).toEqual(before);
    clock = new Date("2026-09-03T11:50:00");
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getByTestId("candidates")).toHaveTextContent("Check passport"));
    expect(screen.getByTestId("candidates")).not.toHaveTextContent("Admin paperwork");
    expect(read()).toEqual(before);
  });

  it("removes stale archived recommendations and respects keeping the time free", async () => {
    render(<FlowEnvironmentProvider now={() => new Date("2026-09-03T10:15:00")}><NowProbe /></FlowEnvironmentProvider>);
    fireEvent.click(screen.getByText("Capture")); fireEvent.click(screen.getByText("Query"));
    expect(screen.getByTestId("candidates")).toHaveTextContent("Check passport");
    fireEvent.click(screen.getByText("Archive"));
    await waitFor(() => expect(screen.getByTestId("candidates")).toHaveTextContent("[]"));
    fireEvent.click(screen.getByText("Capture")); fireEvent.click(screen.getByText("Query"));
    const before = read();
    fireEvent.click(screen.getByText("Keep free"));
    expect(screen.getByTestId("now-space").querySelectorAll("[data-flow-action='Open Now recommendation']")).toHaveLength(0);
    expect(read()).toEqual(before);
  });

  it("opens a recommendation without inventing a slot, clarifies missing time, and schedules an explicit date atomically", async () => {
    const snapshot = createFreshLifeSnapshot("2026-09-03");
    const at = "2026-09-03T08:15:00.000Z";
    snapshot.document.plans = [{ id: "passport", kind: "plan", title: "Passport", outcome: "Ready", status: "active", stepIds: ["documents"], createdAt: at, updatedAt: at }];
    snapshot.document.steps = [{ id: "documents", kind: "plan-step", planId: "passport", title: "Documents", status: "planned", estimatedMinutes: 25, createdAt: at, updatedAt: at }];
    snapshot.document = projectCalendarDate(snapshot.document, "2026-09-04");
    snapshot.temporal!.scope = { kind: "day", dateKey: "2026-09-04" };
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    render(<FlowEnvironmentProvider now={() => new Date("2026-09-03T10:15:00")}><NowProbe /></FlowEnvironmentProvider>);
    fireEvent.click(screen.getByText("Query"));
    const before = read();
    fireEvent.click(screen.getByRole("button", { name: /Documents.*25m.*Open/ }));
    expect(read()).toEqual(before);
    fireEvent.click(screen.getByText("Incomplete schedule"));
    expect(screen.getByTestId("feedback")).toHaveTextContent("When should I schedule Documents?");
    expect(read()).toEqual(before);
    fireEvent.click(screen.getByText("Dated schedule"));
    await waitFor(() => expect(read().document.steps[0]?.status).toBe("scheduled"));
    const after = read();
    expect(after.document.calendars["2026-09-07"]?.events).toContainEqual(expect.objectContaining({ title: "Documents", dateKey: "2026-09-07", start: 900, end: 925 }));
    expect(after.document.calendar.dateKey).toBe("2026-09-04");
    expect(after.document.calendars["2026-09-03"]).toEqual(before.document.calendars["2026-09-03"]);
    expect(after.past.length).toBe(before.past.length + 1);
    fireEvent.click(screen.getByText("Undo")); await waitFor(() => expect(read().document).toEqual(before.document));
    fireEvent.click(screen.getByText("Redo")); await waitFor(() => expect(read().document).toEqual(after.document));
  });

  it("labels a commitment recommendation as a commitment, not an Inbox capture", () => {
    const snapshot = createFreshLifeSnapshot("2026-09-03"); const at = "2026-09-03T08:15:00.000Z";
    snapshot.document.people = [{ id: "maya", kind: "person", name: "Maya", createdAt: at, updatedAt: at }];
    snapshot.document.commitments = [{ id: "proposal", kind: "commitment", personId: "maya", title: "Proposal", status: "open", direction: "i-owe", createdAt: at, updatedAt: at }];
    localStorage.setItem(LIFE_STORAGE_KEY, JSON.stringify(snapshot));
    render(<FlowEnvironmentProvider now={() => new Date("2026-09-03T10:15:00")}><NowSpace /></FlowEnvironmentProvider>);
    const candidate = screen.getByRole("button", { name: /Prepare for Maya: Proposal/ });
    expect(candidate).toHaveTextContent("Commitment"); expect(candidate).not.toHaveTextContent("Inbox capture");
  });
});
