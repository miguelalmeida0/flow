import { expect, test, type Page } from "@playwright/test";
import { captureEvidence, fillCommandField, fresh } from "./tide-helpers";

async function submit(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(page.getByText(`“${transcript}”`).last()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await fresh(page);
  (page as Page & { flowErrors?: string[] }).flowErrors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { flowErrors?: string[] }).flowErrors ?? []).toEqual([]);
});

test("ordinary natural commands mutate real calendar geometry and labels", async ({ page }) => {
  test.setTimeout(60_000);
  await submit(page, "Move my workout to 6");
  await expect(page.getByRole("button", { name: /Workout, 6 PM–7 PM/ })).toBeVisible();

  await fresh(page);
  await submit(page, "Move deep work before lunch");
  await expect(page.getByRole("button", { name: /Deep work — project brief, 10 AM–11 AM/ })).toBeVisible();

  await fresh(page);
  await submit(page, "Make email 20 minutes");
  await expect(page.getByRole("button", { name: /Review and respond to email, 11 AM–11:20 AM/ })).toBeVisible();

  await fresh(page);
  await submit(page, "Protect dinner");
  await expect(page.getByRole("button", { name: /Dinner, 7 PM–8 PM/ })).toBeVisible();

  await fresh(page);
  const aliasTranscript = "move my deep work meeting to 4:00 p.m.";
  await submit(page, aliasTranscript);
  await expect(page.getByRole("textbox", { name: "Tell Flow what to change" })).toHaveValue(aliasTranscript);
  await expect(page.getByRole("button", { name: /Deep work — project brief, 4 PM–5 PM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Interview, 5 PM–6 PM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dinner, 7 PM–8 PM/ })).toBeVisible();
  await expect(page.locator("button[data-event-id]")).toHaveCount(8);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(page.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeVisible();

  await fresh(page);
  await submit(page, "Move the roadmap to tomorrow morning");
  const tomorrow = await page.evaluate(() => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  expect(tomorrow).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect.poll(() => page.evaluate((dateKey) => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendars[dateKey].events.find(({ id }: { id: string }) => id === "roadmap"), tomorrow)).toMatchObject({ id: "roadmap", start: 600 });
  await submit(page, "Tomorrow");
  await expect(page.getByRole("button", { name: /Planning — Q3 roadmap, 10 AM–11 AM/ })).toBeVisible();
});

test("compound recovery is atomic, persists, and supports undo/redo", async ({ page }) => {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document);
  const transcript = "I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview";
  await submit(page, transcript);
  await expect(page.getByRole("button", { name: /Dinner, 7 PM–8 PM/ })).toBeVisible();
  await expect(page.getByLabel("Breathing room, 20 minutes")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendars).flatMap((plan: { events: Array<{ id: string; dateKey: string }> }) => plan.events).filter(({ id, dateKey }: { id: string; dateKey: string }) => id === "roadmap" && dateKey !== JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.dateKey).length)).toBe(1);
  await captureEvidence(page, "artifacts/compound-recovery.png");

  await page.reload();
  await expect(page.getByLabel("Breathing room, 20 minutes")).toBeVisible();
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(before);
  await expect(page.getByRole("button", { name: /Workout, 3:30 PM–4:30 PM/ })).toBeVisible();
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect(page.getByLabel("Breathing room, 20 minutes")).toBeVisible();
});

test("multi-action rearrangement keeps anchors and never drops work", async ({ page }) => {
  await submit(page, "Move flexible work after 2, protect lunch, and fit 40 minutes of exercise before dinner");
  await expect(page.getByRole("button", { name: /Lunch, 12:30 PM–1:15 PM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Interview, 5 PM–6 PM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Exercise,/ })).toBeVisible();
  await expect(page.locator("button[data-mobility='light']")).toHaveCount(5);
});

test("ambiguity and destructive confirmation do not mutate prematurely", async ({ page }) => {
  await submit(page, "Move the roadmap to 2");
  const sourceTranscript = "change my 2:00 p.m. meeting to another time";
  const field = page.getByRole("textbox", { name: "Tell Flow what to change" });
  await field.fill(sourceTranscript);
  await field.press("Enter");
  await expect(field).toHaveValue(sourceTranscript);
  await expect(page.getByText("When should I move Planning — Q3 roadmap?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeVisible();
  const safeChoices = page.getByRole("button", { name: /(?:AM|PM)–.*(?:AM|PM)$/ });
  await expect(safeChoices).toHaveCount(3);
  await safeChoices.first().click();
  await expect(page.getByText("Day reshaped")).toBeVisible();
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(page.getByRole("button", { name: /Planning — Q3 roadmap, 2 PM–3 PM/ })).toBeVisible();

  await fresh(page);
  await submit(page, "Add a 30 minute product meeting at 10");
  await submit(page, "Add a 30 minute hiring meeting at 3");
  await submit(page, "Move the meeting to 8:30 am");
  await expect(page.getByText("Which meeting do you mean?")).toBeVisible();
  await captureEvidence(page, "artifacts/clarification.png");
  await page.getByRole("button", { name: /Product meeting — 10 AM/ }).click();
  await expect(page.getByRole("button", { name: /Product meeting, 8:30 AM–9 AM/ })).toBeVisible();

  await fresh(page);
  await submit(page, "Cancel the dentist appointment");
  await expect(page.getByText("Remove Dentist appointment?")).toBeVisible();
  await captureEvidence(page, "artifacts/delete-confirmation.png");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: /Dentist appointment/ })).toBeVisible();
  await submit(page, "Cancel the dentist appointment");
  await page.getByRole("button", { name: "Confirm removal" }).click();
  await expect(page.getByRole("button", { name: /Dentist appointment/ })).toHaveCount(0);
});

test("invalid time and unsupported language explain the exact problem", async ({ page }) => {
  await submit(page, "Put workout at 25");
  await expect(page.getByText("That time is outside a valid 24-hour clock.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Workout, 3:30 PM–4:30 PM/ })).toBeVisible();
  await submit(page, "Shorten dentist");
  await expect(page.getByText("How long should that event be?")).toBeVisible();
});
