import { CapabilityRegistry } from "../registry";
import type { Capability } from "../types";
import { calendarCapabilities } from "./calendar";
import { journalCapabilities } from "./journal";
import { navigationCapabilities } from "./navigation";
import { plansCapabilities } from "./plans";
import { friendsCapabilities } from "./friends";
import { memoryCapabilities } from "./memory";
import { systemCapabilities } from "./system";

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
  ]) {
    registry.register(capability as Capability<never>);
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
