import type { Capability } from "./types";

/**
 * Central capability/action registry. The conversational layer never hardcodes
 * UI routing or domain logic — it looks up a Capability by id here and lets the
 * capability's own validate/preflight/execute contract do the work.
 */
export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability<never>>();

  register<Args>(capability: Capability<Args>): void {
    if (this.capabilities.has(capability.id)) {
      throw new Error(`Capability already registered: ${capability.id}`);
    }
    this.capabilities.set(capability.id, capability as unknown as Capability<never>);
  }

  get<Args = Record<string, unknown>>(id: string): Capability<Args> | undefined {
    return this.capabilities.get(id) as unknown as Capability<Args> | undefined;
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  list(domain?: string): Capability<never>[] {
    const all = [...this.capabilities.values()];
    return domain ? all.filter((capability) => capability.domain === domain) : all;
  }

  domains(): string[] {
    return [...new Set(this.list().map((capability) => capability.domain))];
  }
}
