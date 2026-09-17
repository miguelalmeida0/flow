import { expect, test } from "@playwright/test";

for (const width of [430, 1440]) {
  test(`fresh-origin native startup acquires one owner at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      // Stub only the browser boundary, with no audio/results. Flow uses its
      // real BrowserRecognitionAdapter, mounted dock, session, and ownership.
      class Recognition {
        continuous = false; interimResults = false; maxAlternatives = 1; lang = "";
        onstart: (() => void) | null = null; onend: (() => void) | null = null;
        onerror = null; onresult = null;
        start() {
          const root = document.documentElement;
          root.dataset.nativeStartCount = String(Number(root.dataset.nativeStartCount ?? 0) + 1);
          this.onstart?.();
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      }
      Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
    });
    await page.goto("/");
    await expect(page.getByTestId("home-space")).toHaveAttribute("data-home-entrance", "wake-armed");
    await expect(page.locator("html")).toHaveAttribute("data-native-start-count", "1");
    await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
    await expect(page.getByRole("heading", { name: "Say “Flow” to wake me up." })).toBeVisible();
    // Viewport changes rerender the same mounted session without reacquisition.
    await page.setViewportSize({ width: width === 430 ? 1440 : 430, height: 900 });
    await expect(page.locator("html")).toHaveAttribute("data-native-start-count", "1");
    const owner = await page.evaluate(() => Object.keys(localStorage).filter((key) => /voice.*lease|live.*lease/.test(key)));
    expect(owner.length).toBeGreaterThan(0);
  });
}
