import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { acceptanceDirectory, acceptanceShot, acceptanceViewports, armTargetScreenshot, finalSpeech, installAcceptanceRecognition, interimSpeech, lifeSnapshot, measureRegions, nativeMediaEvidence, settledHomeShot, startAcceptance, typedCommand } from "./real-user-helpers";
import { observeAcceptanceRequests } from "./media-request-observer";

const errors = new WeakMap<Page, { console: string[]; page: string[]; requests: string[] }>();
const requestEvidence = new WeakMap<Page, Awaited<ReturnType<typeof observeAcceptanceRequests>>>();
test.use({ viewport: { width: 1440, height: 900 }, launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] }, trace: "on" });
test.beforeAll(() => mkdirSync(acceptanceDirectory, { recursive: true }));
test.beforeEach(async ({ page, context }) => {
  const found = { console: [] as string[], page: [] as string[], requests: [] as string[] }; errors.set(page, found);
  page.on("console", (message) => { if (message.type() === "error") found.console.push(message.text()); });
  page.on("pageerror", (error) => found.page.push(error.message));
  requestEvidence.set(page, await observeAcceptanceRequests(page));
  await context.grantPermissions(["microphone"]);
  await context.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await installAcceptanceRecognition(page);
});
test.afterEach(async ({ page }, info) => {
  const found = errors.get(page)!;
  const requests = requestEvidence.get(page)!();
  found.requests = requests.requests;
  await info.attach("all-origin-request-lifecycle", { body: JSON.stringify(requests, null, 2), contentType: "application/json" });
  const diagnostic = await page.evaluate(() => ({ route: location.pathname, transcript: document.querySelector("[aria-label='Global Flow command']")?.getAttribute("data-last-transcript"), motion: (window as Window & { __FLOW_LOCKED_HOME__?: unknown }).__FLOW_LOCKED_HOME__, snapshot: JSON.parse(localStorage.getItem("flow.life.v3") ?? "null") })).catch(() => undefined);
  await info.attach("semantic-and-media-state", { body: JSON.stringify({ diagnostic, errors: found }, null, 2), contentType: "application/json" });
  const status = found.console.length || found.page.length || found.requests.length ? "failed" : info.status;
  // Playwright replaces failed workers. Each journey owns one durable record;
  // a replacement's afterAll must not erase preceding outcomes or label an
  // afterEach failure as passed merely because the test body had completed.
  writeFileSync(`${acceptanceDirectory}/journey-${info.title.slice(0, 2)}.json`, JSON.stringify({ title: info.title, status, errors: { ...found, requestEvidence: requests } }, null, 2));
  expect(found).toEqual({ console: [], page: [], requests: [] });
});
test.afterAll(() => {
  const results = readdirSync(acceptanceDirectory).filter((name) => /^journey-\d{2}\.json$/.test(name)).sort().map((name) => JSON.parse(readFileSync(`${acceptanceDirectory}/${name}`, "utf8")));
  writeFileSync(`${acceptanceDirectory}/browser-evidence.json`, JSON.stringify({ expectedJourneys: 12, recordedJourneys: results.length, complete: results.length === 12, recognition: "synthetic final-transcript adapter", recording: "native MediaRecorder and native decode/play/seek using Chromium synthetic microphone", physicalMicrophone: "NOT RUN — separate human acceptance required", results }, null, 2));
});

test("01 wake composition stays separated at all required desktop widths and reduced heights", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const sizes = new Map([...acceptanceViewports, ...[1280, 1440, 1512, 1728, 1920].flatMap((w) => [768, 800, 900, 982].map((h) => [w, h] as const))].map(([w, h]) => [`${w}x${h}`, { width: w, height: h }]));
  const geometry = [];
  for (const [name, viewport] of sizes) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
    const read = () => measureRegions(page, { title: "[data-home-hero] h1", support: "[data-home-transcript]", mascot: "[data-mascot-form='sprout']", indicator: "[data-home-composition] > [data-voice-energy]", dock: "[data-workspace-dock]" });
    await expect.poll(async () => (await read()).overlaps).toEqual([]);
    const sample = await read(); expect(sample.rectangles).toHaveLength(5);
    for (const rect of sample.rectangles) { expect(rect.unclipped.top, `${name} ${rect.name}`).toBeGreaterThanOrEqual(0); expect(rect.unclipped.bottom, `${name} ${rect.name}`).toBeLessThanOrEqual(viewport.height + 1); }
    geometry.push(sample);
    if (name === "1280x720") await acceptanceShot(page, "01-wake");
  }
  writeFileSync(`${acceptanceDirectory}/wake-viewport-geometry.json`, JSON.stringify(geometry, null, 2));
});

test("02 one activation paints wake reward and settles into a usable listening Home", async ({ page }) => {
  await startAcceptance(page);
  await finalSpeech(page, "Flow");
  await expect(page.getByRole("heading", { name: "Hi there!" })).toBeVisible();
  await acceptanceShot(page, "02-wake-reward");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active", { timeout: 6_000 });
  await expect(page.getByTestId("locked-home-previews")).toBeVisible();
  await expect(page.getByLabel("Stop Flow Live")).toBeVisible();
  await settledHomeShot(page, "03-home-listening");
  expect((await lifeSnapshot(page)).past).toHaveLength(0);
});

test("03 Home final navigation commits a real route after an interim, without writing user data", async ({ page }) => {
  await startAcceptance(page);
  await finalSpeech(page, "Flow");
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "active");
  const before = await lifeSnapshot(page);
  const saveTargetScreenshot = await armTargetScreenshot(page);
  await interimSpeech(page, "open calendar");
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as Window & { __acceptanceRecognition?: { emit(text: string, final: boolean): void } }).__acceptanceRecognition!.emit("open calendar", true));
  await expect(page.getByTestId("home-space")).toHaveAttribute("data-voice-phase", "targeting");
  await expect(page.locator("[data-voice-target-acknowledgement][data-voice-action-id]")).toBeVisible();
  await expect(page).toHaveURL(/\/today$/);
  await saveTargetScreenshot("04-home-calendar-targeted");
  await expect(page.getByRole("heading", { name: "Breathing Day" })).toBeVisible();
  const after = await lifeSnapshot(page);
  expect(after.document.captures).toEqual(before.document.captures);
  expect(after.past).toEqual(before.past);
  await acceptanceShot(page, "05-calendar-open");
});

test("04 explicit adjectival time and called-name create one correctly scoped event through typing", async ({ page }) => {
  await page.goto("/today");
  await typedCommand(page, "Show tomorrow");
  const before = await lifeSnapshot(page);
  const visibleDate = before.temporal!.scope.dateKey;
  const existingIds = new Set(before.document.calendar.events.map(({ id }) => id));
  await typedCommand(page, "book an 8 a.m. meeting called Dentist");
  await expect.poll(async () => (await lifeSnapshot(page)).document.calendar.events.filter(({ id }) => !existingIds.has(id))).toEqual([expect.objectContaining({ title: "Dentist", start: 480, end: 510, dateKey: visibleDate })]);
  const after = await lifeSnapshot(page);
  expect(after.document.calendar.events).toHaveLength(before.document.calendar.events.length + 1);
  expect(after.document.calendar.events.filter(({ id }) => existingIds.has(id))).toEqual(before.document.calendar.events);
  expect({ ...after.document.calendars, [visibleDate]: undefined }).toEqual({ ...before.document.calendars, [visibleDate]: undefined });
  expect(after.past.length).toBe(before.past.length + 1);
  await expect(page.getByRole("button", { name: /Dentist, 8 AM–8:30 AM/ })).toBeVisible();
  await acceptanceShot(page, "06-calendar-created-event");
});

test("05 final voice creation and zero-selection follow-up retain exact ID, geometry, undo and redo", async ({ page }) => {
  await startAcceptance(page, "/today");
  await finalSpeech(page, "Show tomorrow");
  const before = await lifeSnapshot(page);
  const visibleDate = before.temporal!.scope.dateKey;
  const existingIds = new Set(before.document.calendar.events.map(({ id }) => id));
  await finalSpeech(page, "book an 8:00 a.m. meeting calls dentist");
  await expect.poll(async () => (await lifeSnapshot(page)).document.calendar.events.filter(({ id }) => !existingIds.has(id)).length).toBe(1);
  const createdSnapshot = await lifeSnapshot(page);
  const created = createdSnapshot.document.calendar.events.find(({ id }) => !existingIds.has(id))!;
  expect(created).toMatchObject({ title: "Dentist", dateKey: visibleDate, start: 480, end: 510 });
  expect(createdSnapshot.past.length).toBe(before.past.length + 1);
  await finalSpeech(page, "move it to 9");
  await expect.poll(async () => (await lifeSnapshot(page)).document.calendar.events.find(({ id }) => id === created.id)).toMatchObject({ id: created.id, start: 540, end: 570 });
  const movedSnapshot = await lifeSnapshot(page);
  const moved = movedSnapshot.document;
  expect(movedSnapshot.past.length).toBe(createdSnapshot.past.length + 1);
  expect(moved.calendar.events.map(({ id }) => id).sort()).toEqual(createdSnapshot.document.calendar.events.map(({ id }) => id).sort());
  for (const prior of before.document.calendar.events) {
    const current = moved.calendar.events.find(({ id }) => id === prior.id)!;
    expect({ ...current, start: prior.start, end: prior.end }).toEqual(prior);
    expect(current.end - current.start).toBe(prior.end - prior.start);
    if (prior.kind !== "flexible" || prior.protected) expect(current).toEqual(prior);
    expect(current.end <= 540 || current.start >= 570).toBe(true);
  }
  expect({ ...moved.calendars, [visibleDate]: undefined }).toEqual({ ...before.document.calendars, [visibleDate]: undefined });
  await finalSpeech(page, "undo");
  await expect.poll(async () => (await lifeSnapshot(page)).document).toEqual(createdSnapshot.document);
  await finalSpeech(page, "redo");
  await expect.poll(async () => (await lifeSnapshot(page)).document).toEqual(moved);
  await expect(page.locator(`button[data-event-id='${created.id}']`)).toHaveAccessibleName(/9 AM–9:30 AM/);
});

test("06 native recording survives live command interruption, route return, bookmark, Atmosphere, reload and native playback", async ({ page }) => {
  test.setTimeout(100_000);
  await startAcceptance(page, "/journal");
  await finalSpeech(page, "new journal entry");
  const beforeRecording = await lifeSnapshot(page);
  await finalSpeech(page, "start with my voice");
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.mediaAssets.length).toBe(1);
  expect((await lifeSnapshot(page)).past.length).toBe(beforeRecording.past.length + 1);
  const started = Date.now();
  await finalSpeech(page, "Today I went for a walk.");
  await finalSpeech(page, "It was cool.");
  await expect(page.getByRole("textbox", { name: "Journal text" })).toHaveValue("Today I went for a walk. It was cool.");
  await expect(page.getByLabel("Journal recording controls")).toHaveAttribute("data-media-state", "recording");
  await expect(page.getByText(/recording could not be loaded/)).toHaveCount(0);
  await acceptanceShot(page, "07-journal-recording");
  await finalSpeech(page, "go to homepage");
  await expect(page).toHaveURL(/\/$/);
  expect((await lifeSnapshot(page)).document.studio.journalEntries[0]!.text).toBe("Today I went for a walk. It was cool.");
  await acceptanceShot(page, "08-journal-command-interrupt");
  await finalSpeech(page, "open journal");
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeVisible();
  await finalSpeech(page, "bookmark that");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.bookmarks.length).toBe(1);
  await acceptanceShot(page, "09-journal-return");
  const beforeAtmosphere = await lifeSnapshot(page);
  await finalSpeech(page, "play Sunday evening");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.activeAtmosphere?.playing).toBe(true);
  expect((await lifeSnapshot(page)).past.length).toBe(beforeAtmosphere.past.length + 1);
  await finalSpeech(page, "undo");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.activeAtmosphere).toEqual(beforeAtmosphere.document.studio.activeAtmosphere);
  await page.waitForTimeout(Math.max(0, 10_500 - (Date.now() - started)));
  await finalSpeech(page, "stop recording");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.recordingState).toBe("idle");
  const entry = (await lifeSnapshot(page)).document.studio.journalEntries[0]!;
  expect(entry.recordingDurationMs).toBeGreaterThanOrEqual(10_000);
  expect(entry.text).toBe("Today I went for a walk. It was cool.");
  const media = await nativeMediaEvidence(page, entry.audioAssetId!);
  expect(media.decodedSeconds).toBeGreaterThanOrEqual(10);
  expect(media.bytes).toBeGreaterThan(1000);
  await finalSpeech(page, "save entry");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.status).toBe("saved");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Journal text" })).toHaveValue(entry.text);
  const audio = page.locator("audio[controls]");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await audio.click({ position: { x: 18, y: 27 } });
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0.3);
  await page.getByRole("button", { name: /Select and play bookmark 1/ }).click();
  const seekSeconds = entry.bookmarks[0]!.timestampMs / 1000;
  expect(seekSeconds).toBeGreaterThan(1);
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThanOrEqual(seekSeconds - 0.15);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeLessThan(seekSeconds + 0.8);
  const playback = await audio.evaluate((element: HTMLAudioElement) => ({ currentTime: element.currentTime, paused: element.paused, error: element.error?.message ?? null, readyState: element.readyState }));
  expect(playback.paused).toBe(false); expect(playback.error).toBeNull();
  writeFileSync(`${acceptanceDirectory}/native-media-evidence.json`, JSON.stringify({ syntheticHardware: true, physicalMicrophone: false, media, playback, entry }, null, 2));
  await acceptanceShot(page, "10-journal-reload-audio");
});

test("07 prose identity distinguishes duplicate delivery from intentional repeated speech", async ({ page }) => {
  await startAcceptance(page, "/journal");
  await finalSpeech(page, "Let me talk for a while");
  await finalSpeech(page, "It was cool.", true);
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.transcriptSegments.length).toBe(1);
  await finalSpeech(page, "It was cool.");
  await finalSpeech(page, "I wanted to go home after the long day.");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.transcriptSegments.length).toBe(3);
  expect((await lifeSnapshot(page)).document.studio.journalEntries[0]!.text).toBe("It was cool. It was cool. I wanted to go home after the long day.");
  await finalSpeech(page, "stop recording");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.recordingState).toBe("idle");
});

test("08 typed Journal controls bookmark and navigate as one atomic cross-space request", async ({ page }) => {
  await page.goto("/journal");
  await typedCommand(page, "Journal this A clear thought worth keeping.");
  const before = await lifeSnapshot(page);
  await typedCommand(page, "bookmark that and go home");
  await expect(page).toHaveURL(/\/$/);
  const after = await lifeSnapshot(page);
  expect(after.past.length).toBe(before.past.length + 1);
  expect(after.document.studio.journalEntries[0]!.bookmarks).toHaveLength(1);
  await typedCommand(page, "undo");
  await expect.poll(async () => (await lifeSnapshot(page)).document).toEqual(before.document);
  await typedCommand(page, "redo");
  await expect.poll(async () => (await lifeSnapshot(page)).document).toEqual(after.document);
});

test("09 unsupported and alternative navigation do not create data or pollute dictation", async ({ page }) => {
  await startAcceptance(page, "/journal");
  await finalSpeech(page, "Let me talk for a while");
  const before = await lifeSnapshot(page);
  await finalSpeech(page, "open the calendar or journal");
  await expect(page.getByText("Which place should I open?", { exact: true })).toBeVisible();
  expect((await lifeSnapshot(page)).document.studio.journalEntries[0]!.text).toBe("");
  expect((await lifeSnapshot(page)).past).toEqual(before.past);
  await finalSpeech(page, "stop recording");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.recordingState).toBe("idle");
  const stopped = await lifeSnapshot(page);
  await typedCommand(page, "make a dinosaur do my taxes");
  expect((await lifeSnapshot(page)).document.captures).toEqual(stopped.document.captures);
  expect((await lifeSnapshot(page)).past).toEqual(stopped.past);
});

test("10 confirmed recording discard remains reversible with a durable audio reference", async ({ page }) => {
  await startAcceptance(page, "/journal");
  await finalSpeech(page, "Let me talk for a while");
  await page.waitForTimeout(1300);
  await finalSpeech(page, "stop recording");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.recordingState).toBe("idle");
  const before = await lifeSnapshot(page);
  const assetId = before.document.studio.journalEntries[0]!.audioAssetId!;
  await typedCommand(page, "discard recording");
  expect((await lifeSnapshot(page)).past).toEqual(before.past);
  await typedCommand(page, "confirm");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.audioAssetId).toBeUndefined();
  await typedCommand(page, "undo");
  await expect.poll(async () => (await lifeSnapshot(page)).document.studio.journalEntries[0]!.audioAssetId).toBe(assetId);
  expect((await nativeMediaEvidence(page, assetId)).decodedSeconds).toBeGreaterThan(0.5);
});

test("11 secondary Atmosphere and voice are reserved outside the editable workspace at seven viewports", async ({ page }) => {
  await startAcceptance(page, "/journal");
  await typedCommand(page, "Journal this A quiet place to think.");
  await typedCommand(page, "Play Sunday evening");
  await expect(page.locator("[data-secondary-surface='atmosphere']")).toBeVisible();
  const geometry = [];
  for (const [width, height] of acceptanceViewports) {
    await page.setViewportSize({ width, height });
    await interimSpeech(page, "I am still thinking");
    const sample = await measureRegions(page, { content: "[data-primary-content-rect]", dock: "[data-workspace-dock]" });
    expect(sample.overlaps).toEqual([]); expect(sample.rectangles).toHaveLength(2);
    expect(sample.rectangles.find(({ name }) => name === "dock")!.height).toBeLessThan(height * 0.3);
    geometry.push(sample);
    const controls = await measureRegions(page, { editor: "textarea[aria-label='Journal text']", actions: "[data-page-actions]", secondary: "[data-secondary-surface='atmosphere']", voice: "[aria-label='Global Flow command']" });
    expect(controls.rectangles).toHaveLength(4); expect(controls.overlaps).toEqual([]);
    geometry.push(controls);
    await page.getByRole("textbox", { name: "Journal text" }).fill("The editor remains reachable with the room playing.");
    await page.getByRole("textbox", { name: "Journal text" }).blur();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await acceptanceShot(page, "11-atmosphere-secondary");
  writeFileSync(`${acceptanceDirectory}/workspace-viewport-geometry.json`, JSON.stringify(geometry, null, 2));
});

test("12 Home and Calendar share one temporal scope through navigation and reload", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/today");
  await typedCommand(page, "Show tomorrow");
  const before = await lifeSnapshot(page);
  const date = before.temporal!.scope.dateKey;
  const existingIds = new Set(before.document.calendar.events.map(({ id }) => id));
  await typedCommand(page, "book Dentist at eight");
  await typedCommand(page, "Home");
  await expect(page.locator("[data-home-domain='today']")).toContainText(date);
  await typedCommand(page, "open calendar");
  await expect(page.getByRole("heading", { name: "Breathing Day" })).toBeVisible();
  expect((await lifeSnapshot(page)).document.calendar.dateKey).toBe(date);
  await typedCommand(page, "Home"); await page.reload();
  await typedCommand(page, "Home");
  await expect(page.locator("[data-home-domain='today']")).toContainText(date);
  const reloaded = await lifeSnapshot(page);
  expect(reloaded.document.calendar.events.filter(({ id }) => !existingIds.has(id))).toEqual([expect.objectContaining({ title: "Dentist", start: 480, dateKey: date })]);
  expect(reloaded.document.calendar.events.filter(({ id }) => existingIds.has(id))).toEqual(before.document.calendar.events);
  expect({ ...reloaded.document.calendars, [date]: undefined }).toEqual({ ...before.document.calendars, [date]: undefined });
  const geometry = [];
  for (const [width, height] of acceptanceViewports) {
    await page.setViewportSize({ width, height });
    const read = () => measureRegions(page, { hero: "[data-home-hero]", mascot: "[data-mascot-form='sprout']", dock: "[data-workspace-dock]" });
    await expect.poll(async () => (await read()).overlaps).toEqual([]);
    const sample = await read(); expect(sample.rectangles).toHaveLength(3); geometry.push({ surface: "Home", ...sample });
  }
  await typedCommand(page, "open calendar");
  for (const [width, height] of acceptanceViewports) {
    await page.setViewportSize({ width, height });
    const read = () => measureRegions(page, { calendar: "[data-testid='calendar-space']", voice: "[aria-label='Global Flow command']" });
    await expect.poll(async () => (await read()).overlaps).toEqual([]);
    const sample = await read(); expect(sample.rectangles).toHaveLength(2); geometry.push({ surface: "Calendar", ...sample });
  }
  writeFileSync(`${acceptanceDirectory}/home-calendar-viewport-geometry.json`, JSON.stringify(geometry, null, 2));
  await page.setViewportSize({ width: 1440, height: 900 });
  await typedCommand(page, "Home");
  await settledHomeShot(page, "12-home-reload");
});
