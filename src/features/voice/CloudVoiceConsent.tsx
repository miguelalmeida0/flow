import { useRef, useState, type FormEvent } from "react";
import type { HostedAccess } from "./useHostedAccess";
import type { KyutaiVoiceSession } from "./useKyutaiVoiceSession";

const control = "min-h-11 rounded-lg border border-flow-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue disabled:opacity-50";
export function CloudVoiceConsent({access, voice, recording}: {access:HostedAccess; voice:Pick<KyutaiVoiceSession,"active"|"status"|"reason"|"expiresAt"|"start"|"stop">; recording:boolean}) {
  const [invite,setInvite] = useState("");
  const [consent,setConsent] = useState<string | null>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const inviteInput = useRef<HTMLInputElement>(null);
  const version = access.session?.consentVersion;
  async function submit(event:FormEvent) {
    event.preventDefault();
    if (consent !== version || !version || !invite.trim() || access.busy) return;
    const code = invite.trim(); setInvite(""); setConsent(null);
    await access.redeem(code,version);
    requestAnimationFrame(()=>panel.current?.closest('[data-flow-region="command"]')?.querySelector<HTMLButtonElement>('[data-action-id="cloud.voice"]')?.focus({preventScroll:true}));
  }
  const remaining = voice.expiresAt ? Math.max(0,Math.ceil((voice.expiresAt-access.now)/1000)) : undefined;
  return <details ref={panel} className="mb-2 rounded-2xl border border-flow-border bg-flow-elevated text-flow-ink" data-hosted-access>
    <summary data-action-id="cloud.disclosure" className="min-h-11 cursor-pointer px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue">Cloud features · {access.authenticated ? voice.status === "active" ? "Voice active" : voice.status === "connecting" ? "Connecting voice" : "Voice stopped" : "Access required"}</summary>
    <div className="max-h-[42dvh] space-y-3 overflow-y-auto border-t border-flow-border px-4 py-3 text-sm" aria-label="Cloud features">
      <p>Flow saves your calendar, journal, and media in this browser. Cloud requests send your command and limited context to OpenAI: recent commands and replies, referenced item labels, and relevant lookup results. After you start voice, Deepgram receives microphone audio and OpenAI generates spoken replies. The voice is AI-generated. Stop or hide this tab to end microphone capture.</p>
      <p>This address has its own browser data. Your previous Flow data remains at the previous address. <a className="underline underline-offset-4" href="https://miguelalmeida0.github.io/flow/">Previous Flow version</a>. There is no cloud backup or cross-device sync.</p>
      {access.authenticated ? <>
        <p>Cloud access expires at <time dateTime={new Date(access.session!.expiresAt!).toISOString()}>{new Date(access.session!.expiresAt!).toLocaleTimeString()}</time>. {access.session?.reasoningEnabled ? "Cloud reasoning is available for typed requests." : "Cloud reasoning is unavailable; supported typed commands still work."}</p>
        <p role="status">{voice.status === "active" ? `Cloud voice active${remaining === undefined ? "" : ` · ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,"0")} remaining`}.` : voice.status === "connecting" ? "Connecting voice. Microphone capture begins only after the provider is ready." : voice.reason ?? "Voice is stopped. Choose Start voice to begin."}</p>
        {!access.session?.speechEnabled && <p>Cloud voice is unavailable. Supported typed commands still work.</p>}
        {voice.active && recording && <p>Stopping voice also finishes the active microphone recording. Flow will show whether its audio was saved.</p>}
        <button data-action-id="cloud.logout" type="button" className={control} disabled={access.busy} onClick={()=>{void access.logout().then(()=>requestAnimationFrame(()=>inviteInput.current?.focus({preventScroll:true})));}}>Log out of cloud access</button>
      </> : <form onSubmit={event=>void submit(event)} className="space-y-3">
        <p>Invitations are single-use. After logout or access expiry, request a replacement for the same identity. Your allowance does not reset. Enabling access does not start your microphone.</p>
        <label className="block">Invitation code<input ref={inviteInput} data-action-id="cloud.invite" className={`${control} mt-1 w-full`} autoComplete="off" spellCheck={false} value={invite} onChange={event=>setInvite(event.target.value)} maxLength={256} type="password" /></label>
        <label className="flex min-h-11 items-center gap-3"><input data-action-id="cloud.consent" type="checkbox" checked={Boolean(version && consent === version)} onChange={event=>setConsent(event.target.checked ? version ?? null : null)} />I agree to cloud processing</label>
        <button data-action-id="cloud.redeem" className={control} type="submit" disabled={access.busy || consent !== version || !invite.trim() || !version}>Enable cloud access</button>
      </form>}
      {access.issue && <p role="status">{access.issue}</p>}
      <button data-action-id="cloud.refresh" type="button" className={control} disabled={access.busy} onClick={()=>void access.refresh()}>Refresh cloud access</button>
    </div>
  </details>;
}
