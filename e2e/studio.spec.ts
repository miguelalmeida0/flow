import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fillCommandField } from "./tide-helpers";

const evidenceDir = "artifacts/living-studio-release";
const errors = new WeakMap<Page, { console: string[]; page: string[]; requests: string[] }>();
const passed = { journal: false, atmosphere: false, memory: false, environment: false, calendar: false };

async function installMediaSeams(page: Page) {
  await page.addInitScript(() => {
    class Recorder {
      static isTypeSupported() { return true; }
      state: "inactive" | "recording" | "paused" = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onstop: ((event: Event) => void) | null = null;
      start() { this.state = "recording"; }
      pause() { this.state = "paused"; }
      resume() { this.state = "recording"; }
      requestData() { this.ondataavailable?.(new BlobEvent("dataavailable", { data: new Blob(["flow-studio-voice"], { type: this.mimeType }) })); }
      stop() { this.state = "inactive"; queueMicrotask(() => this.onstop?.(new Event("stop"))); }
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    (window as unknown as { MediaRecorder: typeof Recorder }).MediaRecorder = Recorder;
    HTMLMediaElement.prototype.play = function play() {
      const runtime = window as Window & { __studioMediaPlays?: number };
      runtime.__studioMediaPlays = (runtime.__studioMediaPlays ?? 0) + 1;
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {};
  });
}

async function fresh(page: Page, path = "/") {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:5173", storageTypes: "all" });
  } finally {
    await session.detach();
  }
  await page.goto(path);
}

async function command(page: Page, transcript: string) {
  const input = await fillCommandField(page, transcript);
  await input.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function shot(page: Page, name: string) {
  await expect(page.locator("main > [data-space-shell]")).toHaveCount(1, { timeout: 3_000 });
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 3_000 });
  await page.waitForTimeout(180);
  await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: true, caret: "hide" });
}

function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));
test.beforeEach(async ({ page, context }) => {
  const found = { console: [] as string[], page: [] as string[], requests: [] as string[] };
  errors.set(page, found);
  page.on("console", (message) => { if (message.type() === "error") found.console.push(message.text()); });
  page.on("pageerror", (error) => found.page.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().startsWith("http://127.0.0.1:5173") && ["document", "script", "stylesheet", "fetch", "xhr"].includes(request.resourceType())) found.requests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText ?? "unknown"}`);
  });
  await installMediaSeams(page);
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
});
test.afterEach(async ({ page }) => {
  const found = errors.get(page)!;
  expect(found.console).toEqual([]);
  expect(found.page).toEqual([]);
  expect(found.requests).toEqual([]);
});
test.afterAll(() => writeFileSync(`${evidenceDir}/browser-evidence.json`, `${JSON.stringify({ ...passed, syntheticMediaRecorder: "PASS", physicalMicrophone: "NOT_PERFORMED" }, null, 2)}\n`));

test("Journal content and bookmarks survive navigation and reload", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await command(page, "Open my journal");
  await expect(page.getByTestId("journal-space")).toBeVisible();
  await page.getByRole("button", { name: "New entry" }).click();
  const editor = page.getByRole("textbox", { name: "Journal text" });
  await editor.fill("The street was quiet after the rain. I finally made the call.");
  await editor.blur();
  await page.getByRole("button", { name: "Bookmark here" }).click();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect.poll(async () => (await snapshot(page)).document.studio.journalEntries[0]).toMatchObject({ status: "saved", text: "The street was quiet after the rain. I finally made the call.", bookmarks: [expect.any(Object)] });
  await command(page, "Home");
  await command(page, "Open the journal area");
  await expect(editor).toHaveValue("The street was quiet after the rain. I finally made the call.");
  await page.reload();
  await expect(page.getByTestId("journal-space")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Journal text" })).toHaveValue("The street was quiet after the rain. I finally made the call.");
  await expect(page.getByTestId("journal-timeline").getByRole("button", { name: /bookmark 1/i })).toBeVisible();
  await shot(page, "01-journal-saved.png");
  passed.journal = true;
});

test("Atmosphere direct manipulation, naming, route continuity, and reload are real", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page, "/atmosphere");
  await page.getByRole("button", { name: "Enter the atmosphere" }).click();
  await expect(page.locator("[data-atmosphere-layer='rain']")).toBeVisible();
  await page.getByRole("button", { name: "Lower Rain" }).click();
  await page.getByRole("button", { name: "Raise Tonal bed" }).click();
  await page.getByLabel("Keep this room").fill("Sunday evening studio");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await command(page, "Home");
  expect((await snapshot(page)).document.studio.activeAtmosphere).toMatchObject({ playing: true, muted: false });
  await page.reload();
  expect((await snapshot(page)).document.studio.atmospherePresets).toContainEqual(expect.objectContaining({ name: "Sunday evening studio" }));
  await command(page, "Play Sunday evening studio");
  expect((await snapshot(page)).document.studio.activeAtmosphere).toMatchObject({ playing: true });
  await command(page, "Open atmosphere");
  await expect(page.getByRole("heading", { name: "Sunday evening studio" })).toBeVisible();
  await shot(page, "02-atmosphere-shaped.png");
  passed.atmosphere = true;
});

test("Memory uses original local media, bookmarked voice, constrained edits, playback, and persistence", async ({ page }) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page, "/journal");
  await page.getByRole("button", { name: "New entry" }).click();
  const editor = page.getByRole("textbox", { name: "Journal text" });
  await editor.fill("The rain stopped just as the street lights came on.");
  await editor.blur();
  const photo = resolve("FLOW_LIVING_ENVIRONMENT_HANDOFF/assets/screens/01-living-home.png");
  await page.locator("input[type='file']").setInputFiles(photo);
  await expect(page.getByRole("button", { name: "Use photo" })).toBeVisible();
  await page.getByRole("button", { name: "Use photo" }).click();
  await page.getByRole("button", { name: "Start recording", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bookmark here" }).click();
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect.poll(async () => (await snapshot(page)).document.studio.mediaAssets.find((asset: { kind: string }) => asset.kind === "journal-audio")?.size).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Make a memory" }).click();
  await expect(page.getByTestId("memories-space")).toBeVisible();
  await page.getByRole("button", { name: "Larger" }).click();
  await command(page, "Remove the voice");
  await command(page, "Bring the voice back");
  await command(page, "Put the date in the corner");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect.poll(async () => (await snapshot(page)).document.studio.memories[0]).toMatchObject({ status: "saved", textScale: 1.12, audioEnabled: true, datePlacement: "corner", photoAssetId: expect.any(String), bookmarkId: expect.any(String) });
  await page.reload();
  await expect(page.getByTestId("memories-space")).toBeVisible();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { __studioMediaPlays?: number }).__studioMediaPlays ?? 0)).toBeGreaterThan(0);
  await shot(page, "03-memory-composed.png");
  passed.memory = true;
});

test("Workspace keeps primary and secondary surfaces, quiets, puts away, and restores", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page);
  await command(page, "Open my journal");
  await page.getByRole("button", { name: "New entry" }).click();
  await page.getByRole("textbox", { name: "Journal text" }).fill("This content must not disappear when the room changes.");
  await page.getByRole("textbox", { name: "Journal text" }).blur();
  await command(page, "Leave the music open beside it");
  await expect(page.locator("[data-secondary-surface='atmosphere']")).toBeVisible();
  expect((await snapshot(page)).document.studio.workspace).toMatchObject({ primary: "journal", secondary: "atmosphere" });
  await command(page, "Show less");
  await expect(page.getByRole("textbox", { name: "Journal text" })).toHaveValue("This content must not disappear when the room changes.");
  expect((await snapshot(page)).document.studio.workspace.quiet).toBe(true);
  await shot(page, "04-workspace-quiet.png");
  await command(page, "Put the journal away");
  await expect(page.getByTestId("home-space")).toBeVisible();
  await command(page, "Go back to what I was doing");
  await expect(page.getByTestId("journal-space")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Journal text" })).toHaveValue("This content must not disappear when the room changes.");
  passed.environment = true;
});

test("Calendar natural move and exact undo redo remain intact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh(page, "/calendar");
  await command(page, "Move my deep work meeting to 4:00 p.m.");
  await expect(page.getByRole("button", { name: /Deep work — project brief, 4 PM–5 PM/ })).toBeVisible();
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect(page.getByRole("button", { name: /Deep work — project brief, 9 AM–10 AM/ })).toBeVisible();
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect(page.getByRole("button", { name: /Deep work — project brief, 4 PM–5 PM/ })).toBeVisible();
  await shot(page, "05-calendar-regression.png");
  passed.calendar = true;
});
