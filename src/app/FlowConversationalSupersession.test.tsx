import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FlowEnvironmentApp } from "./FlowEnvironmentApp";
import { LIFE_STORAGE_KEY } from "../domain/life-storage";
import type { LifeSnapshot } from "../domain/life-model";
import { DESKTOP_COMPANION_TOKEN_KEY, DESKTOP_COMPANION_BASE_URL_KEY } from "../kernel/lib/desktopBridgeClient";

/**
 * Phase 11 (see FINAL REPORT): "a late model response from an interrupted
 * turn must not execute" — automated, not physical-mic, verification that
 * FlowEnvironmentProvider's own supersession guard
 * (`conversationalAbortRef.current !== controller`) actually holds at the
 * real app level, not just inside conversationCoordinator's own signal
 * check (see conversationCoordinator.test.ts's "respects an already-
 * cancelled signal", which only covers cancellation BEFORE the model call
 * starts, not a late response arriving AFTER a newer utterance superseded
 * it mid-flight).
 */

function command(text: string) {
  const field = screen.queryByLabelText("Tell Flow what to change") ?? (() => { fireEvent.click(screen.getByRole("button", { name: "Open Flow command" })); return screen.getByLabelText("Tell Flow what to change"); })();
  fireEvent.change(field, { target: { value: text } });
  fireEvent.submit(field.closest("form")!);
}

let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  localStorage.setItem(DESKTOP_COMPANION_TOKEN_KEY, "test-token");
  localStorage.setItem(DESKTOP_COMPANION_BASE_URL_KEY, "http://127.0.0.1:19999");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

it("never executes a late model response that arrived after a newer utterance superseded it", async () => {
  let resolveFirstCall: ((response: Response) => void) | undefined;
  const firstCallStarted = new Promise<void>((resolveStarted) => {
    globalThis.fetch = vi.fn(() => {
      resolveStarted();
      return new Promise<Response>((resolve) => {
        resolveFirstCall = resolve;
      });
    }) as unknown as typeof fetch;
  });

  render(<FlowEnvironmentApp />);
  const before = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;

  // A complexity-flagged utterance (quoted write instruction) routes
  // straight to the conversational tier and calls the (now-mocked,
  // deliberately never-resolving-yet) companion.
  command(`Write a note saying "this should never be saved".`);
  await firstCallStarted;

  // Immediate local cancel (Escape — see FlowEnvironmentProvider's `cancel`)
  // fires before the first model call returns, aborting the in-flight
  // controller (see tryConversationalBridge's doc).
  act(() => { fireEvent.keyDown(window, { key: "Escape" }); });

  // NOW let the first (superseded) call resolve, with a plan that WOULD
  // create a journal entry if it were allowed to execute.
  const latePlan = {
    kind: "plan",
    summary: "note",
    conditions: [],
    steps: [{ capabilityId: "journal.create", args: { title: "this should never be saved" } }],
  };
  await act(async () => {
    resolveFirstCall?.({
      ok: true,
      status: 200,
      json: async () => ({ content: JSON.stringify(latePlan), model: "test", totalDurationMs: 1, loadDurationMs: null, evalCount: 1 }),
    } as Response);
    await Promise.resolve();
    await Promise.resolve();
  });

  await waitFor(() => {
    const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
    expect(after.document.studio.journalEntries.some((entry) => entry.title === "this should never be saved")).toBe(false);
  });
  const after = JSON.parse(localStorage.getItem(LIFE_STORAGE_KEY)!) as LifeSnapshot;
  expect(after.document).toEqual(before.document);
});
