import { expect, type Page } from "@playwright/test";

export interface RenderedEvent {
  title: string;
  start: number;
  end: number;
  kind: "fixed" | "protected" | "flexible" | "buffer";
  id: string;
  color: string;
  importance: string;
  mobility: string;
  protected: boolean;
  status: string;
  linkedGroup: string;
  preview: boolean;
}

export async function fresh(page: Page) {
  // Calendar-only journeys must be deterministic and prove that scheduling
  // has no hidden network dependency. Elite's dedicated weather suite owns
  // the normalized live/cached/partial forecast fixtures.
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: '{"daily":{"time":[]}}',
  }));
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Storage.clearDataForOrigin", {
      origin: "http://127.0.0.1:5173",
      storageTypes: "local_storage",
    });
  } finally {
    await session.detach();
  }
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "Breathing Day" })).toBeVisible();
  await expect(page.locator('button[data-event-id]')).toHaveCount(8);
}

export async function captureEvidence(page: Page, path: string) {
  await expect(page.getByRole("heading", { name: "Breathing Day" })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('button[data-event-id]').first()).toBeVisible({ timeout: 5_000 });
  await page.waitForFunction(() => document.readyState === "complete" && document.fonts.status === "loaded", undefined, { timeout: 5_000 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide", timeout: 10_000 });
}

export async function fillCommandField(page: Page, transcript: string) {
  const field = page.getByRole("textbox", { name: "Tell Flow what to change" });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      if (!await field.isVisible().catch(() => false)) {
        const becameVisible = await field.waitFor({ state: "visible", timeout: 700 }).then(() => true).catch(() => false);
        if (!becameVisible) {
          const opener = page.getByRole("button", { name: "Open Flow command" });
          await expect(opener).toBeVisible({ timeout: 1_500 });
          await opener.click();
        }
      }
      await field.fill(transcript, { timeout: 1_500 });
      return field;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function submitSuccess(page: Page, transcript: string) {
  const previousTransactionIds = await page.locator('[data-flow-feedback][data-feedback-transaction-id]').evaluateAll((nodes) => nodes
    .map((node) => node.getAttribute("data-feedback-transaction-id"))
    .filter((value): value is string => Boolean(value)));
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(field).toHaveValue(transcript);
  // Completed utility-screen feedback deliberately recedes into the compact
  // command affordance. The shell retains the exact transcript, while the
  // transaction assertion below proves that this specific request committed.
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
  const completed = page.locator('[data-flow-feedback][data-feedback-phase="completed"]').filter({ hasText: `“${transcript}”` });
  await expect.poll(async () => {
    const ids = await completed.evaluateAll((nodes) => nodes
      .map((node) => node.getAttribute("data-feedback-transaction-id"))
      .filter((value): value is string => Boolean(value)));
    return ids.some((id) => !previousTransactionIds.includes(id));
  }, { message: `a new completed transaction for “${transcript}”`, timeout: 3_000 }).toBe(true);
}

export async function submitRaw(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(field).toHaveValue(transcript);
}

export async function readEvents(page: Page): Promise<RenderedEvent[]> {
  return page.locator("button[data-event-id]").evaluateAll((nodes) => nodes.map((node) => {
    const label = node.getAttribute("aria-label") ?? "";
    const match = label.match(/^(.*), ([^,]+)–([^,]+),/);
    if (!match) throw new Error(`Unrecognized event label: ${label}`);
    return {
      title: match[1] ?? "",
      start: clockMinutesInPage(match[2] ?? ""),
      end: clockMinutesInPage(match[3] ?? ""),
      kind: (node.getAttribute("data-kind") ?? "flexible") as RenderedEvent["kind"],
      id: node.getAttribute("data-event-id") ?? "",
      color: node.getAttribute("data-color") ?? "",
      importance: node.getAttribute("data-importance") ?? "",
      mobility: node.getAttribute("data-mobility") ?? "",
      protected: node.getAttribute("data-protected") === "true",
      status: node.getAttribute("data-status") ?? "",
      linkedGroup: node.getAttribute("data-linked-group") ?? "",
      preview: node.getAttribute("data-preview") === "true",
    };

    function clockMinutesInPage(value: string) {
      const parts = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
      if (!parts) throw new Error(`Unrecognized rendered clock: ${value}`);
      let hour = Number(parts[1]);
      const minute = Number(parts[2] ?? 0);
      if (parts[3] === "PM" && hour < 12) hour += 12;
      if (parts[3] === "AM" && hour === 12) hour = 0;
      return hour * 60 + minute;
    }
  }));
}

export function eventById(events: RenderedEvent[], id: string) {
  const event = events.find((candidate) => candidate.id === id);
  expect(event, `${id} should exist`).toBeDefined();
  return event!;
}

export function expectValid(events: RenderedEvent[], count: number) {
  expect(events).toHaveLength(count);
  expect(new Set(events.map((event) => event.id)).size).toBe(events.length);
  const live = events.filter((event) => event.status !== "done" && event.status !== "cancelled").sort((left, right) => left.start - right.start);
  live.forEach((event) => expect(event.end).toBeGreaterThan(event.start));
  for (let index = 1; index < live.length; index += 1) expect(live[index]!.start).toBeGreaterThanOrEqual(live[index - 1]!.end);
}
