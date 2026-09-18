import { CapabilityRegistry } from "../registry";
import type { Capability } from "../types";
import { calendarCapabilities } from "./calendar";
import { journalCapabilities } from "./journal";
import { navigationCapabilities } from "./navigation";
import { plansCapabilities } from "./plans";
import { friendsCapabilities } from "./friends";
import { memoryCapabilities } from "./memory";
import { systemCapabilities } from "./system";
import { desktopCapabilities } from "./desktop";
import { recallCapabilities } from "./recall";

export function createDefaultRegistry(): CapabilityRegistry {
  const registry = new CapabilityRegistry();
  for (const capability of [
    ...calendarCapabilities,
    ...journalCapabilities,
    ...navigationCapabilities,
    ...plansCapabilities,
    ...friendsCapabilities,
    ...memoryCapabilities,
    ...systemCapabilities,
    ...desktopCapabilities,
    ...recallCapabilities,
  ]) {
    // `as unknown as` (rather than the plain `as` used above) because desktop
    // capabilities are async (see desktop.ts) and don't structurally match
    // the synchronous Capability<never> shape closely enough for a direct cast.
    registry.register(capability as unknown as Capability<never>);
  }
  return registry;
}

export * from "./calendar";
export * from "./journal";
export * from "./navigation";
export * from "./plans";
export * from "./friends";
export * from "./memory";
export * from "./system";
export * from "./desktop";
export * from "./recall";
