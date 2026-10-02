/** Same-origin cookie sessions. CSRF is fetched fresh, never persisted. */
export interface HostedSession {
  authenticated: boolean;
  csrf?: string;
  expiresAt?: number;
  inferenceEnabled: boolean;
  reasoningEnabled: boolean;
  speechEnabled: boolean;
  consentVersion: string | null;
}
const listeners = new Set<(session: HostedSession) => void>();
let sessionGeneration = 0;
let lastSession: HostedSession | undefined;
const redemptions = new Set<Promise<Response>>();
const LOGOUT_INTENT_KEY = "flow.cloud.logout-intent.v1";
const LOGOUT_BROADCAST_KEY = "flow.cloud.logout-broadcast.v1";
const logoutListeners = new Set<() => void>();
let logoutChannel: BroadcastChannel | undefined;
let detachLogout: (() => void) | undefined;
const seenLogout = new Set<string>();
function receiveLogout(id: string) {
  if (!id || seenLogout.has(id)) return;
  seenLogout.add(id); if (seenLogout.size > 64) seenLogout.delete(seenLogout.values().next().value!);
  sessionGeneration++; setOptOut(true);
  publish({authenticated:false,inferenceEnabled:false,reasoningEnabled:false,speechEnabled:false,consentVersion:lastSession?.consentVersion ?? null});
  for (const listener of logoutListeners) listener();
}
export function subscribeHostedLogout(listener: () => void): () => void {
  logoutListeners.add(listener);
  if (!detachLogout && typeof window !== "undefined") {
    const storage = (event: StorageEvent) => { if (event.key === LOGOUT_BROADCAST_KEY && event.newValue) receiveLogout(event.newValue); };
    window.addEventListener("storage", storage);
    if (typeof window.BroadcastChannel === "function") {
      logoutChannel = new window.BroadcastChannel(LOGOUT_BROADCAST_KEY);
      logoutChannel.onmessage = event => { if (typeof event.data === "string") receiveLogout(event.data); };
    }
    detachLogout = () => { window.removeEventListener("storage", storage); logoutChannel?.close(); logoutChannel=undefined; detachLogout=undefined; };
  }
  return () => { logoutListeners.delete(listener); if (!logoutListeners.size) detachLogout?.(); };
}
let optedOut = false;
try { optedOut = sessionStorage.getItem(LOGOUT_INTENT_KEY) === "1"; } catch { /* Continue checking the origin latch independently. */ }
try { optedOut ||= Boolean(localStorage.getItem(LOGOUT_BROADCAST_KEY)); } catch { /* Memory still protects this tab when storage is unavailable. */ }
function setOptOut(value: boolean) {
  optedOut = value;
  try { if (value) sessionStorage.setItem(LOGOUT_INTENT_KEY,"1"); else sessionStorage.removeItem(LOGOUT_INTENT_KEY); } catch { /* No credential is stored here. */ }
  if (!value) try { localStorage.removeItem(LOGOUT_BROADCAST_KEY); } catch { /* Explicit access still works in this tab. */ }
}
function withoutAuthority(session: HostedSession): HostedSession { return {...session,authenticated:false,csrf:undefined,expiresAt:undefined}; }
export function subscribeHostedSession(listener: (session: HostedSession) => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
function publish(session: HostedSession): HostedSession {
  lastSession = session;
  for (const listener of listeners) listener(session);
  return session;
}
function parseSession(value: unknown): HostedSession {
  if (!value || typeof value !== "object") throw new Error("Cloud access unavailable.");
  const input = value as Record<string, unknown>;
  if (typeof input.authenticated !== "boolean") throw new Error("Invalid cloud access response.");
  if (input.authenticated && (typeof input.csrf !== "string" || !/^[\w-]{43}$/.test(input.csrf) || typeof input.expiresAt !== "number" || !Number.isFinite(input.expiresAt) || input.expiresAt <= Date.now())) throw new Error("Cloud access expired.");
  return { authenticated: input.authenticated, csrf: input.authenticated ? input.csrf as string : undefined,
    expiresAt: input.authenticated ? input.expiresAt as number : undefined,
    inferenceEnabled: input.inferenceEnabled === true, reasoningEnabled: input.reasoningEnabled === true,
    speechEnabled: input.speechEnabled === true, consentVersion: typeof input.consentVersion === "string" ? input.consentVersion : null };
}
export async function getHostedSession({signal, fetchImpl = fetch, explicitRefresh = false}: {signal?: AbortSignal; fetchImpl?: typeof fetch; explicitRefresh?: boolean} = {}): Promise<HostedSession> {
  const generation = sessionGeneration;
  const response = await fetchImpl("/api/session", {credentials:"same-origin", cache:"no-store", redirect:"error", signal});
  if (!response.ok) throw new Error("Cloud access unavailable.");
  const session = parseSession(await response.json());
  if (generation !== sessionGeneration || signal?.aborted) throw new Error("Cloud access request superseded.");
  if (explicitRefresh) setOptOut(false);
  else try { if (localStorage.getItem(LOGOUT_BROADCAST_KEY)) setOptOut(true); } catch { /* Keep existing in-memory intent. */ }
  return publish(optedOut ? withoutAuthority(session) : session);
}
export async function redeemHostedSession(invite: string, consentVersion: string): Promise<HostedSession> {
  const generation = ++sessionGeneration;
  const request = fetch("/api/session", {method:"POST", credentials:"same-origin", redirect:"error", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({invite, consentVersion})});
  redemptions.add(request);
  let response: Response;
  try { response = await request; } finally { redemptions.delete(request); }
  if (!response.ok) throw new Error("Invitation unavailable. Request a replacement invitation.");
  const session = parseSession(await response.json());
  if (generation !== sessionGeneration) throw new Error("Cloud access request superseded.");
  if (session.authenticated) setOptOut(false);
  return publish(session);
}
export async function logoutHostedSession(): Promise<void> {
  // Stop local listeners immediately even if the network logout fails.
  let session = lastSession;
  const generation = ++sessionGeneration;
  setOptOut(true);
  const logoutId = crypto.randomUUID(); seenLogout.add(logoutId);
  // This nonsecret intent ends existing same-origin tabs even when DELETE
  // cannot reach the server. Each recipient persists its own opt-out latch.
  try { localStorage.setItem(LOGOUT_BROADCAST_KEY, logoutId); } catch { /* BroadcastChannel remains available where supported. */ }
  logoutChannel?.postMessage(logoutId);
  for (const listener of logoutListeners) listener();
  const pendingRedemptions = [...redemptions];
  publish({authenticated:false,inferenceEnabled:false,reasoningEnabled:false,speechEnabled:false,consentVersion:session?.consentVersion ?? null});
  // A pending response can still install an HttpOnly cookie even though its
  // stale UI result is rejected. Revoke that actual cookie after it settles.
  if (pendingRedemptions.length) {
    await Promise.allSettled(pendingRedemptions);
    if (generation !== sessionGeneration) throw new Error("Cloud logout was superseded.");
    session = undefined;
  }
  if (!session?.authenticated) {
    const response = await fetch("/api/session", {credentials:"same-origin",cache:"no-store",redirect:"error"});
    if (!response.ok) throw new Error("Cloud logout could not be confirmed. Voice has stopped.");
    session = parseSession(await response.json());
  }
  if (!session.authenticated) return;
  const response = await fetch("/api/session", {method:"DELETE", credentials:"same-origin", redirect:"error", headers:{"X-Flow-CSRF":session.csrf!}});
  if (!response.ok) throw new Error("Cloud logout could not be confirmed. Voice has stopped.");
}
