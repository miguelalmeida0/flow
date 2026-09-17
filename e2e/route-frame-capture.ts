import type { Page } from "@playwright/test";
import { readNativeFrameState, type NativeFrameState } from "./native-frame-capture";

/** Bounded route-entry observation on this test's actual Chromium target. */
export async function startRouteFrameCapture(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const frames: Array<{ data: string; nativeMs: number; timestamp: number }> = [];
  const errors: string[] = [];
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.evaluate(`(() => {
    const runtime = window;
    runtime.__routeFrameStates = [];
    const sample = ${readNativeFrameState.toString()};
    const tick = () => {
      runtime.__routeFrameStates.push(sample());
      runtime.__routeFrameHandle = requestAnimationFrame(tick);
    };
    runtime.__routeFrameHandle = requestAnimationFrame(tick);
  })()`);
  cdp.on("Page.screencastFrame", (frame) => {
    void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch((error) => errors.push(String(error)));
    if (typeof frame.metadata.timestamp === "number") frames.push({ data: frame.data, nativeMs: frame.metadata.timestamp * 1000 - timeOrigin, timestamp: frame.metadata.timestamp });
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 });
  return {
    frames,
    async submitCommand() {
      await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    },
    async stop() {
      await cdp.send("Page.stopScreencast");
      const states = await page.evaluate(() => {
        const runtime = window as Window & { __routeFrameHandle: number; __routeFrameStates: NativeFrameState[] };
        cancelAnimationFrame(runtime.__routeFrameHandle);
        return runtime.__routeFrameStates;
      });
      await cdp.detach();
      return { states, frames, errors, rendererTimeOriginMs: timeOrigin };
    },
  };
}
