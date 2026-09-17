import { LayoutGroup, motion } from "motion/react";
import type { RecognitionAdapter, VoiceLocale } from "../features/day-planner/voice/recognition";
import type { PromptSpeechAdapter } from "../features/voice/promptSpeech";
import { CalendarSpace } from "../features/day-planner/CalendarSpace";
import { HomeSpace } from "../features/home/HomeSpace";
import { InboxSpace } from "../features/inbox/InboxSpace";
import { PeopleSpace } from "../features/people/PeopleSpace";
import { PlansSpace } from "../features/plans/PlansSpace";
import { FocusSpace } from "../features/focus/FocusSpace";
import { WeatherOutfitSpace } from "../features/weather/WeatherOutfitSpace";
import { GoodToKnowSpace } from "../features/insights/GoodToKnowSpace";
import { GlobalCommandDock } from "../shared/command/GlobalCommandDock";
import { SharedFlightLayer } from "../shared/motion/SharedFlightLayer";
import { MotionBoundary } from "../shared/motion/MotionBoundary";
import { useReducedMotionPreference } from "../shared/motion/useReducedMotionPreference";
import type { LiveOwnershipCoordinator } from "../features/voice/liveOwnership";
import { EnvironmentHeader } from "./EnvironmentHeader";
import { FlowEnvironmentProvider, useFlowEnvironment } from "./FlowEnvironmentProvider";
import type { WeatherProvider } from "../features/elite/weather";
import { HomeAccessibleActions } from "../features/elite/components/HomeAccessibleActions";
import { RewardLayer } from "../shared/rewards/RewardLayer";
import { RewardInspector } from "../shared/rewards/RewardInspector";
import { TimeScopeControl } from "../features/elite/components/TimeScopeControl";
import { StudioRuntimeProvider } from "../features/studio/StudioRuntimeProvider";
import { JournalSpace } from "../features/studio/journal/JournalSpace";
import { AtmosphereSpace } from "../features/studio/atmosphere/AtmosphereSpace";
import { MemoriesSpace } from "../features/studio/memory/MemoriesSpace";
import { StudioRestingShelf, StudioSecondarySurface } from "../features/studio/StudioSecondarySurface";
import { VoiceInspector } from "../shared/command/VoiceInspector";
import { VoiceTargetPulse } from "../features/voice-home/VoiceEnergy";
import { WakeAcknowledgement } from "../features/voice-home/WakeAcknowledgement";
import { pageTaskEntity, usePageTaskReveal } from "./usePageTaskReveal";

function EnvironmentProjection({ recognitionAdapter, voiceLocale, liveOwnership, promptSpeechAdapter }: { recognitionAdapter?: RecognitionAdapter; voiceLocale?: VoiceLocale; liveOwnership?: LiveOwnershipCoordinator; promptSpeechAdapter?: PromptSpeechAdapter }) {
  const { document, route, peopleView, voiceWorld, pageNavigation, conversationContext: context, focusedEntityId, activePlanId } = useFlowEnvironment();
  const reducedMotion = useReducedMotionPreference();
  const taskEntity = pageTaskEntity(document, route, context, focusedEntityId, activePlanId, peopleView);
  usePageTaskReveal(route, taskEntity, pageNavigation, reducedMotion);
  const screens = {
    home: <HomeSpace />,
    today: <CalendarSpace />,
    focus: <FocusSpace />,
    "weather-outfit": <WeatherOutfitSpace />,
    people: <PeopleSpace />,
    "good-to-know": <GoodToKnowSpace />,
    capture: <InboxSpace />,
    outcomes: <PlansSpace />,
    journal: <JournalSpace />,
    atmosphere: <AtmosphereSpace />,
    memories: <MemoriesSpace />,
  };
  const motionRoute = route === "capture" ? "inbox" : route === "outcomes" ? "plans" : route;
  return <MotionBoundary>
    <div className="fixed inset-0 flex h-dvh flex-col overflow-clip bg-flow-page text-flow-ink antialiased [overflow-anchor:none] selection:bg-flow-blue/15" data-flow-viewport>
      <WakeAcknowledgement entrance={voiceWorld.entrance} />
      {route !== "home" && <EnvironmentHeader />}
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto" data-primary-content-rect data-flow-region="primary">
        <LayoutGroup id="flow-spaces">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            data-layout-id={reducedMotion ? undefined : `space-${motionRoute}`}
            data-space-shell={route}
            className={route === "home" && voiceWorld.entrance !== "active" ? "h-full" : undefined}
            data-space-transition-mode={reducedMotion ? "reduced" : "shared-layout"}
            // Route content must never disappear while a shared entity carries
            // the transition. The transient Tide/Bloom layer explains the
            // change; hiding the whole destination creates a blank-world flash
            // on reloads and compact viewports.
            initial={false}
            key={route}
            transition={reducedMotion ? { duration: 0.1 } : { duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
          >{screens[route]}</motion.div>
        </LayoutGroup>
      </main>
      <VoiceTargetPulse home={route === "home" && ["today", "journal", "people", "memories"].includes(voiceWorld.domain ?? "")} snapshot={voiceWorld} />
      <footer className="relative z-50 shrink-0 border-t border-flow-border bg-flow-page px-3 py-2" data-workspace-dock>
        <StudioSecondarySurface />
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center justify-center gap-4 sm:justify-between">
          <GlobalCommandDock promptSpeechAdapter={promptSpeechAdapter} liveOwnership={liveOwnership} recognitionAdapter={recognitionAdapter} voiceLocale={voiceLocale} />
          {route === "home" && voiceWorld.entrance === "active" && <div data-flow-region="time"><TimeScopeControl /></div>}
          {route !== "home" && <StudioRestingShelf />}
        </div>
      </footer>
      <HomeAccessibleActions />
      <SharedFlightLayer />
      <RewardLayer />
      <RewardInspector />
      <VoiceInspector />
    </div>
  </MotionBoundary>;
}

export function FlowEnvironmentApp({ recognitionAdapter, voiceLocale, now, liveOwnership, weatherProvider, promptSpeechAdapter }: { recognitionAdapter?: RecognitionAdapter; voiceLocale?: VoiceLocale; now?: () => Date; liveOwnership?: LiveOwnershipCoordinator; weatherProvider?: WeatherProvider; promptSpeechAdapter?: PromptSpeechAdapter }) {
  return <FlowEnvironmentProvider now={now} weatherProvider={weatherProvider}><StudioRuntimeProvider><EnvironmentProjection promptSpeechAdapter={promptSpeechAdapter} liveOwnership={liveOwnership} recognitionAdapter={recognitionAdapter} voiceLocale={voiceLocale} /></StudioRuntimeProvider></FlowEnvironmentProvider>;
}
