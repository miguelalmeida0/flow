import type { LifeRoute } from "../../domain/life-model";
import { fail, ok, type Capability, type CapabilityResult } from "../types";

export interface NavigationOpenArgs {
  route: LifeRoute;
}

export type NavigationBackArgs = Record<string, never>;

export interface NavigationScrollArgs {
  direction: "up" | "down";
  fraction?: number;
}

export const navigationOpen: Capability<NavigationOpenArgs> = {
  id: "navigation.open",
  domain: "navigation",
  description: "Open a top-level Flow surface.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (!args.route ? "Say where to go." : null),
  execute: (args, ctx): CapabilityResult => ok(`Opened ${args.route}.`, { navigation: { route: args.route, previousRoute: ctx.navigation.route } }),
};

export const navigationBack: Capability<NavigationBackArgs> = {
  id: "navigation.back",
  domain: "navigation",
  description: "Return to the previous surface.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (_args, ctx): CapabilityResult => {
    if (!ctx.navigation.previousRoute) return fail("no-history", "There's nowhere to go back to.");
    return ok(`Back to ${ctx.navigation.previousRoute}.`, { navigation: { route: ctx.navigation.previousRoute, previousRoute: ctx.navigation.route } });
  },
};

export const navigationScroll: Capability<NavigationScrollArgs> = {
  id: "navigation.scroll",
  domain: "navigation",
  description: "Scroll the active surface.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => (args.direction !== "up" && args.direction !== "down" ? "Say up or down." : null),
  execute: (args): CapabilityResult => ok(`Scrolled ${args.direction}.`, {}, { data: { direction: args.direction, fraction: args.fraction ?? 0.5 } }),
};

export const navigationCapabilities = [navigationOpen, navigationBack, navigationScroll];
