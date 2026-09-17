import { motion, useMotionValue, useTransform } from "motion/react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { buildEliteHomeModel } from "../elite/eliteViewModel";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { HOME_LAYOUT_SETTLED_EVENT } from "../../core/mascot/useMascotSafeZone";
import { mascotPresentation, type MascotPresentation } from "../../core/mascot/mascot-model";
import { MascotRenderer } from "../../core/mascot/MascotRenderer";
import { VoiceEnergy } from "../voice-home/VoiceEnergy";
import { HomePreviews } from "../voice-home/HomePreviews";
import type { HomeEntrancePhase, VoiceWorldPhase } from "../voice-home/voiceWorld";
import { homeSurfaceColor, homeSurfaceInk } from "../voice-home/homeSurfaceInk";
import { HomeDateScene } from "./HomeDateScene";

function homeMascotPresentation(base: MascotPresentation, entrance: HomeEntrancePhase, phase: VoiceWorldPhase, attention: MascotPresentation["attention"]): MascotPresentation {
  if (entrance === "wake-armed") return { state: "resting", sequence: base.sequence };
  if (entrance === "wake-reward" || entrance === "preparing") return { state: "big-win", sequence: base.sequence + 1, ceremony: "wake" };
  if (phase === "listening") return { state: "listening", sequence: base.sequence };
  if (phase === "targeting" || phase === "executing") return { state: "thinking", sequence: base.sequence, attention };
  if (phase === "clarifying" || phase === "error") return { state: "uncertain", sequence: base.sequence };
  if (phase === "success") return { state: "small-win", sequence: base.sequence };
  return { state: "attentive", sequence: base.sequence };
}

export function HomeSpace() {
  const environment = useFlowEnvironment();
  const reducedMotion = useReducedMotionPreference();
  const { document, temporalScope, currentTime, voiceWorld, flowLiveStatus, feedback } = environment;
  const surfaceColor = homeSurfaceColor(voiceWorld.entrance);
  const backgroundColor = useMotionValue(surfaceColor);
  const surfaceInk = useTransform(backgroundColor, homeSurfaceInk);
  const model = buildEliteHomeModel(document, temporalScope, currentTime);
  const activeHome = voiceWorld.entrance === "active";
  const assemblingHome = voiceWorld.entrance === "preparing";
  const baseMascot = mascotPresentation(environment.reward, flowLiveStatus, feedback.phase, Boolean(document.focus.active));
  const mascot = homeMascotPresentation(baseMascot, voiceWorld.entrance, voiceWorld.phase, voiceWorld.targetDirection ? {
    domain: voiceWorld.domain,
    entityId: voiceWorld.targetId,
    direction: voiceWorld.targetDirection,
    actionId: voiceWorld.actionId,
    motionStage: voiceWorld.targetMotionStage,
  } : undefined);
  const domainName = voiceWorld.domain === "today" ? "Calendar" : voiceWorld.domain ? voiceWorld.domain.charAt(0).toUpperCase() + voiceWorld.domain.slice(1) : undefined;
  const activeSession = ["listening", "targeting", "executing", "success", "clarifying", "error"].includes(voiceWorld.phase);
  const wakePrompt = flowLiveStatus === "listening" ? "Say “Flow” to wake me up."
    : flowLiveStatus === "permission-denied" ? "Microphone access is blocked."
      : ["sleeping", "moved", "suspended"].includes(flowLiveStatus) ? "Voice is paused."
        : ["unavailable", "microphone-unavailable", "recognition-busy", "start-failed"].includes(flowLiveStatus) ? "Voice needs attention."
          : "Connecting your microphone…";
  const primary = voiceWorld.entrance === "wake-armed" ? wakePrompt
    : voiceWorld.entrance === "wake-reward" ? "Hi there!"
      : voiceWorld.entrance === "preparing" ? "All set."
        : voiceWorld.phase === "targeting" ? voiceWorld.actionId ? `Opening ${domainName ?? "it"}…` : "I’m listening…"
          : voiceWorld.phase === "executing" ? `${domainName ?? "Flow"} is moving.`
            : voiceWorld.phase === "success" ? "Done."
              : voiceWorld.phase === "clarifying" ? "I need one detail."
                : voiceWorld.phase === "error" ? "I couldn't apply that."
                : activeSession ? "I’m listening…" : model.greeting;
  const secondary = voiceWorld.entrance === "wake-armed" ? flowLiveStatus === "listening" ? "Your voice. Your life. A calmer, brighter you." : "Allow microphone access if asked. Voice controls and the keyboard are below."
    : voiceWorld.entrance === "wake-reward" ? "I heard you."
      : voiceWorld.entrance === "preparing" ? "Bringing your world into view."
        : voiceWorld.phase === "clarifying" ? "Choose the precise match below and I’ll continue."
          : voiceWorld.phase === "error" ? "Nothing changed. You can try another phrasing."
          : activeSession ? (voiceWorld.transcript || model.summary)
            : "Say “Flow” when you need me.";

  return <motion.section
    animate={{ backgroundColor: surfaceColor }}
    style={{ backgroundColor, color: surfaceInk }}
    className={`relative flex min-h-full w-full flex-col px-4 pb-5 pt-5 sm:px-7 sm:pb-6 sm:pt-6 lg:px-10 xl:px-12 ${activeHome ? "[@media(min-width:1024px)_and_(max-height:900px)]:py-3" : ""}`}
    data-home-entrance={voiceWorld.entrance}
    data-testid="home-space"
    data-voice-domain={voiceWorld.domain}
    data-voice-phase={voiceWorld.phase}
    transition={reducedMotion ? { duration: 0.1 } : { duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
  >
    <header className="relative z-20 flex items-start justify-between gap-4">
      <div><p className="font-serif text-[42px] italic leading-none tracking-[-0.045em]">Flow</p><p className={`mt-2 text-sm ${activeHome ? "text-[#736F68]" : "text-inherit"}`}>A calmer, smarter you.</p></div>
      <div className={`text-right text-[11px] font-medium uppercase tracking-[0.14em] ${activeHome ? "text-[#736F68]" : "text-inherit"}`}><p>{model.dateLabel}</p><p className="mt-2 normal-case tracking-normal">{flowLiveStatus === "listening" ? "Live voice ready" : flowLiveStatus === "unavailable" ? "Typed control ready" : "Wake-aware session"}</p></div>
    </header>

    <div className={`relative z-10 mx-auto flex min-h-0 w-full max-w-[1840px] flex-1 flex-col ${activeHome ? "" : "justify-center"}`}>
      <div className={activeHome ? "mx-auto mt-6 grid max-w-[1140px] items-center justify-items-center gap-5 md:grid-cols-[minmax(0,1fr)_160px] [@media(min-width:1024px)_and_(max-height:900px)]:mt-2 [@media(min-width:1024px)_and_(max-height:900px)]:gap-2" : "grid justify-items-center gap-[clamp(16px,3vh,36px)]"} data-home-composition>
      <motion.div className="mx-auto w-full max-w-3xl text-center" data-home-hero layout={reducedMotion ? false : "position"}>
        <motion.div animate={{ opacity: 1, y: 0 }} initial={reducedMotion || voiceWorld.entrance === "wake-reward" ? false : { opacity: 0, y: 8 }} key={`${voiceWorld.entrance}-${voiceWorld.phase}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${activeHome ? "text-[#63837F]" : "text-inherit"}`}>{activeHome ? "Your living day" : voiceWorld.entrance === "wake-armed" ? "Waiting for you" : "Flow is awake"}</p>
          <h1 {...{ elementtiming: voiceWorld.entrance === "wake-reward" ? `flow-wake-heading-${voiceWorld.sequence}` : undefined }} className={`mt-4 font-serif font-normal leading-[0.98] tracking-[-0.05em] ${activeHome ? "text-[clamp(3rem,5vw,6rem)] text-[#233039] [@media(min-width:1024px)_and_(max-height:900px)]:mt-2 [@media(min-width:1024px)_and_(max-height:900px)]:text-[42px]" : "min-h-[1.96em] text-[clamp(2.5rem,6vw,5.8rem)] text-inherit"}`}>{primary}</h1>
          <p aria-live="polite" data-home-transcript className={`mx-auto mt-5 max-w-2xl text-sm leading-6 sm:text-base ${activeHome ? "text-[#706C65] [@media(min-width:1024px)_and_(max-height:900px)]:mt-2 [@media(min-width:1024px)_and_(max-height:900px)]:line-clamp-2" : "text-inherit"}`}>{secondary}</p>
        </motion.div>
        {activeHome && <VoiceEnergy phase={voiceWorld.phase} sequence={voiceWorld.sequence} />}
        {activeHome && <p className="mt-1 text-[11px] text-[#837C73]">Try “Show my calendar” · “New journal entry” · “Play Sunday evening” · “Open my memories”</p>}
      </motion.div>
      <motion.div
        className={activeHome ? "relative z-20 w-[130px] shrink-0 origin-bottom md:w-[160px] [@media(min-width:1024px)_and_(max-height:900px)]:w-[110px]" : "relative z-20 w-[clamp(140px,24vh,206px)] shrink-0 origin-bottom"}
        data-home-mascot-flight
        data-home-mascot-layout-owner="flow-layout"
        data-home-mascot-placement={activeHome ? "home-perch" : assemblingHome ? "preparing-flight" : "wake-anchor"}
        initial={false}
        layout={reducedMotion ? false : "position"}
        transition={reducedMotion ? { duration: 0.1 } : { duration: 0.82, ease: [0.22, 1, 0.36, 1] }}
      ><MascotRenderer layoutKey="locked-home" placement="home" presentation={mascot} /></motion.div>
      {!activeHome && <VoiceEnergy phase={voiceWorld.phase} sequence={voiceWorld.sequence} />}
      </div>

      <motion.div
        animate={{ opacity: activeHome ? 1 : assemblingHome ? 0.24 : 0, y: activeHome ? 0 : assemblingHome ? 38 : 56, scale: activeHome ? 1 : assemblingHome ? 0.98 : 0.96 }}
        aria-hidden={!activeHome}
        className={`mt-6 sm:mt-8 xl:mt-10 ${activeHome ? "pointer-events-auto [@media(min-width:1024px)_and_(max-height:900px)]:mt-3" : "pointer-events-none absolute inset-x-0 top-full"}`}
        data-home-temporal-scene
        inert={activeHome ? undefined : true}
        onAnimationComplete={() => activeHome && window.dispatchEvent(new Event(HOME_LAYOUT_SETTLED_EVENT))}
        transition={reducedMotion ? { duration: 0.1 } : { duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
      ><HomeDateScene active={activeHome} scopeKey={`${temporalScope.kind}:${temporalScope.dateKey}:${temporalScope.endDateKey ?? ""}`}><HomePreviews /></HomeDateScene></motion.div>
    </div>
  </motion.section>;
}
