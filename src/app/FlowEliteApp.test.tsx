import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { LifeSnapshot } from "../domain/life-model";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import { FakeRecognitionAdapter } from "../features/day-planner/voice/fakeRecognition";
import { fixtureWeather, type WeatherProvider } from "../features/elite/weather";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";

const now = () => new Date("2026-09-03T09:32:00");
const weatherProvider: WeatherProvider = {
  load: async (dateKeys) => dateKeys.map((dateKey) => fixtureWeather(dateKey, now().toISOString())),
};

function snapshot() {
  return JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
}

function setup(adapter?: FakeRecognitionAdapter) {
  const view = render(<FlowEnvironmentApp now={now} recognitionAdapter={adapter} weatherProvider={weatherProvider} />);
  const command = (value: string) => {
    if (!screen.queryByLabelText("Tell Flow what to change")) fireEvent.click(screen.getByRole("button", { name: "Open Flow command" }));
    const input = screen.getByLabelText("Tell Flow what to change");
    fireEvent.change(input, { target: { value } });
    fireEvent.submit(input.closest("form")!);
  };
  return { command, unmount: view.unmount };
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Flow Elite north-star release path", () => {
  it("updates the whole scene, freezes the available proposal, applies it once, and undoes exactly", async () => {
    const { command } = setup();
    await waitFor(() => expect(screen.getByTestId("elite-weather-lens")).not.toHaveTextContent("Forecast unavailable"));
    const initial = snapshot();
    expect(initial.past).toHaveLength(0);

    command("Tomorrow.");
    await waitFor(() => expect(screen.getByText(/Friday, September 4/i)).toBeInTheDocument());
    expect(screen.getByTestId("elite-today-lens")).toHaveTextContent("Creative Review");
    expect(screen.getByTestId("elite-focus-lens")).toHaveTextContent("28");
    expect(snapshot().past).toHaveLength(0);

    command("What should I wear?");
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("What should I wear?");
    expect(snapshot().past).toHaveLength(0);

    command("Give me 40 minutes before lunch.");
    expect(screen.getByText("You asked for 40 minutes. You have 28 clear.")).toBeInTheDocument();
    const proposed = snapshot();
    expect(proposed.document.focus.active).toBeUndefined();
    expect(proposed.past).toHaveLength(0);

    command("Do it.");
    await waitFor(() => expect(snapshot().document.focus.active).toMatchObject({
      dateKey: "2026-09-04",
      startMinutes: 12 * 60 + 2,
      durationMinutes: 28,
      status: "active",
    }));
    expect(snapshot().past).toHaveLength(1);
    expect(screen.getByTestId("elite-focus-lens")).toHaveTextContent("focus session in motion");

    command("Undo.");
    const undone = snapshot();
    expect(undone.document.focus.active).toBeUndefined();
    expect(undone.past).toHaveLength(0);
    expect(undone.future).toHaveLength(1);
    expect(undone.temporal?.scope.dateKey).toBe("2026-09-04");
  });

  it("keeps final voice transcripts on the same route-independent path and deduplicates one boundary", async () => {
    const adapter = new FakeRecognitionAdapter();
    setup(adapter);
    fireEvent.click(screen.getByLabelText("Start Flow Live"));
    await waitFor(() => expect(adapter.startCount).toBe(1));
    act(() => adapter.emitFinal("Tomorrow.", "elite-tomorrow"));
    await waitFor(() => expect(screen.getByText(/Friday, September 4/i)).toBeInTheDocument());
    expect(screen.getByLabelText("Tell Flow what to change")).toHaveValue("Tomorrow.");
    expect(snapshot().past).toHaveLength(0);

    await waitFor(() => expect(adapter.startCount).toBe(2));
    act(() => adapter.emitFinal("Give me 40 minutes before lunch.", "elite-proposal"));
    await waitFor(() => expect(screen.getByText("You asked for 40 minutes. You have 28 clear.")).toBeInTheDocument());
    expect(snapshot().past).toHaveLength(0);

    await waitFor(() => expect(adapter.startCount).toBe(3));
    act(() => adapter.emitFinal("Do it.", "elite-confirm"));
    await waitFor(() => expect(snapshot().past).toHaveLength(1));
    expect(snapshot().document.focus.active?.durationMinutes).toBe(28);
    // Replaying the exact final boundary cannot create a second transaction.
    act(() => adapter.emitFinal("Do it.", "elite-confirm"));
    expect(snapshot().past).toHaveLength(1);
  });

  it("never turns temporal or spatial navigation into captured user data", () => {
    const { command } = setup();
    ["Tomorrow", "Today", "Open the calendar", "Home", "Open the inbox"].forEach(command);
    expect(snapshot().document.captures).toEqual([]);
    expect(snapshot().past).toHaveLength(0);
  });

  it("keeps spatial back independent from a stale previous temporal scene", async () => {
    const { command } = setup();
    command("Open the calendar.");
    command("Tomorrow.");
    await waitFor(() => expect(snapshot().temporal?.scope).toEqual({ kind: "day", dateKey: "2026-09-04" }));
    command("Go back.");
    await waitFor(() => expect(screen.getByTestId("home-space")).toBeInTheDocument());
    expect(snapshot().temporal?.scope).toEqual({ kind: "day", dateKey: "2026-09-04" });
    expect(snapshot().past).toHaveLength(0);
  });

  it("keeps spoken previous and next day identical to the visible date controls without history", () => {
    const { command } = setup();
    command("Tomorrow");
    const before = snapshot();
    command("Previous day");
    expect(snapshot().temporal?.scope.dateKey).toBe("2026-09-03");
    command("Next day");
    expect(snapshot().document).toEqual(before.document);
    expect(snapshot().temporal?.scope).toEqual(before.temporal?.scope);
    expect(snapshot().past).toEqual(before.past);
  });

  it("resolves relative date controls from the persisted scope after reload", () => {
    const first = setup();
    first.command("Tomorrow");
    const before = snapshot();
    first.unmount();
    const restored = setup();
    expect(snapshot().temporal?.scope).toEqual(before.temporal?.scope);
    restored.command("Previous day");
    expect(snapshot().temporal?.scope.dateKey).toBe("2026-09-03");
    restored.command("Next day");
    expect(snapshot().document).toEqual(before.document);
    expect(snapshot().past).toEqual(before.past);
  });

  it("renders a real seven-day projection through every Home lens and asks for a focus day", async () => {
    const { command } = setup();
    await waitFor(() => expect(screen.getByTestId("elite-weather-lens")).not.toHaveTextContent("Forecast unavailable"));
    command("This week.");
    await waitFor(() => expect(screen.getByText("Here’s the shape of your week.")).toBeInTheDocument());
    expect(screen.getByTestId("elite-today-lens")).toHaveTextContent("7 days");
    expect(screen.getByTestId("elite-focus-lens")).toHaveTextContent("across 7 days");
    expect(screen.getByTestId("elite-weather-lens")).toHaveTextContent("of 7 days");
    expect(screen.getByTestId("elite-people-lens")).toHaveTextContent(/Thu|Fri/);
    command("Give me 25 minutes this week.");
    expect(screen.getByText("Which day should I use?")).toBeInTheDocument();
    expect(snapshot().document.focus.active).toBeUndefined();
    expect(snapshot().past).toHaveLength(0);
  });

  it("records visible instinct exposure without user history and never echoes Weather telemetry", async () => {
    const { command } = setup();
    command("What did you notice?");
    await waitFor(() => expect(snapshot().document.instinctState.lastShownAt["clear-focus-window"]).toBe(now().toISOString()));
    expect(snapshot().past).toHaveLength(0);
    expect(screen.getByTestId("elite-instinct-lens")).not.toHaveTextContent(/Rain may catch you|UV is|Sunset at/i);
  });
});
