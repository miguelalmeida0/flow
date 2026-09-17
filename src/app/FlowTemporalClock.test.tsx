import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FlowEnvironmentProvider, useFlowEnvironment } from "./FlowEnvironmentProvider";

function ScopeProbe() {
  const environment = useFlowEnvironment();
  return <output data-testid="clock">{JSON.stringify({ today: environment.todayDateKey, scope: environment.temporalScope, past: environment.snapshot.past.length })}</output>;
}

afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

it("updates Today across midnight without reloading the document or adding undo", async () => {
  vi.useFakeTimers(); localStorage.clear();
  let current = new Date(2026, 8, 7, 23, 59, 50);
  render(<FlowEnvironmentProvider now={() => current}><ScopeProbe /></FlowEnvironmentProvider>);
  expect(screen.getByTestId("clock")).toHaveTextContent('"today":"2026-09-07"');
  current = new Date(2026, 8, 8, 0, 0, 20);
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  expect(JSON.parse(screen.getByTestId("clock").textContent!)).toEqual({ today: "2026-09-08", scope: { kind: "day", dateKey: "2026-09-08" }, past: 0 });
});
