import registry from "./uiCapabilityRegistry.json";

/** A capability is parameterized: each rendered mode/target is still a distinct
 * parity case. Native continuation is a result, never an exemption or success.
 * This is product audit metadata, not another execution router. */
export interface UiCapability {
  category?: "product-action" | "observation" | "developer-control";
  actionId: string;
  domain: string;
  buttonLabel: string | readonly string[];
  voiceSupported: boolean;
  exampleUtterances: readonly string[];
  requiredContext: readonly string[];
  destructive: boolean;
  implementationHandler: string;
  parameterSlots: Readonly<Record<string, unknown>>;
  nativeContinuation: string | null;
  component: string;
  gap?: string;
  existingTest?: string;
  validation: "pending-three-mode" | "verified-three-mode";
}

export const uiCapabilities: readonly UiCapability[] = registry as UiCapability[];
export function uiCapability(actionId: string) { return uiCapabilities.find((item) => item.actionId === actionId); }
