/**
 * Thin client for Flow's local Desktop Companion bridge
 * (server/desktop-bridge/index.mjs).
 *
 * IMPORTANT - synchronous capability, asynchronous network call: every other
 * capability in this kernel has a synchronous `execute` (see
 * src/kernel/types.ts / src/kernel/kernel.ts's `executeStep`, which calls
 * `capability.execute(...)` and reads the result immediately, without
 * awaiting). Desktop capabilities keep that contract - `execute()` returns a
 * `CapabilityResult` synchronously, immediately, with a "pending" description
 * ("Opening Visual Studio Code…") - and fire the actual network call to the
 * companion in the background via `dispatchDesktopCapability` below, which is
 * NOT awaited by the capability. The eventual outcome (success or failure,
 * e.g. "companion offline") is delivered separately via the
 * `desktopBridgeEvents` emitter, for a UI layer to render as a transient
 * status toast/line ("Opening VS Code…" -> "Opened VS Code." / "Flow's
 * desktop companion isn't running"). This is a deliberate design, not a
 * workaround: these are real-world side effects outside the browser sandbox,
 * so a brief "doing this now" + later confirmation is the right UX anyway.
 *
 * Settings UI wiring (not built yet - see limitations in the sprint report):
 * a future settings screen should let the user paste the companion's session
 * token (printed by `npm run companion:dev`, and written to
 * ~/.flow-companion/token) into a field that writes it to localStorage key
 * "flow.desktopCompanion.token", and optionally override the companion's
 * base URL via localStorage key "flow.desktopCompanion.baseUrl" (defaults to
 * http://127.0.0.1:8765). Until that UI exists, the token has to be set by
 * hand, e.g. via devtools:
 *   localStorage.setItem("flow.desktopCompanion.token", "<token from ~/.flow-companion/token>")
 */

export const DESKTOP_COMPANION_TOKEN_KEY = "flow.desktopCompanion.token";
export const DESKTOP_COMPANION_BASE_URL_KEY = "flow.desktopCompanion.baseUrl";
export const DEFAULT_DESKTOP_COMPANION_BASE_URL = "http://127.0.0.1:8765";

export type DesktopBridgeErrorCode = "not-configured" | "offline" | "unauthorized" | "rejected";

export class DesktopBridgeError extends Error {
  readonly code: DesktopBridgeErrorCode;
  constructor(code: DesktopBridgeErrorCode, message: string) {
    super(message);
    this.name = "DesktopBridgeError";
    this.code = code;
  }
}

function readLocalStorage(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getDesktopCompanionBaseUrl(): string {
  const stored = readLocalStorage(DESKTOP_COMPANION_BASE_URL_KEY);
  return stored && stored.length > 0 ? stored : DEFAULT_DESKTOP_COMPANION_BASE_URL;
}

export function getDesktopCompanionToken(): string | null {
  const stored = readLocalStorage(DESKTOP_COMPANION_TOKEN_KEY);
  return stored && stored.length > 0 ? stored : null;
}

export interface DesktopBridgeCallOptions {
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Calls one capability on the local Desktop Companion bridge over `fetch`.
 * Always throws `DesktopBridgeError` on failure, with a code the caller can
 * branch on and a message that's already safe to show the user:
 *   - "not-configured": no token stored yet.
 *   - "offline": fetch itself threw (companion not running / connection refused).
 *   - "unauthorized": companion reachable but rejected the token (401/403).
 *   - "rejected": companion reachable, request otherwise rejected (4xx/5xx).
 *
 * This is the low-level, awaitable primitive. Capabilities in
 * src/kernel/capabilities/desktop.ts do NOT call this directly - they call
 * `dispatchDesktopCapability` below, which wraps this fire-and-forget so
 * `execute()` can stay synchronous. Exported (and awaitable) so it can also
 * be used directly by non-kernel callers, e.g. a future settings screen's
 * "test connection" button, or tests.
 */
export async function callDesktopCapability<T = unknown>(
  capability: string,
  args: Record<string, unknown> = {},
  options: DesktopBridgeCallOptions = {},
): Promise<T> {
  const token = getDesktopCompanionToken();
  if (!token) {
    throw new DesktopBridgeError(
      "not-configured",
      "Flow's desktop companion isn't set up yet — add its session token in Settings.",
    );
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = getDesktopCompanionBaseUrl();

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/capability`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ capability, args }),
    });
  } catch {
    throw new DesktopBridgeError(
      "offline",
      "Flow's desktop companion isn't running — start it with `npm run companion:dev`.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new DesktopBridgeError(
      "unauthorized",
      "Flow's desktop companion rejected its session token — re-enter it in Settings.",
    );
  }

  if (!response.ok) {
    let message = `Desktop companion request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body && typeof body.error === "string" && body.error.length > 0) message = body.error;
    } catch {
      // Fall back to the generic message above.
    }
    throw new DesktopBridgeError("rejected", message);
  }

  return (await response.json()) as T;
}

/** Best-effort liveness check for "companion offline" vs "companion online" UX. Never throws. */
export async function checkDesktopCompanionHealth(options: DesktopBridgeCallOptions = {}): Promise<boolean> {
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${getDesktopCompanionBaseUrl()}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

/** Creates an id for correlating a capability's synchronous "pending" return
 * value with the later `desktopBridgeEvents` outcome. `crypto.randomUUID` is
 * available in every real runtime this code ships to (browser, and Node
 * 22+ under Vitest); the fallback only exists so a missing/mocked `crypto`
 * in an unusual test harness can't throw. */
export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export type DesktopBridgeEventStatus = "pending" | "ok" | "error";

export interface DesktopBridgeEvent {
  type: "desktop-action";
  requestId: string;
  capabilityId: string;
  status: DesktopBridgeEventStatus;
  message: string;
  data?: unknown;
}

type DesktopBridgeEventListener = (event: DesktopBridgeEvent) => void;

/** Minimal synchronous pub/sub - deliberately not `EventTarget` (which needs
 * `Event` instances and is DOM-flavored) so this stays trivially usable from
 * both the kernel (no DOM) and a future UI layer. */
class DesktopBridgeEventEmitter {
  private readonly listeners = new Set<DesktopBridgeEventListener>();

  on(listener: DesktopBridgeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: DesktopBridgeEventListener): void {
    this.listeners.delete(listener);
  }

  emit(event: DesktopBridgeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

/** Singleton event bus a future UI layer subscribes to for transient
 * "Opening VS Code…" -> success/failure status. See module doc comment. */
export const desktopBridgeEvents = new DesktopBridgeEventEmitter();

export interface DispatchDesktopCapabilityOptions extends DesktopBridgeCallOptions {
  /** Formats the success event's message from the resolved response body. Defaults to "Done." */
  formatSuccessMessage?: (data: unknown) => string;
  /** Message for the immediate "pending" event. Defaults to "Working on it…" */
  pendingMessage?: string;
}

/**
 * Fire-and-forget bridge call: starts `callDesktopCapability` but does NOT
 * return a promise for the caller to await (capabilities call this and then
 * immediately return their own synchronous `ok(...)`). Emits a "pending"
 * event right away, then "ok" or "error" on `desktopBridgeEvents` once the
 * network call settles.
 */
export function dispatchDesktopCapability(
  requestId: string,
  capabilityId: string,
  args: Record<string, unknown> = {},
  options: DispatchDesktopCapabilityOptions = {},
): void {
  const { formatSuccessMessage, pendingMessage, ...callOptions } = options;

  desktopBridgeEvents.emit({
    type: "desktop-action",
    requestId,
    capabilityId,
    status: "pending",
    message: pendingMessage ?? "Working on it…",
  });

  void callDesktopCapability(capabilityId, args, callOptions)
    .then((data) => {
      desktopBridgeEvents.emit({
        type: "desktop-action",
        requestId,
        capabilityId,
        status: "ok",
        message: formatSuccessMessage ? formatSuccessMessage(data) : "Done.",
        data,
      });
    })
    .catch((error: unknown) => {
      const message =
        error instanceof DesktopBridgeError ? error.message : "Something went wrong talking to Flow's desktop companion.";
      desktopBridgeEvents.emit({ type: "desktop-action", requestId, capabilityId, status: "error", message });
    });
}
