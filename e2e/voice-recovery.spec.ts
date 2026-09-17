import { expect, test } from "@playwright/test";

test("native recognition end preserves complete global navigation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem("flow.voice.permission-granted.v1", "granted");
    class Recognition {
      continuous = true; interimResults = true; maxAlternatives = 5; lang = "en-US";
      onstart: (() => void) | null = null; onend: (() => void) | null = null;
      onerror = null; onresult: ((event: unknown) => void) | null = null;
      start() {
        this.onstart?.();
        window.addEventListener("recovery-transcript", this.emit);
      }
      stop() { window.removeEventListener("recovery-transcript", this.emit); this.onend?.(); }
      abort() { this.stop(); }
      emit = (event: Event) => {
        const { transcript, isFinal } = (event as CustomEvent).detail;
        this.onresult?.({ results: [Object.assign([{ transcript, confidence: 0.99 }], { isFinal })] });
        this.stop();
      };
    }
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  });
  await page.goto("/");
  for (const [transcript, path, isFinal] of [
    ["Flow", "/", true], ["open the journal", "/journal", false], ["go home", "/", false],
    ["open atmosphere", "/atmosphere", false], ["go home", "/", false],
    ["open memories", "/memories", false], ["go home", "/", false],
    ["open calendar", "/today", false], ["go home", "/", false],
  ] as const) {
    await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
    await page.evaluate(({ transcript, isFinal }) => window.dispatchEvent(new CustomEvent("recovery-transcript", { detail: { transcript, isFinal } })), { transcript, isFinal });
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
    if (transcript !== "Flow") await expect(page.locator("[data-last-transcript]")).toHaveAttribute("data-last-transcript", transcript);
    else await expect(page.locator("[data-home-entrance]")).not.toHaveAttribute("data-home-entrance", "wake-armed");
    await expect(page.getByText(/browser ended an unfinished phrase/)).toHaveCount(0);
  }
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
  const before = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("recovery-transcript", { detail: { transcript: "rename the meeting to", isFinal: false } })));
  await expect(page.getByText(/browser ended an unfinished phrase/)).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(before);
  expect(errors).toEqual([]);
});
