import { expect, type Page } from "@playwright/test";
import { fillCommandField } from "./tide-helpers";
import { elapseFocusFixture } from "./native-clock";

export async function command(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

export async function committedCommand(page: Page, transcript: string) {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3") ?? "null")?.revision ?? 0);
  await command(page, transcript);
  await expect.poll(() => page.evaluate(({ beforeRevision, expectedTranscript }) => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3") ?? "null");
    return (snapshot?.revision ?? 0) > beforeRevision && snapshot?.lastTransaction?.transcript === expectedTranscript;
  }, { beforeRevision: before, expectedTranscript: transcript })).toBe(true);
}

/** The same real command fixtures drive production stress and development probes. */
export const signatures = [
  {
    id: "tide-recovery", path: "/today", transcript: "I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview",
    setup: async () => undefined,
  },
  {
    id: "focus-completion", path: "/focus", transcript: "Stop focus",
    setup: async (page: Page) => {
      await committedCommand(page, "Give me five minutes");
      await elapseFocusFixture(page, 4);
    },
  },
  {
    id: "outcome-completion", path: "/outcomes", transcript: "Complete this outcome",
    setup: async (page: Page) => {
      await committedCommand(page, "I need to draft a report");
      for (const step of ["Define the audience and outcome", "Draft the structure", "Review and deliver"]) await committedCommand(page, `Mark ${step} complete`);
    },
  },
  {
    id: "commitment-kept", path: "/people?view=commitments", transcript: "Mark proposal promise to Maya complete",
    setup: async (page: Page) => committedCommand(page, "I promised Maya the proposal by Friday"),
  },
  {
    id: "time-travel", path: "/", transcript: "Tomorrow",
    setup: async (page: Page) => committedCommand(page, "Move deep work to ten"),
  },
  {
    id: "capture-to-outcome", path: "/capture", transcript: "Turn that into an outcome",
    setup: async (page: Page) => {
      await committedCommand(page, "Capture renew passport before Senegal");
      await page.getByRole("button", { name: "Renew passport before Senegal" }).click();
    },
  },
].map((signature) => ({
  ...signature,
  run: async (page: Page) => {
    if (signature.id !== "time-travel") return committedCommand(page, signature.transcript);
    await command(page, signature.transcript);
    await expect(page.getByTestId("home-space")).toContainText(/Saturday, September 5/i);
  },
}));
