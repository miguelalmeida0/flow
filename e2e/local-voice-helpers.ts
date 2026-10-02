import { expect, type Page } from "@playwright/test";

/** Observe accepted utterance identity, not native transport restarts. Native
 * end can precede final assembly; repeated words still need a new identity. */
export async function localUtteranceId(page: Page) {
  return page.getByLabel("Global Flow command").getAttribute("data-last-utterance-id");
}

export async function awaitLocalTurn(page: Page, previousId: string | null, transcript: string, restart = true) {
  await expect.poll(() => localUtteranceId(page)).not.toBe(previousId);
  await expect(page.getByLabel("Global Flow command")).toHaveAttribute("data-last-transcript", transcript);
  if (restart) await awaitLocalListening(page);
}

/** Deterministic local speech output. Audio recording/decoding remains native.
 * Emit lifecycle callbacks so echo/overlap coordination still runs. */
export async function installLocalPromptSpeech(page: Page) {
  await page.addInitScript(() => {
    let timer: number | undefined;
    let speaking = false;
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      get speaking() { return speaking; }, get pending() { return false; },
      cancel() { clearTimeout(timer); speaking = false; },
      speak(utterance: SpeechSynthesisUtterance) {
        speaking = true;
        utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
        timer = window.setTimeout(() => { speaking = false; utterance.onend?.(new Event("end") as SpeechSynthesisEvent); }, 80);
      },
    } });
  });
}

/** Local browser-recognition fixtures only. Hosted capture uses its own secure
 * gateway fixture and must never install a browser ASR substitute. */
export async function awaitLocalListening(page: Page) {
  await expect(page.getByTestId("flow-live-presence")).toHaveAttribute("data-flow-live-status", "listening");
}

/** Sequential dialogue waits for the speech output lifecycle to settle. Interruption
 * tests bypass this explicitly, preserving PromptSpeechCoordinator barge-in. */
export async function awaitSpokenPrompt(page: Page) {
  await expect.poll(()=>page.evaluate(()=>!speechSynthesis.speaking && !speechSynthesis.pending),{timeout:15_000}).toBe(true);
}

export async function wakeLocalVoice(page: Page, emitWake: () => Promise<void>) {
  await awaitLocalListening(page);
  if (await page.locator('[data-home-entrance="wake-armed"]').count()) {
    const before = await page.evaluate(() => localStorage.getItem("flow.life.v3"));
    await emitWake();
    await expect(page.locator('[data-home-entrance="wake-armed"]')).toHaveCount(0);
    await awaitLocalListening(page);
    expect(await page.evaluate(() => localStorage.getItem("flow.life.v3"))).toBe(before);
  }
}
