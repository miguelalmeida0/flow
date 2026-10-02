import { createElement, type ReactNode } from "react";
import { render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StaticMotionMascotRenderer } from "./StaticMotionMascotRenderer";
import type { MascotPresentation } from "./mascot-model";
import { VOICE_TARGET_MOTION_EVENT } from "../../shared/motion/voiceMotionHandshake";

const callbacks = vi.hoisted(() => new Map<string, (latest: Record<string, number>) => void>());
vi.mock("motion/react", () => {
  const component = (tag: string) => (props: Record<string, unknown>) => {
    if (props.onUpdate) callbacks.set(props["data-mascot-motion-stage"] as string, props.onUpdate as (latest: Record<string, number>) => void);
    return createElement(tag, {}, props.children as ReactNode);
  };
  return { AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: { div: component("div"), svg: component("svg"), g: component("g"), circle: component("circle"), path: component("path") } };
});
vi.mock("./useMascotSafeZone", () => ({ useMascotSafeZone: () => ({ ref: { current: null }, safe: true }) }));
vi.mock("../../shared/motion/useReducedMotionPreference", () => ({ useReducedMotionPreference: () => false }));
afterEach(() => callbacks.clear());

it.each(["gaze-first", "body-follow"])("ignores an old %s callback without consuming the current command acknowledgement", stage => {
  const presentation = (actionId: string): MascotPresentation => ({ state: "thinking", sequence: 1,
    attention: { actionId, direction: "left", domain: "journal", motionStage: "body" } });
  const events: unknown[] = [];
  const listener = (event: Event) => events.push((event as CustomEvent).detail);
  window.addEventListener(VOICE_TARGET_MOTION_EVENT, listener);
  const view = render(<StaticMotionMascotRenderer layoutKey="home" presentation={presentation("old")} />);
  const oldUpdate = callbacks.get(stage)!;
  view.rerender(<StaticMotionMascotRenderer layoutKey="home" presentation={presentation("current")} />);
  try {
    oldUpdate({ x: -1 });
    expect(events).toEqual([]);
    callbacks.get(stage)!({ x: -1 });
    expect(events).toEqual([expect.objectContaining({ actionId: "current", stage: stage === "gaze-first" ? "eyes" : "body" })]);
    callbacks.get(stage)!({ x: -2 });
    expect(events).toHaveLength(1);
  } finally { window.removeEventListener(VOICE_TARGET_MOTION_EVENT, listener); }
});
