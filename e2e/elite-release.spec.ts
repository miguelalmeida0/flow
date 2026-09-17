import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/elite-release";
const consoleErrors: string[] = [];
const pageErrors: string[] = [];
const failedRequests: string[] = [];
const screenshots: string[] = [];
let northStar = "FAIL";
let syntheticVoice = "FAIL";
let responsive = "FAIL";
let accessibleActions = "FAIL";
let weekProjection = "FAIL";
let instinctDeduplication = "FAIL";

function weatherPayload() {
  const dates = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(2026, 8, 4 + index, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  });
  return {
    daily: {
      time: dates,
      weather_code: dates.map((_, index) => index === 1 ? 61 : 2),
      temperature_2m_max: dates.map((_, index) => index === 1 ? 15 : 14),
      temperature_2m_min: dates.map((_, index) => index === 1 ? 8 : 9),
      apparent_temperature_max: dates.map((_, index) => index === 1 ? 10 : 13),
      precipitation_probability_max: dates.map((_, index) => index === 1 ? 72 : 12),
      wind_speed_10m_max: dates.map((_, index) => index === 1 ? 24 : 10),
      uv_index_max: dates.map(() => 3),
      sunrise: dates.map((date) => `${date}T06:18`),
      sunset: dates.map((date) => `${date}T19:48`),
    },
  };
}

async function openElite(page: Page) {
  await page.clock.install({ time: new Date("2026-09-04T09:32:00") });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(weatherPayload()) }));
  const session = await page.context().newCDPSession(page);
  try { await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "local_storage" }); }
  finally { await session.detach(); }
  await page.goto("/");
  await expect(page.getByTestId("home-space")).toBeVisible();
  await command(page, "Home");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");
  await expect(page.locator("[data-elite-lens-grid] > div")).toHaveCount(5);
  await expect(page.getByTestId("elite-weather-lens")).not.toContainText("Forecast unavailable");
}

async function command(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(field).toHaveValue(transcript);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function shot(page: Page, name: string) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: false, caret: "hide", animations: "disabled" });
  screenshots.push(name);
}

async function expectControlsSeparated(page: Page) {
  const commandDock = page.getByLabel("Global Flow command");
  const timeScope = page.getByLabel("Time scope");
  await expect(commandDock).toBeVisible();
  await expect(timeScope).toBeVisible();
  const geometry = await page.evaluate(() => {
    const command = document.querySelector<HTMLElement>('[aria-label="Global Flow command"]')?.getBoundingClientRect();
    const time = document.querySelector<HTMLElement>('[aria-label="Time scope"]')?.getBoundingClientRect();
    const scope = document.querySelector<HTMLElement>('[aria-label="Time scope"]');
    if (!command || !time || !scope) return { intersects: true, controlsHitTest: false };
    const hitTargets = [...scope.querySelectorAll<HTMLElement>("button")].map((button) => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { name: button.getAttribute("aria-label") ?? button.textContent?.trim(), hit: hit?.getAttribute("aria-label") ?? hit?.textContent?.trim(), matches: hit === button || button.contains(hit) };
    });
    return {
      intersects: command.left < time.right && command.right > time.left && command.top < time.bottom && command.bottom > time.top,
      sideBySide: command.top < time.bottom && command.bottom > time.top,
      horizontalGap: time.left - command.right,
      verticalGap: time.top - command.bottom,
      controlsHitTest: hitTargets.every(({ matches }) => matches),
      hitTargets,
    };
  });
  expect(geometry.intersects, "the command dock and time scope must not overlap").toBe(false);
  expect(
    geometry.sideBySide ? geometry.horizontalGap : geometry.verticalGap,
    `the ${geometry.sideBySide ? "horizontal" : "vertical"} command-control gap must be at least 16px`,
  ).toBeGreaterThanOrEqual(16);
  expect(geometry.controlsHitTest, `every time-scope control must win pointer hit-testing: ${JSON.stringify(geometry.hitTargets)}`).toBe(true);
}

async function contrastRatio(locator: ReturnType<Page["locator"]>) {
  return locator.evaluate((element) => {
    const rgba = (value: string) => {
      const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return { r: channels[0] ?? 0, g: channels[1] ?? 0, b: channels[2] ?? 0, a: channels[3] ?? 1 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const linear = [r, g, b].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const foreground = rgba(getComputedStyle(element).color);
    let current: Element | null = element;
    let background = rgba("rgb(255, 255, 255)");
    while (current) {
      const candidate = rgba(getComputedStyle(current).backgroundColor);
      if (candidate.a > 0) { background = candidate; break; }
      current = current.parentElement;
    }
    const light = Math.max(luminance(foreground), luminance(background));
    const dark = Math.min(luminance(foreground), luminance(background));
    return (light + 0.05) / (dark + 0.05);
  });
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page }) => {
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
});
test.afterEach(() => {
  expect(consoleErrors, "browser console errors").toEqual([]);
  expect(pageErrors, "uncaught page errors").toEqual([]);
  expect(failedRequests, "failed application requests").toEqual([]);
});
test.afterAll(() => writeFileSync(`${evidenceDir}/browser-evidence.json`, `${JSON.stringify({
  browserConsoleErrors: consoleErrors, pageErrors, failedRequests, screenshots, northStar, syntheticVoice, responsive, accessibleActions, weekProjection, instinctDeduplication,
}, null, 2)}\n`));

test("locked 1672x941 Home keeps four live worlds and exposes the existing utility lenses", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await openElite(page);
  for (const world of ["Calendar", "Journal", "Atmosphere", "Memories"]) await expect(page.getByRole("button", { name: `Open ${world}`, exact: true })).toBeVisible();
  await expect(page.locator("[data-home-calendar-preview]")).toContainText("Lunch");
  await expect(page.getByRole("heading", { name: "Good to know" })).toBeVisible();
  await expect(page.locator("header nav")).toHaveCount(0);
  await expect(page.getByLabel("Global Flow command")).toBeVisible();
  await expect(page.getByLabel("Time scope")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(page, "01-elite-home-1672x941.png");
  // The utility lenses remain real destinations, not hidden Home replicas.
  for (const [utterance, testId] of [["Open focus", "focus-space"], ["Open weather", "weather-outfit-space"], ["Open people", "people-space"], ["Open good to know", "good-to-know-space"]] as const) {
    await command(page, utterance);
    await expect(page.getByTestId(testId)).toBeVisible();
  }
});

test("north-star temporal, outfit, focus proposal, apply, exact undo, and reload path", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await openElite(page);
  await command(page, "Tomorrow.");
  await expect(page.getByText(/Saturday, September 5/i)).toBeVisible();
  await expect(page.getByTestId("elite-today-lens")).toContainText("Creative Review");
  await expect(page.getByTestId("elite-focus-lens")).toContainText("28 min");
  await shot(page, "02-elite-tomorrow.png");

  await command(page, "What should I wear?");
  await expect(page.getByLabel("Global Flow command")).toContainText("Cold and wet");
  await command(page, "Give me 40 minutes before lunch.");
  await expect(page.getByLabel("Global Flow command")).toContainText("You asked for 40 minutes. You have 28 clear.");
  const applyProposal = page.getByRole("button", { name: "Start 28 min" });
  const cancelProposal = page.getByRole("button", { name: "Cancel" });
  expect(await contrastRatio(applyProposal), "proposal action contrast").toBeGreaterThanOrEqual(4.5);
  expect(await contrastRatio(cancelProposal), "cancellation action contrast").toBeGreaterThanOrEqual(4.5);
  await page.getByLabel("Tell Flow what to change").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(applyProposal).toBeFocused();
  expect(await applyProposal.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(0);
  await shot(page, "03-elite-focus-proposal.png");

  await command(page, "Do it.");
  await expect(page.getByTestId("elite-focus-lens")).toContainText("focus session in motion");
  const applied = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(applied.document.focus.active).toMatchObject({ dateKey: "2026-09-05", durationMinutes: 28, status: "active" });
  expect(applied.past).toHaveLength(1);
  await shot(page, "04-elite-focus-active.png");

  await command(page, "Undo.");
  const undone = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(undone.document.focus.active).toBeUndefined();
  expect(undone.past).toHaveLength(0);
  expect(undone.future).toHaveLength(1);
  expect(undone.temporal.scope.dateKey).toBe("2026-09-05");
  await shot(page, "05-elite-exact-undo.png");
  await page.reload();
  await expect(page.getByText(/Saturday, September 5/i)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.focus.active)).toBeUndefined();
  // Back is spatial history; explicit temporal language owns date rewind.
  await command(page, "Previous day.");
  await expect(page.getByText(/Friday, September 4/i)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(0);
  northStar = "PASS";
  accessibleActions = "PASS";
});

test("week scope aggregates every lens and Good to know does not echo visible weather", async ({ page }) => {
  await page.setViewportSize({ width: 1672, height: 941 });
  await openElite(page);
  await command(page, "This week.");
  await expect(page.getByText("Here’s the shape of your week.")).toBeVisible();
  await expect(page.getByTestId("elite-today-lens")).toContainText("7 days");
  await expect(page.getByTestId("elite-focus-lens")).toContainText("across 7 days");
  await expect(page.getByTestId("elite-weather-lens")).toContainText("of 7 days");
  await expect(page.getByTestId("elite-people-lens")).toContainText(/Fri|Sat/);
  await expect(page.getByTestId("elite-weather-lens")).toContainText(/rain risk/i);
  await expect(page.getByTestId("elite-instinct-lens")).not.toContainText(/Rain may catch you|UV is|Sunset at/i);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(0);
  await shot(page, "10-elite-week.png");
  weekProjection = "PASS";
  instinctDeduplication = "PASS";
});

test("clarification choices are readable and hidden Home helpers reveal a real keyboard focus target", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openElite(page);
  await page.evaluate(() => {
    const snapshot = JSON.parse(localStorage.getItem("flow.life.v3")!);
    const active = snapshot.document.calendar;
    active.events = active.events.map((event: { id: string; title: string }) => event.id === "email" ? { ...event, title: "Review email" } : event.id === "roadmap" ? { ...event, title: "Review roadmap" } : event);
    snapshot.document.calendars[active.dateKey] = structuredClone(active);
    localStorage.setItem("flow.life.v3", JSON.stringify(snapshot));
  });
  await page.reload();
  await command(page, "Move review to 3 PM.");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-command-expanded", "true");
  const choices = page.getByLabel("Global Flow command").locator("button").filter({ hasText: /Review/ });
  await expect(choices).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) expect(await contrastRatio(choices.nth(index)), `clarification choice ${index + 1} contrast`).toBeGreaterThanOrEqual(4.5);
  await choices.first().focus();
  await expect(choices.first()).toBeFocused();
  expect(await choices.first().evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");

  const homeHelper = page.locator('[data-home-space-card="inbox"]');
  await homeHelper.focus();
  await expect(homeHelper).toBeVisible();
  const helperBox = await homeHelper.boundingBox();
  expect(helperBox?.width ?? 0).toBeGreaterThan(40);
  expect(helperBox?.height ?? 0).toBeGreaterThanOrEqual(40);
});

test("one synthetic activation keeps final recognition on the shared pipeline", async ({ page }) => {
  await page.addInitScript(() => {
    class Phrase { constructor(public phrase: string, public boost = 1) {} }
    class Recognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = ""; phrases: Phrase[] = [];
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() { (window as Window & { __eliteRecognition?: Recognition }).__eliteRecognition = this; this.onstart?.(); }
      stop() { this.onend?.(); } abort() { this.onend?.(); }
      final(transcript: string) { const result = Object.assign({ 0: { transcript, confidence: 1 }, length: 1 }, { isFinal: true }); this.onresult?.({ results: [result] }); this.onend?.(); }
    }
    const target = window as Window & { SpeechRecognition?: typeof Recognition; SpeechRecognitionPhrase?: typeof Phrase };
    target.SpeechRecognition = Recognition; target.SpeechRecognitionPhrase = Phrase;
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openElite(page);
  await page.getByLabel("Start Flow Live").click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.evaluate(() => (window as Window & { __eliteRecognition?: { final(value: string): void } }).__eliteRecognition?.final("Tomorrow."));
  await expect(page.getByText(/Saturday, September 5/i)).toBeVisible();
  await expect(page.getByLabel("Tell Flow what to change")).toHaveValue("Tomorrow.");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(0);
  await expect.poll(() => page.evaluate(() => Boolean((window as Window & { __eliteRecognition?: unknown }).__eliteRecognition))).toBe(true);
  await expectControlsSeparated(page);
  syntheticVoice = "PASS";
  await shot(page, "06-elite-final-voice.png");
});

test("tablet, mobile, and reduced-motion states preserve access without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openElite(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectControlsSeparated(page);

  // The 630px centered dock and 410px scope with a 48px edge offset first
  // have the required 16px gap at 1,578px. Exercise both sides of that exact boundary and
  // the common widths where the previous xl rule caused occlusion. Do this before
  // any completed command can intentionally recede the initially expanded dock.
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-command-expanded", "true");
  await expect(page.getByLabel("Tell Flow what to change")).toBeVisible();
  for (const width of [1279, 1280, 1366, 1440, 1545, 1559, 1560, 1577, 1578, 1672]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px must not overflow`).toBe(true);
    await expectControlsSeparated(page);
  }
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.getByLabel("Time scope").getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(page.getByText(/Saturday, September 5/i)).toBeVisible();
  await page.getByLabel("Time scope").getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText(/Friday, September 4/i)).toBeVisible();
  await shot(page, "07-elite-tablet.png");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByLabel("Time scope").getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(page.getByText(/Saturday, September 5/i)).toBeVisible();
  await page.getByLabel("Time scope").getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText(/Friday, September 4/i)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectControlsSeparated(page);
  await page.getByLabel("Time scope").getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(page.getByText(/Saturday, September 5/i)).toBeVisible();
  await page.getByLabel("Time scope").getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText(/Friday, September 4/i)).toBeVisible();
  await page.getByRole("heading", { name: "Good to know" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: "Good to know" })).toBeVisible();
  await shot(page, "08-elite-mobile.png");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await command(page, "Tomorrow.");
  await expect(page.locator("main > [data-space-shell]")).toHaveAttribute("data-space-transition-mode", "reduced");
  await shot(page, "09-elite-reduced-motion.png");
  responsive = "PASS";
});
