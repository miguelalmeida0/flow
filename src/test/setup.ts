import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetBridgeIdempotencyStoreForTests } from "../kernel/productionBridge";

const values = new Map<string, string>();
const memoryStorage: Storage = {
  get length() { return values.size; },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => { values.delete(key); },
  setItem: (key, value) => { values.set(key, String(value)); },
};

Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }),
});
Object.defineProperty(window, "scrollTo", { configurable: true, value: () => undefined });
afterEach(cleanup);
// The production idempotency store (kernel/idempotency.ts) is a real
// process-lifetime singleton by design (see productionBridge.ts) — but two
// unrelated tests in the same file submitting the same capability+args
// would otherwise make the second look like a duplicate of the first, so
// every test starts with a clean one.
afterEach(resetBridgeIdempotencyStoreForTests);
