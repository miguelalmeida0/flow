import type { Capability, JsonSchema } from "../types";
import type { CapabilityRegistry } from "../registry";

/** One capability, described for the model prompt. Derived entirely from
 * the live registry — nothing here is authored a second time. */
export interface CapabilityDescription {
  id: string;
  domain: string;
  description: string;
  mutates: boolean;
  riskLevel: Capability["riskLevel"];
  argsSchema: JsonSchema;
}

/**
 * The model is only ever offered capabilities that defined `argsSchema` on
 * themselves (see the field's doc comment in src/kernel/types.ts) — that
 * field's presence IS the allowlist, so there is exactly one place
 * (the capability's own definition) that decides whether it's
 * conversationally reachable, not a second curated id list here.
 */
export function describeCapabilitiesForModel(registry: CapabilityRegistry): CapabilityDescription[] {
  return registry
    .list()
    .filter((capability): capability is Capability<never> & { argsSchema: JsonSchema } => capability.argsSchema !== undefined)
    .map((capability) => ({
      id: capability.id,
      domain: capability.domain,
      description: capability.description,
      mutates: capability.mutates,
      riskLevel: capability.riskLevel,
      argsSchema: capability.argsSchema,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function renderProperty(name: string, schema: JsonSchema, required: boolean): string {
  const parts = [`${name}${required ? "" : "?"}: ${schema.type}`];
  if (schema.enum) parts.push(`one of [${schema.enum.join(", ")}]`);
  if (schema.description) parts.push(`— ${schema.description}`);
  return `    ${parts.join(" ")}`;
}

/** Renders the exposed capabilities as compact prose for the system prompt.
 * Kept deliberately terse — this is prompt content, not the enforcement
 * layer (validateModelOutput.ts re-checks every field against the same
 * argsSchema regardless of what the model actually emits). */
export function renderCapabilitiesForPrompt(capabilities: CapabilityDescription[]): string {
  return capabilities
    .map((capability) => {
      const required = new Set(capability.argsSchema.required ?? []);
      const props = Object.entries(capability.argsSchema.properties ?? {})
        .map(([name, schema]) => renderProperty(name, schema, required.has(name)))
        .join("\n");
      const kindTag = capability.mutates ? "mutates" : "read-only";
      return `- ${capability.id} (${kindTag}, risk=${capability.riskLevel}): ${capability.description}\n${props}`;
    })
    .join("\n");
}
