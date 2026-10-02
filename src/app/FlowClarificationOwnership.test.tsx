import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { FlowEnvironmentProvider, useFlowEnvironment } from "./FlowEnvironmentProvider";

let environment: ReturnType<typeof useFlowEnvironment>;
function Probe() { environment = useFlowEnvironment(); return null; }
beforeEach(() => { localStorage.clear(); window.history.replaceState({}, "", "/"); });

it.each(["type", "voice"] as const)("keeps an ordinal %s reply with Calendar clarification despite kernel referents", async (source) => {
  render(<FlowEnvironmentProvider now={() => new Date("2026-10-02T10:00:00Z")}><Probe /></FlowEnvironmentProvider>);
  let sequence = 0;
  async function command(text: string) {
    await act(async () => { await environment.runCommand(text, source, `choice-${++sequence}`); });
    await waitFor(() => expect(environment.lastTranscript).toBe(text));
  }
  await command("Add a 30 minute product meeting at 10");
  await waitFor(() => expect(environment.document.calendar.events.some(event => event.title === "Product meeting")).toBe(true));
  await command("Add a 30 minute hiring meeting at 3");
  await waitFor(() => expect(environment.document.calendar.events.some(event => event.title === "Hiring meeting")).toBe(true));
  await command("Home");
  const before = structuredClone(environment.snapshot);
  await command("Move the meeting to 8:30 am");
  expect(environment.feedback.phase).toBe("clarification");
  expect(environment.snapshot).toEqual(before);
  await command("The first one");
  await waitFor(() => expect(environment.document.calendar.events.find(event => event.title === "Product meeting")?.start).toBe(510));
  expect(environment.document.calendar.events.find(event => event.title === "Hiring meeting")).toEqual(before.document.calendar.events.find(event => event.title === "Hiring meeting"));
  expect(environment.snapshot.past).toHaveLength(before.past.length + 1);
  await command("Undo");
  await waitFor(() => expect(environment.document).toEqual(before.document));
  await command("Move the meeting to 8:30 am");
  const acquired = {
    context: structuredClone(environment.conversationContext),
    scope: structuredClone(environment.temporalScope),
    confirmationAuthority: environment.confirmationAuthority,
  };
  await command("Cancel");
  await command("Move the meeting to 9:30 am");
  const replacement = environment.confirmationAuthority;
  const replacementDocument = structuredClone(environment.document);
  await act(async () => { await environment.runCommand("The first one", "voice", "stale-choice", acquired); });
  expect(environment.feedback.title).toBe("The pending request changed while you were speaking.");
  expect(environment.confirmationAuthority).toBe(replacement);
  expect(environment.document).toEqual(replacementDocument);
});
