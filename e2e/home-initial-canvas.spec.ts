import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const evidenceDir = process.env.FLOW_INITIAL_CANVAS_EVIDENCE_DIR ?? "artifacts/initial-canvas";

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "desktop-wide", width: 1920, height: 1080 },
] as const;

async function inspect(page: Page) {
  await page.goto("/");
  const home = page.getByTestId("home-space");
  await expect(home).toBeVisible();

  await page.evaluate(() => new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));

  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("[data-flow-region='primary']");
    const shell = document.querySelector<HTMLElement>("[data-space-shell='home']");
    const home = document.querySelector<HTMLElement>("[data-testid='home-space']");
    const dock = document.querySelector<HTMLElement>("[data-workspace-dock]");
    if (!main || !shell || !home || !dock) throw new Error("Home shell region missing");

    const rect = (node: HTMLElement) => {
      const value = node.getBoundingClientRect();
      return {
        top: value.top,
        right: value.right,
        bottom: value.bottom,
        left: value.left,
        width: value.width,
        height: value.height,
      };
    };

    return {
      main: rect(main),
      shell: rect(shell),
      home: rect(home),
      dock: rect(dock),
      mainBackground: getComputedStyle(main).backgroundColor,
      homeBackground: getComputedStyle(home).backgroundColor,
      dockBackground: getComputedStyle(dock).backgroundColor,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
}

test.beforeAll(() => mkdirSync(evidenceDir, { recursive: true }));

for (const viewport of viewports) {
  test(`${viewport.name}: initial Home owns the full primary canvas`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const result = await inspect(page);

    expect(result.scrollWidth).toBeLessThanOrEqual(result.viewport.width + 1);
    expect(result.shell.height, "Home transition shell must fill main").toBeGreaterThanOrEqual(result.main.height - 1);
    expect(result.home.height, "Initial Home surface must fill main").toBeGreaterThanOrEqual(result.main.height - 1);
    expect(result.mainBackground, "Main and Home must paint the same initial color").toBe(result.homeBackground);
    expect(result.dockBackground, "Bottom workspace must belong to the same Home canvas").toBe(result.homeBackground);
    expect(result.home.bottom).toBeGreaterThanOrEqual(result.main.bottom - 1);

    await page.screenshot({
      path: `${evidenceDir}/${viewport.name}-initial-home.png`,
      fullPage: false,
      caret: "hide",
    });
  });
}
