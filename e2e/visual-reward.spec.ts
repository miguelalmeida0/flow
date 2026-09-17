import { expect, test, type Page } from "@playwright/test";
import { fillCommandField } from "./tide-helpers";
import { useNativeAnimationClock } from "./native-clock";
import { measureRegions } from "./real-user-helpers";

test.describe.configure({ mode: "serial" });

interface RewardSnapshot {
  sequence: number;
  active: boolean;
  suppressionReason: string;
  animationCount: number;
  transitionClones: number;
  mascotState: string;
  plan?: { level: number; reducedMotion: boolean; recipe: { family: string; id: string }; facts: Array<Record<string, unknown>> };
  event?: { type: string; source?: string };
}

async function prepare(page: Page, path = "/") {
  await page.clock.install({ time: new Date("2026-09-04T09:32:00") });
  await page.route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await page.goto(path);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator("[data-space-shell]")).toBeVisible();
}

async function command(page: Page, transcript: string) {
  const field = await fillCommandField(page, transcript);
  await field.press("Enter");
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
}

async function reward(page: Page) {
  return page.evaluate(() => (window as Window & { __FLOW_REWARD__?: RewardSnapshot }).__FLOW_REWARD__!);
}

async function injectRecognition(page: Page) {
  await page.addInitScript(() => {
    class Recognition {
      continuous = false; interimResults = false; maxAlternatives = 1; lang = ""; phrases: unknown[] = [];
      onstart: (() => void) | null = null; onresult: ((event: unknown) => void) | null = null; onerror: ((event: unknown) => void) | null = null; onend: (() => void) | null = null;
      start() { const runtime = window as Window & { __flowRewardRecognition?: Recognition; __flowRewardStarts?: number }; runtime.__flowRewardRecognition = this; runtime.__flowRewardStarts = (runtime.__flowRewardStarts ?? 0) + 1; this.onstart?.(); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
      emit(value: string) { const result = Object.assign({ 0: { transcript: value, confidence: 0.9 } }, { isFinal: true, length: 1 }); this.onresult?.({ results: [result] }); }
    }
    (window as Window & { SpeechRecognition?: typeof Recognition }).SpeechRecognition = Recognition;
  });
}

test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
  page.on("pageerror", (error) => failures.push(error.message));
  (page as Page & { rewardFailures?: string[] }).rewardFailures = failures;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { rewardFailures?: string[] }).rewardFailures ?? []).toEqual([]);
});

test("reward is emitted only by a persisted production transaction and settles cleanly", async ({ page }) => {
  await prepare(page, "/today");
  expect(await reward(page)).toMatchObject({ sequence: 0, active: false });
  await command(page, "Invent a purple dimension");
  expect(await reward(page)).toMatchObject({ sequence: 0, active: false });

  const beforeTop = await page.locator('[data-event-id="deep-work"]').boundingBox();
  await command(page, "Move deep work to ten");
  await expect.poll(() => reward(page)).toMatchObject({ active: true, event: { type: "transaction-committed", source: "type" }, plan: { level: 2, recipe: { family: "tide" } } });
  const afterTop = await page.locator('[data-event-id="deep-work"]').boundingBox();
  expect(afterTop?.y).not.toBe(beforeTop?.y);
  await expect(page.locator('[data-reward-target="deep-work"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(() => reward(page), { timeout: 2_000 }).toMatchObject({ active: false, animationCount: 0, transitionClones: 0 });
  await expect(page.locator("[data-reward-wash], [data-reward-target]")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events.find(({ id }: { id: string }) => id === "deep-work").start)).toBe(600);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!));
  expect(stored.past).toHaveLength(1);
  await page.reload();
  expect(await reward(page)).toMatchObject({ sequence: 0, active: false });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(1);
});

test("Home world continuity, time travel, browser Back, and command dock remain mounted", async ({ page }) => {
  await prepare(page, "/");
  await command(page, "Home");
  await expect(page.getByTestId("home-space")).toBeVisible();
  await expect(page.getByLabel("Global Flow command")).toHaveCount(1);
  await page.getByRole("button", { name: /Focus/ }).first().click();
  await expect(page.getByTestId("focus-space")).toBeVisible();
  await expect(page.getByLabel("Global Flow command")).toHaveCount(1);
  expect(await reward(page)).toMatchObject({ event: { type: "world-opened" }, plan: { level: 1, recipe: { family: "tide" } } });
  await page.goBack();
  await expect(page.getByTestId("home-space")).toBeVisible();
  expect((await reward(page)).sequence).toBe(1);

  await command(page, "Tomorrow");
  await expect(page.getByTestId("home-space")).toContainText(/Saturday, September 5/i);
  expect(await reward(page)).toMatchObject({ event: { type: "time-scope-changed" }, plan: { level: 1, recipe: { family: "tide" } } });
  await expect(page.locator("[data-space-shell='home']")).toBeVisible();
});

test("calendar snapshots skip unchanged feedback but measure real geometry and history", async ({ page }) => {
  await useNativeAnimationClock(page);
  await page.goto("/today");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await expect(page.locator('[data-event-id="deep-work"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
  await page.evaluate(() => {
    const runtime = window as Window & { __eventMeasurements?: string[]; __restoreMeasurements?: () => void };
    const original = Element.prototype.getBoundingClientRect;
    runtime.__eventMeasurements = [];
    Element.prototype.getBoundingClientRect = function () {
      const id = this.getAttribute("data-event-id");
      if (id) runtime.__eventMeasurements!.push(id);
      return original.call(this);
    };
    runtime.__restoreMeasurements = () => { Element.prototype.getBoundingClientRect = original; };
  });
  const measurements = () => page.evaluate(() => (window as Window & { __eventMeasurements?: string[] }).__eventMeasurements ?? []);
  try {
    await command(page, "What changed?");
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await measurements()).toEqual([]);
    await command(page, "Move deep work to ten");
    await expect.poll(measurements).toContain("deep-work");
    await expect(page.locator('[data-event-id="deep-work"]')).toHaveAttribute("aria-label", /10 AM–11 AM/);
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter(({ playState }) => playState === "running").length)).toBe(0);
    await page.evaluate(() => { (window as Window & { __eventMeasurements?: string[] }).__eventMeasurements = []; });
    await command(page, "Undo");
    await expect.poll(measurements).toContain("deep-work");
    await expect(page.locator('[data-event-id="deep-work"]')).toHaveAttribute("aria-label", /9 AM–10 AM/);
    await command(page, "Redo");
    await expect(page.locator('[data-event-id="deep-work"]')).toHaveAttribute("aria-label", /10 AM–11 AM/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).past.length)).toBe(1);
  } finally {
    await page.evaluate(() => (window as Window & { __restoreMeasurements?: () => void }).__restoreMeasurements?.());
  }
});

test("Home mascot remains in reserved clear space through wrapped, short, and remote Home states", async ({ page }) => {
  await useNativeAnimationClock(page);
  await injectRecognition(page);
  await page.context().route("https://api.open-meteo.com/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: '{"daily":{"time":[]}}' }));
  await page.setViewportSize({ width: 1672, height: 941 });
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  const mascot = page.locator("[data-mascot-renderer]");
  await expect(mascot).toHaveAttribute("data-mascot-state", "resting");
  const expectClear = async () => {
    await expect(mascot).toBeVisible();
    await expect.poll(async () => (await measureRegions(page, { mascot: "[data-mascot-form='sprout']", hero: "[data-home-hero]", dock: "[data-workspace-dock]" })).overlaps).toEqual([]);
    await expect(mascot).toHaveAttribute("data-mascot-safe-zone", "clear");
  };
  await page.getByRole("button", { name: "Start Flow Live" }).click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveAttribute("data-mascot-safe-zone", "clear");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 1672, height: 650 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expectClear();
    await expect(page.getByLabel("Global Flow command")).toBeVisible();
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await command(page, "Tomorrow");
  await expect(page.getByTestId("home-space")).toContainText("Saturday, September 5");
  await expectClear();
  await command(page, "Open focus");
  await page.goBack();
  await expect(page.getByTestId("home-space")).toBeVisible();
  await expectClear();
  const beforeRemote = (await reward(page)).sequence;
  const other = await page.context().newPage();
  await useNativeAnimationClock(other);
  await other.goto("/");
  await command(other, "Today");
  await expect(page.getByTestId("home-space")).toContainText("Friday, September 4");
  expect((await reward(page)).sequence).toBe(beforeRemote);
  await expectClear();
  await other.close();
  await page.setViewportSize({ width: 1672, height: 941 });
  await expect(mascot).toBeVisible();
  await expect(mascot).toHaveAttribute("data-mascot-safe-zone", "clear");
  expect(await page.evaluate(() => (window as Window & { __flowRewardStarts?: number }).__flowRewardStarts)).toBe(1);
  await page.getByRole("button", { name: "Stop Flow Live" }).click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "sleeping");
  await expectClear();
});

test("a final browser-recognition intent emits a bounded acknowledgment before its domain reward", async ({ page }) => {
  await injectRecognition(page);
  await prepare(page, "/today");
  await page.getByRole("button", { name: "Start Flow Live" }).click();
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  await page.evaluate(() => {
    (window as Window & { __FLOW_REWARD_EVENT_LOG__?: unknown[] }).__FLOW_REWARD_EVENT_LOG__ = [];
    (window as Window & { __flowRewardRecognition?: { emit(value: string): void } }).__flowRewardRecognition!.emit("Move deep work to ten");
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events.find(({ id }: { id: string }) => id === "deep-work").start)).toBe(600);
  const log = await page.evaluate(() => (window as Window & { __FLOW_REWARD_EVENT_LOG__?: Array<{ type: string; level: number }> }).__FLOW_REWARD_EVENT_LOG__ ?? []);
  expect(log.map(({ type }) => type)).toEqual(["voice-understood", "transaction-committed"]);
  expect(log.map(({ level }) => level)).toEqual([1, 2]);
});

test("Today actions map to proportional Tide, Bloom, and Anchor consequences", async ({ page }) => {
  await prepare(page, "/today");
  await expect(page.locator('[data-event-id="lunch"] [data-importance-marker]')).toHaveCSS("opacity", "1");
  await command(page, "Add a 30 minute planning session at ten");
  await expect(page.getByRole("button", { name: /Planning session, 10 AM–10:30 AM/ })).toBeVisible();
  expect(await reward(page)).toMatchObject({ plan: { level: 2, recipe: { family: "bloom" } } });

  await command(page, "Make deep work red and important");
  await expect(page.locator('[data-event-id="deep-work"]')).toHaveAttribute("data-color", "red");
  await expect(page.locator('[data-event-id="deep-work"]')).toHaveAttribute("data-importance", "important");
  await expect(page.locator('[data-event-id="deep-work"] [data-importance-marker]')).toHaveCSS("opacity", "1");
  expect((await reward(page)).plan?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "event-styled", eventId: "deep-work" })]));

  await command(page, "Protect deep work");
  await expect(page.locator('[data-event-id="deep-work"]')).toHaveAttribute("data-protected", "true");
  expect(await reward(page)).toMatchObject({ plan: { level: 2, recipe: { family: "anchor" } } });
});

test("Tide recovery keeps anchors stable, produces one Level 3 plan, and undo interrupts it safely", async ({ page }) => {
  await prepare(page, "/today");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document);
  await command(page, "I'm 35 minutes behind, keep dinner at 7, move low priority work to tomorrow, and give me 20 minutes before the interview");
  await expect.poll(() => reward(page)).toMatchObject({ active: true, plan: { level: 3, recipe: { family: "tide" } } });
  await expect(page.locator('[data-event-id="dinner"]')).toHaveAttribute("aria-label", /7 PM–8 PM/);
  const recovered = await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document);
  await page.getByRole("button", { name: "Undo last change" }).click();
  await expect.poll(() => reward(page)).toMatchObject({ event: { type: "history-restored" }, plan: { level: 1, recipe: { family: "neutral" } } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(before);
  await page.getByRole("button", { name: "Redo last change" }).click();
  await expect.poll(() => reward(page)).toMatchObject({ event: { type: "history-restored", direction: "redo" }, plan: { level: 2, recipe: { family: "neutral" } } });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document)).toEqual(recovered);
  await expect.poll(() => reward(page), { timeout: 2_000 }).toMatchObject({ active: false, animationCount: 0 });
});

test("Capture routing uses real shared-state continuity and leaves no transition residue", async ({ page }) => {
  await prepare(page, "/capture");
  await command(page, "Capture renew passport before Senegal");
  await expect(page.getByRole("button", { name: "Renew passport before Senegal" })).toBeVisible();
  await page.getByRole("button", { name: "Renew passport before Senegal" }).click();
  const before = (await reward(page)).sequence;
  await command(page, "Turn that into an outcome");
  await expect(page.locator("[data-transition-clone-count='1']")).toBeVisible();
  expect((await reward(page)).plan?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "capture-routed", destination: "outcome" })]));
  await expect(page.getByTestId("plan-detail")).toBeVisible({ timeout: 2_000 });
  await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0, { timeout: 2_500 });
  expect((await reward(page)).sequence).toBe(before + 1);
  expect((await reward(page)).plan?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "capture-routed", destination: "outcome" })]));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.captures[0].status)).toBe("resolved");
});

test("shared-flight paper reshapes without stretching its rendered text", async ({ page }) => {
  await useNativeAnimationClock(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/capture");
  await command(page, "Capture renew passport before Senegal");
  await page.getByRole("button", { name: "Renew passport before Senegal", exact: true }).click();
  await page.evaluate(() => {
    const runtime = window as Window & { __flightTextAudit?: Array<{ width: number; height: number; paperScale: number; clones: number }>; __stopFlightTextAudit?: () => void };
    runtime.__flightTextAudit = [];
    let frame = 0;
    const sample = () => {
      const title = document.querySelector<HTMLElement>("[data-transition-title]");
      const paper = document.querySelector<HTMLElement>("[data-transition-paper]");
      if (title && paper) {
        const rect = title.getBoundingClientRect();
        runtime.__flightTextAudit!.push({ width: rect.width / title.offsetWidth, height: rect.height / title.offsetHeight, paperScale: paper.getBoundingClientRect().height / paper.offsetHeight, clones: document.querySelectorAll("[data-transition-clone-count]").length });
      }
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
    runtime.__stopFlightTextAudit = () => cancelAnimationFrame(frame);
  });
  try {
    await command(page, "Turn that into an outcome");
    await expect(page.getByTestId("plan-detail")).toBeVisible();
    await expect(page.locator("[data-transition-clone-count]")).toHaveCount(0);
    const samples = await page.evaluate(() => (window as Window & { __flightTextAudit?: Array<{ width: number; height: number; paperScale: number; clones: number }> }).__flightTextAudit ?? []);
    expect(samples.length).toBeGreaterThan(5);
    expect(samples.some(({ paperScale }) => Math.abs(paperScale - 1) > 0.05)).toBe(true);
    for (const sample of samples) {
      expect(sample.width).toBeCloseTo(1, 2);
      expect(sample.height).toBeCloseTo(1, 2);
      expect(sample.clones).toBe(1);
    }
  } finally {
    await page.evaluate(() => (window as Window & { __stopFlightTextAudit?: () => void }).__stopFlightTextAudit?.());
  }
});

test("meaningful focus completion is elapsed-time based and earns Level 3", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-04T10:32:00") });
  await prepare(page, "/focus");
  await command(page, "Give me five minutes");
  await command(page, "Do it");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.focus.active?.durationMinutes)).toBe(5);
  await page.clock.fastForward(4 * 60 * 1_000);
  await command(page, "Stop focus");
  await expect.poll(() => reward(page)).toMatchObject({ plan: { level: 3, recipe: { family: "bloom" } } });
  expect((await reward(page)).plan?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "focus-completed", meaningful: true })]));
  await expect(page.getByText(/minutes protected\./)).toBeVisible();
  await expect(page.locator("[data-mascot-renderer]")).toHaveCount(0);
});

test("a completed outcome and kept commitment receive rare semantic ceremonies", async ({ page }) => {
  await prepare(page, "/outcomes");
  await command(page, "I need to draft a report");
  for (const step of ["Define the audience and outcome", "Draft the structure", "Review and deliver"]) await command(page, `Mark ${step} complete`);
  await command(page, "Complete this outcome");
  await expect.poll(() => reward(page)).toMatchObject({ plan: { level: 3, recipe: { family: "bloom" } } });
  expect((await reward(page)).plan?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "outcome-completed" })]));

  await command(page, "Show commitments");
  await command(page, "I promised Maya the proposal by Friday");
  await command(page, "Mark proposal promise to Maya complete");
  await expect.poll(() => reward(page)).toMatchObject({ plan: { level: 3, recipe: { family: "anchor" } } });
  expect((await reward(page)).plan?.facts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "commitment-kept" })]));
  await expect(page.getByTestId("people-space").getByText("Promise kept")).toBeVisible();
  await expect(page.getByText(/With Maya · relationship preserved/)).toBeVisible();
});

test("sound is opt-in, reduced motion is explicit, hidden rewards suppress, and minimal mascot stays quiet", async ({ page }) => {
  await prepare(page, "/today");
  expect(await page.evaluate(() => (window as Window & { __FLOW_SOUND__?: { contextsCreated: number } }).__FLOW_SOUND__?.contextsCreated ?? 0)).toBe(0);
  await page.getByRole("button", { name: "Reward and motion settings" }).click();
  await page.getByRole("button", { name: "Off" }).click();
  await command(page, "Move deep work to ten");
  await expect.poll(() => reward(page)).toMatchObject({ plan: { reducedMotion: false }, audioContextState: "running" });
  expect(await page.evaluate(() => (window as Window & { __FLOW_SOUND__?: { contextsCreated: number; playCount: number } }).__FLOW_SOUND__)).toMatchObject({ contextsCreated: 1, playCount: 1 });

  await page.getByRole("button", { name: "Reward and motion settings" }).click();
  await page.getByRole("radio", { name: "Reduced" }).click();
  await page.getByRole("radio", { name: "Minimal" }).click();
  // The seeded deep-work block is already high priority. Use a real style
  // transition so this assertion observes a newly committed reward rather
  // than the preceding move plan after a legitimate no-op.
  await command(page, "Make deep work red");
  await expect.poll(() => reward(page)).toMatchObject({ plan: { reducedMotion: true } });
  expect(await page.evaluate(() => (window as Window & { __FLOW_SOUND__?: { playCount: number } }).__FLOW_SOUND__?.playCount)).toBe(1);
  await expect(page.locator('[data-mascot-state="resolved"], [data-mascot-state="small-win"]')).toHaveCount(0);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await command(page, "Make email 20 minutes");
  expect(await reward(page)).toMatchObject({ active: false, suppressionReason: "hidden-tab" });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("flow.life.v3")!).document.calendar.events.find(({ id }: { id: string }) => id === "email").end)).toBe(680);
});
