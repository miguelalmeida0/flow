import type { Page } from "@playwright/test";

export async function installDevelopmentProbe(page: Page) {
  await page.addInitScript(() => {
    type Fiber = { type?: unknown; mode: number; child?: Fiber; sibling?: Fiber };
    const probe = { bundleType: -1, version: "", strictEffectsMode: false, strictProbes: 0, commits: 0 };
    const runtime = window as typeof window & { __FLOW_DEV_PROBE__?: typeof probe; __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown };
    runtime.__FLOW_DEV_PROBE__ = probe;
    // Read-only standard DevTools notifications. No reconciler/state mutation.
    runtime.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: (renderer: { bundleType: number; version: string }) => {
        probe.bundleType = renderer.bundleType; probe.version = renderer.version; return 1;
      },
      setStrictMode: (_id: number, enabled: boolean) => { if (enabled) probe.strictProbes += 1; },
      onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
        probe.commits += 1;
        const visit = (fiber?: Fiber) => {
          if (!fiber) return;
          // Installed React 19: StrictLegacyMode=8, StrictEffectsMode=16.
          if (fiber.type === Symbol.for("react.strict_mode") && (fiber.mode & 24) === 24) probe.strictEffectsMode = true;
          visit(fiber.child); visit(fiber.sibling);
        };
        visit(root.current);
      },
    };
  });
}

export async function readDevelopmentProbe(page: Page) {
  return page.evaluate(() => (window as typeof window & { __FLOW_DEV_PROBE__?: { bundleType: number; version: string; strictEffectsMode: boolean; strictProbes: number; commits: number } }).__FLOW_DEV_PROBE__!);
}

export async function armNativeInterruption(page: Page, temporal: boolean) {
  await page.evaluate((isTemporal) => {
    type Snapshot = { document: unknown; past: unknown[]; future: unknown[] };
    type Reward = { active: boolean; sequence: number; event?: { type: string }; plan?: { level: number; reducedMotion: boolean } };
    const runtime = window as typeof window & {
      __FLOW_REWARD__?: Reward;
      __FLOW_DEV_INTERRUPT__?: { beforeSequence: number; after: Snapshot; active: boolean; sequence: number; level?: number; reduced?: boolean; controlFound: boolean; at: number };
    };
    const beforeSequence = runtime.__FLOW_REWARD__?.sequence ?? 0;
    const start = performance.now();
    function inspect() {
      const reward = runtime.__FLOW_REWARD__;
      const type = isTemporal ? "time-scope-changed" : "transaction-committed";
      if (reward?.active && reward.sequence > beforeSequence && reward.event?.type === type) {
        const control = isTemporal
          ? [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Time scope"] button')].find((button) => button.textContent === "Today")
          : document.querySelector<HTMLButtonElement>('[aria-label="Undo last change"]');
        if (!control || control.disabled) { requestAnimationFrame(inspect); return; }
        runtime.__FLOW_DEV_INTERRUPT__ = {
          beforeSequence, after: JSON.parse(localStorage.getItem("flow.life.v3")!), active: reward.active,
          sequence: reward.sequence, level: reward.plan?.level, reduced: reward.plan?.reducedMotion,
          controlFound: Boolean(control && !control.disabled), at: performance.now(),
        };
        control?.click(); // Actual UI handler, never a direct business action.
        return;
      }
      if (performance.now() - start < 5_000) requestAnimationFrame(inspect);
    }
    requestAnimationFrame(inspect);
  }, temporal);
}

export async function readInterruption(page: Page) {
  return page.evaluate(() => (window as typeof window & { __FLOW_DEV_INTERRUPT__?: {
    beforeSequence: number; after: { document: unknown; past: unknown[]; future: unknown[] }; active: boolean;
    sequence: number; level?: number; reduced?: boolean; controlFound: boolean; at: number;
  } }).__FLOW_DEV_INTERRUPT__);
}

export async function readSettledPresentation(page: Page) {
  return page.evaluate(() => {
    const runtime = window as typeof window & {
      __FLOW_REWARD__?: { active: boolean; animationCount: number; transitionClones: number };
      __FLOW_SOUND__?: { contextsCreated: number; activeNodes: number };
    };
    return {
      reward: runtime.__FLOW_REWARD__, motion: window.__FLOW_MOTION__ ?? { activeClones: 0, activeFrameLoops: 0 },
      sound: runtime.__FLOW_SOUND__ ?? { contextsCreated: 0, activeNodes: 0 },
      animations: document.getAnimations().filter(({ playState }) => playState === "running").length,
      residue: document.querySelectorAll("[data-transition-clone-count], [data-reward-wash], [data-reward-target]").length,
    };
  });
}
