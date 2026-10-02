import { useCallback, useEffect, useRef, useState } from "react";
import { getHostedSession, logoutHostedSession, redeemHostedSession, subscribeHostedSession, type HostedSession } from "../../kernel/hostedSessionClient";

/** UI observes the shared cookie-session authority; it never persists credentials. */
export function useHostedAccess(enabled: boolean, stop: (reason?: string) => void) {
  const [session, setSession] = useState<HostedSession>();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string>();
  const [now, setNow] = useState(Date.now);
  const mounted = useRef(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true); setIssue(undefined);
    try { const current = await getHostedSession({explicitRefresh:true}); if (mounted.current && request === generation.current) setSession(current); }
    catch { if (mounted.current && request === generation.current) { setSession(undefined); setIssue("Cloud features are unavailable. Supported typed commands still work."); } }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    const controller = new AbortController();
    const unsubscribe = subscribeHostedSession(setSession);
    void getHostedSession({signal:controller.signal}).then(setSession).catch(() => { if (!controller.signal.aborted) setIssue("Cloud features are unavailable. Supported typed commands still work."); });
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { mounted.current = false; generation.current += 1; controller.abort(); unsubscribe(); window.clearInterval(ticker); };
  }, [enabled]);
  const authenticated = Boolean(session?.authenticated && session.expiresAt && session.expiresAt > now);
  useEffect(() => {
    if (session?.authenticated && session.expiresAt && session.expiresAt <= now) {
      stop("Cloud access expired. Request a replacement invitation.");
      setSession(current => current ? {...current,authenticated:false,csrf:undefined,expiresAt:undefined} : current);
      setIssue("Cloud access expired. Request a replacement invitation for the same identity; your allowance does not reset.");
    }
  }, [now, session, stop]);
  async function redeem(invite: string, consentVersion: string) {
    const request = ++generation.current; setBusy(true); setIssue(undefined);
    try { await redeemHostedSession(invite,consentVersion); }
    catch { if (mounted.current && request === generation.current) setIssue("Invitation unavailable. Request a replacement invitation for the same identity; your allowance does not reset."); }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  }
  async function logout() {
    const request = ++generation.current;
    stop("Cloud access ended."); setBusy(true); setIssue(undefined);
    try { await logoutHostedSession(); if (mounted.current && request === generation.current) setIssue("Cloud access ended. This invitation was single-use. Request a replacement for the same identity; your allowance does not reset."); }
    catch { if (mounted.current && request === generation.current) setIssue("Cloud logout could not be confirmed. Voice has stopped. Refresh cloud access explicitly before using cloud features again."); }
    finally { if (mounted.current && request === generation.current) setBusy(false); }
  }
  return {session, authenticated, busy, issue, now, refresh, redeem, logout};
}

export type HostedAccess = ReturnType<typeof useHostedAccess>;
