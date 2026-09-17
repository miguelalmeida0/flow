import { useEffect, useState } from "react";
import type { HomeEntrancePhase } from "./voiceWorld";
import { WAKE_ACKNOWLEDGEMENT_CANCEL, WAKE_ACKNOWLEDGEMENT_REQUEST, type WakeAcknowledgementRequest } from "./wakeAcknowledgementEvent";

/** A pre-mounted shell surface acknowledges the wake word before Home performs
 * its richer scene change. Home replaces it after the first reward paint. */
export function WakeAcknowledgement({ entrance }: { entrance: HomeEntrancePhase }) {
  const [request, setRequest] = useState<WakeAcknowledgementRequest>();

  useEffect(() => {
    const show = (event: Event) => setRequest((event as CustomEvent<WakeAcknowledgementRequest>).detail);
    const cancel = (event: Event) => setRequest((current) => current?.identifier === (event as CustomEvent<{ identifier: string }>).detail.identifier ? undefined : current);
    window.addEventListener(WAKE_ACKNOWLEDGEMENT_REQUEST, show);
    window.addEventListener(WAKE_ACKNOWLEDGEMENT_CANCEL, cancel);
    return () => {
      window.removeEventListener(WAKE_ACKNOWLEDGEMENT_REQUEST, show);
      window.removeEventListener(WAKE_ACKNOWLEDGEMENT_CANCEL, cancel);
    };
  }, []);

  useEffect(() => {
    if (entrance === "wake-reward") setRequest(undefined);
  }, [entrance]);

  return <output
    aria-hidden={request ? undefined : true}
    aria-live="polite"
    className={`pointer-events-none fixed left-1/2 top-24 z-[72] -translate-x-1/2 rounded-full border border-[#BFD0CB] bg-[#FFFDF8] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#376F6A] shadow-[0_8px_24px_rgba(35,43,55,0.08)] ${request ? "visible opacity-100" : "invisible opacity-0"}`}
    data-shell-wake-acknowledgement
    data-wake-acknowledgement-id={request?.identifier}
    {...{ elementtiming: request?.identifier }}
  >{request?.text ?? ""}</output>;
}
