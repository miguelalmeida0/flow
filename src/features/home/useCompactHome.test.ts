import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useCompactHome } from "./useCompactHome";

it("tracks the compact Home breakpoint and releases its listener on unmount", () => {
  let compact = false;
  const listeners = new Set<() => void>();
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => {
    expect(query).toBe("(max-width: 639px)");
    return { get matches() { return compact; }, addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  }) });
  try {
    const view = renderHook(useCompactHome);
    expect(view.result.current).toBe(false);
    act(() => { compact = true; listeners.forEach((listener) => listener()); });
    expect(view.result.current).toBe(true);
    act(() => { compact = false; listeners.forEach((listener) => listener()); });
    expect(view.result.current).toBe(false);
    view.unmount();
    expect(listeners.size).toBe(0);
  } finally {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
  }
});
