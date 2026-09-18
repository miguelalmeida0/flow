import { fail, ok, type Capability, type CapabilityResult } from "../types";
import { createRequestId, dispatchDesktopCapability, getDesktopCompanionToken } from "../lib/desktopBridgeClient";

/**
 * Desktop capabilities dispatch to the local Desktop Companion bridge
 * (server/desktop-bridge/index.mjs) instead of doing anything locally
 * themselves. Argument shapes are deliberately as narrow as the server's own
 * validation - there is no capability here that accepts an arbitrary shell
 * string; the server re-validates everything independently, this is just so
 * the user gets a fast, local "that app isn't allowed" message before a
 * round trip.
 *
 * SYNCHRONOUS EXECUTE, ASYNC SIDE EFFECT: every capability in this kernel has
 * a synchronous `execute` - `src/kernel/kernel.ts`'s `executeStep` calls
 * `capability.execute(...)` and uses the result immediately, without
 * awaiting. These capabilities honor that: `execute()` validates
 * synchronously (rejecting a disallowed app/URL/path before anything is
 * dispatched), and if a companion token isn't configured at all, it can
 * `fail(...)` synchronously too (no network call needed to know that). Once
 * past those synchronous checks, it hands off to
 * `dispatchDesktopCapability`, which is NOT awaited, and immediately returns
 * its own synchronous `ok(...)` with a "pending" description. The real
 * outcome (the companion actually opened the app, or is offline/rejected the
 * request) arrives later via `desktopBridgeEvents` for a UI layer to render
 * as a transient status. See desktopBridgeClient.ts's module doc comment for
 * the full rationale.
 */

/** Keep in sync with ALLOWED_APPS in server/desktop-bridge/index.mjs. */
export const DESKTOP_ALLOWED_APPS = ["Visual Studio Code", "Finder", "Preview", "Safari", "Notes", "Terminal"] as const;
export type KnownApplication = (typeof DESKTOP_ALLOWED_APPS)[number];

export type DesktopGetFrontmostAppArgs = Record<string, never>;
export interface DesktopOpenAppArgs {
  app: KnownApplication;
}
export interface DesktopOpenFileArgs {
  path: string;
}
export interface DesktopRevealInFinderArgs {
  path: string;
}
export interface DesktopOpenUrlArgs {
  url: string;
}
export interface DesktopListRecentFilesArgs {
  dir?: string;
  limit?: number;
}

/** Synchronous "no companion configured at all" guard, shared by every
 * desktop capability's `execute`. Returns a CapabilityFailure or null. */
function notConfiguredFailure(): CapabilityResult | null {
  if (getDesktopCompanionToken()) return null;
  return fail(
    "desktop-companion-not-configured",
    "Flow's desktop companion isn't set up yet — add its session token in Settings.",
  );
}

export const desktopGetFrontmostApp: Capability<DesktopGetFrontmostAppArgs> = {
  id: "desktop.getFrontmostApp",
  domain: "desktop",
  description: "Ask the desktop companion which app is currently frontmost on the Mac.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (): CapabilityResult => {
    const guard = notConfiguredFailure();
    if (guard) return guard;
    const requestId = createRequestId();
    dispatchDesktopCapability(requestId, "desktop.getFrontmostApp", {}, {
      pendingMessage: "Checking the frontmost app…",
      formatSuccessMessage: (data) => `${(data as { app: string }).app} is frontmost.`,
    });
    return ok("Checking the frontmost app…", {}, { data: { pending: true, requestId } });
  },
};

export const desktopOpenApp: Capability<DesktopOpenAppArgs> = {
  id: "desktop.openApp",
  domain: "desktop",
  description: "Open a named application on the Mac via the desktop companion.",
  mutates: false,
  undoable: false,
  riskLevel: "medium",
  requiresConfirmation: () => false,
  validate: (args) => {
    if (typeof args.app !== "string" || args.app.length === 0) return "Say which app to open.";
    if (!DESKTOP_ALLOWED_APPS.includes(args.app as KnownApplication)) {
      return `"${args.app}" isn't on the list of apps Flow can open.`;
    }
    return null;
  },
  execute: (args): CapabilityResult => {
    const guard = notConfiguredFailure();
    if (guard) return guard;
    const requestId = createRequestId();
    dispatchDesktopCapability(
      requestId,
      "desktop.openApp",
      { app: args.app },
      {
        pendingMessage: `Opening ${args.app}…`,
        formatSuccessMessage: (data) => `Opened ${(data as { opened: string }).opened}.`,
      },
    );
    return ok(`Opening ${args.app}…`, {}, { data: { pending: true, requestId } });
  },
};

export const desktopOpenFile: Capability<DesktopOpenFileArgs> = {
  id: "desktop.openFile",
  domain: "desktop",
  description: "Open a file from an allowlisted local directory via the desktop companion.",
  mutates: false,
  undoable: false,
  riskLevel: "medium",
  requiresConfirmation: () => false,
  validate: (args) => (typeof args.path !== "string" || args.path.length === 0 ? "Say which file to open." : null),
  execute: (args): CapabilityResult => {
    const guard = notConfiguredFailure();
    if (guard) return guard;
    const requestId = createRequestId();
    dispatchDesktopCapability(
      requestId,
      "desktop.openFile",
      { path: args.path },
      {
        pendingMessage: "Opening the file…",
        formatSuccessMessage: (data) => `Opened ${(data as { opened: string }).opened}.`,
      },
    );
    return ok("Opening the file…", {}, { data: { pending: true, requestId } });
  },
};

export const desktopRevealInFinder: Capability<DesktopRevealInFinderArgs> = {
  id: "desktop.revealInFinder",
  domain: "desktop",
  description: "Reveal a file from an allowlisted local directory in Finder via the desktop companion.",
  mutates: false,
  undoable: false,
  riskLevel: "medium",
  requiresConfirmation: () => false,
  validate: (args) => (typeof args.path !== "string" || args.path.length === 0 ? "Say which file to reveal." : null),
  execute: (args): CapabilityResult => {
    const guard = notConfiguredFailure();
    if (guard) return guard;
    const requestId = createRequestId();
    dispatchDesktopCapability(
      requestId,
      "desktop.revealInFinder",
      { path: args.path },
      {
        pendingMessage: "Revealing in Finder…",
        formatSuccessMessage: (data) => `Revealed ${(data as { revealed: string }).revealed} in Finder.`,
      },
    );
    return ok("Revealing in Finder…", {}, { data: { pending: true, requestId } });
  },
};

export const desktopOpenUrl: Capability<DesktopOpenUrlArgs> = {
  id: "desktop.openUrl",
  domain: "desktop",
  description: "Open an http(s) URL in the default browser via the desktop companion.",
  mutates: false,
  undoable: false,
  riskLevel: "medium",
  requiresConfirmation: () => false,
  validate: (args) => {
    if (typeof args.url !== "string" || args.url.length === 0) return "Say which URL to open.";
    try {
      const parsed = new URL(args.url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "Flow can only open http or https links.";
      }
    } catch {
      return "That doesn't look like a valid URL.";
    }
    return null;
  },
  execute: (args): CapabilityResult => {
    const guard = notConfiguredFailure();
    if (guard) return guard;
    const requestId = createRequestId();
    dispatchDesktopCapability(
      requestId,
      "desktop.openUrl",
      { url: args.url },
      {
        pendingMessage: "Opening the link…",
        formatSuccessMessage: (data) => `Opened ${(data as { opened: string }).opened}.`,
      },
    );
    return ok("Opening the link…", {}, { data: { pending: true, requestId } });
  },
};

export interface DesktopRecentFile {
  path: string;
  name: string;
  extension: string;
  modifiedAt: string;
  size: number;
}

export const desktopListRecentFiles: Capability<DesktopListRecentFilesArgs> = {
  id: "desktop.listRecentFiles",
  domain: "desktop",
  description: "List recently modified files from an allowlisted local directory via the desktop companion.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: (args) => {
    if (args.limit !== undefined && (typeof args.limit !== "number" || !Number.isFinite(args.limit) || args.limit <= 0)) {
      return "Limit must be a positive number.";
    }
    if (args.dir !== undefined && (typeof args.dir !== "string" || args.dir.length === 0)) {
      return "Directory must be a non-empty string.";
    }
    return null;
  },
  execute: (args): CapabilityResult => {
    const guard = notConfiguredFailure();
    if (guard) return guard;
    const requestId = createRequestId();
    dispatchDesktopCapability(
      requestId,
      "desktop.listRecentFiles",
      { dir: args.dir, limit: args.limit },
      {
        pendingMessage: "Looking for recent files…",
        formatSuccessMessage: (data) => {
          const files = (data as { files: DesktopRecentFile[] }).files;
          return `Found ${files.length} recent file${files.length === 1 ? "" : "s"}.`;
        },
      },
    );
    return ok("Looking for recent files…", {}, { data: { pending: true, requestId } });
  },
};

export const desktopCapabilities = [
  desktopGetFrontmostApp,
  desktopOpenApp,
  desktopOpenFile,
  desktopRevealInFinder,
  desktopOpenUrl,
  desktopListRecentFiles,
];
