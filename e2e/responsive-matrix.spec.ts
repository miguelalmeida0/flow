import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidenceDir = process.env.FLOW_RESPONSIVE_EVIDENCE_DIR ?? "artifacts/responsive-matrix";

const viewports = [
  { name: "phone-small", width: 320, height: 568 },
  { name: "phone-modern", width: 390, height: 844 },
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "laptop-short", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop-wide", width: 1920, height: 1080 },
] as const;

const routes = [
  { name: "today", path: "/today" },
  { name: "journal", path: "/journal" },
  { name: "people", path: "/people" },
  { name: "memories", path: "/memories" },
  { name: "capture", path: "/capture" },
  { name: "outcomes", path: "/outcomes" },
  { name: "focus", path: "/focus" },
  { name: "weather-outfit", path: "/weather-outfit" },
  { name: "good-to-know", path: "/good-to-know" },
  { name: "atmosphere", path: "/atmosphere" },
] as const;

async function submitHomeThroughRealForm(page: Page) {
  return page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Tell Flow what to change"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Native input value setter unavailable");
    setter.call(input, "Home");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const form = input.closest("form");
    if (!form) throw new Error("Flow command form missing");
    form.requestSubmit();
    return true;
  });
}

async function activateHome(page: Page) {
  await page.goto("/");
  const home = page.getByTestId("home-space");
  await expect(home).toBeAttached();

  if (await home.getAttribute("data-home-entrance") === "active") return;

  await page.waitForFunction(() =>
    Boolean(document.querySelector('input[aria-label="Tell Flow what to change"]'))
    || Boolean(document.querySelector('button[aria-label="Open Flow command"]')),
    undefined,
    { timeout: 10_000 },
  );

  if (!await submitHomeThroughRealForm(page)) {
    const opened = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Open Flow command"]');
      if (!button) return false;
      button.click();
      return true;
    });
    if (!opened) throw new Error("Flow command surface could not be opened");

    await page.waitForFunction(() =>
      Boolean(document.querySelector('input[aria-label="Tell Flow what to change"]')),
      undefined,
      { timeout: 10_000 },
    );

    if (!await submitHomeThroughRealForm(page)) throw new Error("Flow command form never became available");
  }

  await expect(home).toHaveAttribute("data-home-entrance", "active", { timeout: 10_000 });
}

async function settle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

async function assertViewportIntegrity(page: Page, route: string) {
  await settle(page);
  const result = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-flow-viewport]");
    const main = document.querySelector<HTMLElement>("[data-flow-region='primary']");
    const dock = document.querySelector<HTMLElement>("[data-workspace-dock]");
    const command = document.querySelector<HTMLElement>("[data-flow-region='command']");
    const home = document.querySelector<HTMLElement>("[data-testid='home-space']");
    const time = document.querySelector<HTMLElement>("[data-flow-region='time']");
    if (!root || !main || !dock || !command) throw new Error("Flow shell region missing");

    const rect = (node: HTMLElement) => {
      const r = node.getBoundingClientRect();
      return {
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
        width: r.width,
        height: r.height,
        centerX: r.left + r.width / 2,
      };
    };

    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      root: rect(root),
      main: rect(main),
      dock: rect(dock),
      command: rect(command),
      home: home ? rect(home) : null,
      time: time ? rect(time) : null,
      mainBackground: getComputedStyle(main).backgroundColor,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });

  expect(result.documentScrollWidth, `${route}: document horizontal overflow`).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.bodyScrollWidth, `${route}: body horizontal overflow`).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.root.left).toBeGreaterThanOrEqual(-1);
  expect(result.root.right).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.root.bottom).toBeLessThanOrEqual(result.viewport.height + 1);
  expect(result.dock.left).toBeGreaterThanOrEqual(-1);
  expect(result.dock.right).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.dock.bottom).toBeLessThanOrEqual(result.viewport.height + 1);
  expect(result.command.left).toBeGreaterThanOrEqual(-1);
  expect(result.command.right).toBeLessThanOrEqual(result.viewport.width + 1);
  expect(result.main.bottom).toBeLessThanOrEqual(result.dock.top + 1);
  expect(result.bodyOverflow).toBe("hidden");

  if (result.viewport.width >= 1024) {
    expect(Math.abs(result.command.centerX - result.viewport.width / 2), `${route}: command dock must be centered`).toBeLessThanOrEqual(3);
  }

  if (route === "home") {
    expect(result.home).not.toBeNull();
    expect(result.home!.height, "Home must paint the primary viewport").toBeGreaterThanOrEqual(result.main.height - 2);
    expect(result.mainBackground, "Active Home must not expose the white page canvas").toBe("rgb(242, 232, 219)");
    if (result.time) {
      expect(result.time.left).toBeGreaterThanOrEqual(-1);
      expect(result.time.right).toBeLessThanOrEqual(result.viewport.width + 1);
    }
  }
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));

for (const viewport of viewports) {
  test(`${viewport.name}: every Flow projection stays inside one coherent viewport`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    await activateHome(page);
    await assertViewportIntegrity(page, "home");

    if (viewport.name === "phone-modern" || viewport.name === "desktop-wide") {
      await page.waitForTimeout(850);
      await page.screenshot({ path: `${evidenceDir}/${viewport.name}-home.png`, fullPage: false, caret: "hide" });
    }

    for (const route of routes) {
      await page.goto(route.path);
      await expect(page.locator(`[data-space-shell='${route.name}']`)).toBeVisible();
      await assertViewportIntegrity(page, route.name);

      if (viewport.name === "phone-modern" || viewport.name === "desktop-wide") {
        await page.screenshot({ path: `${evidenceDir}/${viewport.name}-${route.name}.png`, fullPage: false, caret: "hide" });
      }
    }
  });
}
