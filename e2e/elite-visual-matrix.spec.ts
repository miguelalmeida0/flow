import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/elite-product-rescue/visual-matrix";
const screenshots: string[] = [];
const browserConsoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];

function weatherPayload() {
  const time = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(2026, 8, 4 + index, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  return { daily: {
    time,
    weather_code: time.map((_, index) => index === 1 ? 61 : 2),
    temperature_2m_max: time.map((_, index) => index === 1 ? 15 : 14),
    temperature_2m_min: time.map((_, index) => index === 1 ? 8 : 9),
    apparent_temperature_max: time.map((_, index) => index === 1 ? 10 : 13),
    precipitation_probability_max: time.map((_, index) => index === 1 ? 72 : 12),
    wind_speed_10m_max: time.map((_, index) => index === 1 ? 24 : 10),
    uv_index_max: time.map(() => 3),
    sunrise: time.map((date) => `${date}T06:18`),
    sunset: time.map((date) => `${date}T19:48`),
  } };
}

const viewports = [
  ["reference-1672x941", { width: 1672, height: 941 }],
  ["desktop-1440", { width: 1440, height: 900 }],
  ["laptop-1280", { width: 1280, height: 800 }],
  ["tablet-834", { width: 834, height: 1112 }],
  ["mobile-390", { width: 390, height: 844 }],
] as const;

async function command(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function shot(page: Page, viewport: string, state: string, settled = true) {
  const file = `${viewport}--${state}.png`;
  if (settled) await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 2_500 });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `${evidenceDir}/${file}`, fullPage: false, caret: "hide" });
  screenshots.push(file);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${file} must not overflow`).toBe(true);
}

async function reset(page: Page) {
  const session = await page.context().newCDPSession(page);
  try { await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "local_storage" }); }
  finally { await session.detach(); }
  await page.goto("/");
  await expect(page.getByTestId("home-space")).toBeVisible();
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    class Recognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = "";
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() { this.onstart?.(); } stop() { this.onend?.(); } abort() { this.onend?.(); }
    }
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
  page.on("console", (message) => { if (message.type() === "error") browserConsoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(weatherPayload()) }));
});
test.afterEach(() => {
  expect(browserConsoleErrors, "browser console errors").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(failedRequests, "failed application requests").toEqual([]);
});
test.afterAll(() => writeFileSync(`${evidenceDir}/matrix.json`, `${JSON.stringify({
  verdict: screenshots.length === viewports.length * 19 ? "PASS" : "FAIL",
  expected: viewports.length * 19,
  screenshots,
  browserConsoleErrors,
  pageErrors,
  failedRequests,
}, null, 2)}\n`));

for (const [viewport, dimensions] of viewports) {
  test(`${viewport} renders every required production world and interaction state`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.clock.install({ time: new Date("2026-09-04T09:32:00") });
    await page.setViewportSize(dimensions);
    await reset(page);
    await shot(page, viewport, "home-today");

    await command(page, "Tomorrow");
    await expect(page.getByTestId("home-space")).toContainText(/Saturday, September 5/i);
    await shot(page, viewport, "home-tomorrow");
    await command(page, "Today");

    await command(page, "Open the calendar area");
    await expect(page.getByTestId("calendar-space")).toBeVisible();
    await shot(page, viewport, "today-populated");
    await command(page, "Next weekend");
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).temporal.scope)).toEqual({
      kind: "week", dateKey: "2026-09-05", endDateKey: "2026-09-06",
    });
    await command(page, "Sunday");
    await expect(page.locator("button[data-event-id]")).toHaveCount(0);
    await shot(page, viewport, "today-open-day");
    await command(page, "Today");

    await command(page, "Open the focus area");
    await expect(page.getByTestId("focus-space")).toBeVisible();
    await shot(page, viewport, "focus-available");
    await command(page, "Give me 20 minutes");
    await expect(page.getByTestId("focus-space")).toContainText("minutes running");
    await shot(page, viewport, "focus-active");

    await command(page, "Show me the weather section");
    await expect(page.getByTestId("weather-outfit-space")).toBeVisible();
    await shot(page, viewport, "weather-outfit");

    await command(page, "Open People");
    await expect(page.getByTestId("people-space")).toBeVisible();
    await shot(page, viewport, "people-default");
    await command(page, "I promised Maya the proposal by Friday");
    await command(page, "Show commitments");
    await expect(page.getByTestId("people-space")).toContainText("Proposal");
    await shot(page, viewport, "people-commitments");

    await command(page, "Open the good to know area");
    await expect(page.getByTestId("good-to-know-space")).toBeVisible();
    await shot(page, viewport, "good-to-know");

    await command(page, "Open my capture page");
    await command(page, "Capture renew passport before Senegal");
    await expect(page.getByTestId("inbox-space")).toContainText("Renew passport before Senegal");
    await shot(page, viewport, "capture-unresolved");
    await command(page, "Capture ask Daniel about the contract");
    await expect(page.locator("[data-capture-id]")).toHaveCount(2);
    await shot(page, viewport, "capture-populated");

    await command(page, "Take me to outcomes");
    await expect(page.getByTestId("plans-space")).toBeVisible();
    await shot(page, viewport, "outcomes-empty");
    await command(page, "Turn the passport item into an outcome");
    await expect(page.getByTestId("plan-detail")).toContainText("Renew passport before Senegal");
    await shot(page, viewport, "outcomes-populated");

    await command(page, "Home");
    const transitionInput = await fillCommandField(page, "Tomorrow");
    await transitionInput.press("Enter");
    await shot(page, viewport, "time-travel-transition", false);
    const navigationInput = await fillCommandField(page, "Open focus");
    await navigationInput.press("Enter");
    await shot(page, viewport, "navigation-transition", false);

    await page.getByLabel("Start Flow Live").click();
    await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
    await shot(page, viewport, "command-listening");
    await page.getByLabel("Stop Flow Live").click();

    await command(page, "Today");
    await command(page, "Open calendar");
    await command(page, "Add a 20 minute review at 3 PM");
    await command(page, "Add a 20 minute review at 8 PM");
    await command(page, "Move review to 4 PM");
    await expect(page.locator("[data-flow-feedback]")).toHaveAttribute("data-feedback-phase", "clarification");
    await expect(page.locator("[data-flow-feedback]")).toContainText("Which review do you mean?");
    await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-command-expanded", "true");
    await shot(page, viewport, "command-clarification");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await command(page, "Home");
    await expect(page.locator("[data-space-transition-mode='reduced']")).toHaveCount(1);
    await expect(page.locator("[data-space-transition-mode='reduced']")).not.toHaveAttribute("data-layout-id");
    await shot(page, viewport, "reduced-motion");
  });
}
