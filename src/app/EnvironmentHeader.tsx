import { useFlowEnvironment } from "./FlowEnvironmentProvider";
import { Icon } from "../shared/design-system/Icon";

const labels = {
  home: "Home",
  today: "Today",
  focus: "Focus",
  "weather-outfit": "Weather & Outfit",
  people: "Friends",
  "good-to-know": "Good to know",
  capture: "Capture",
  outcomes: "Outcomes",
  journal: "Journal",
  atmosphere: "Atmosphere",
  memories: "Memories",
  calendar: "Today",
  inbox: "Capture",
  plans: "Outcomes",
  now: "Today",
} as const;

export function EnvironmentHeader() {
  const { route, navigate, goBack, canUndo, canRedo, undo, redo } = useFlowEnvironment();
  return <header className="sticky top-0 z-40 flex h-[64px] shrink-0 items-center justify-between border-b border-[#E9E3DC] bg-flow-page/95 px-3 backdrop-blur-md sm:h-[72px] sm:px-7 lg:px-10 xl:px-12">
    <div className="flex min-w-0 items-center gap-2 sm:gap-4">
      <button data-action-id="navigation.home" aria-label="Open Flow home" className="min-h-11 rounded-xl font-serif text-2xl italic tracking-[-0.04em] text-flow-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue" data-flow-action="Home" onClick={() => navigate("home")} type="button">Flow</button>
      {route !== "home" && <><span aria-hidden className="h-5 w-px bg-[#DDD5CD]"/><button data-action-id="navigation.back" aria-label="Go back" className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-sm text-[#68727D] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-flow-blue" data-flow-action="Go back" onClick={goBack} type="button"><span aria-hidden>←</span><span className="hidden sm:inline">Back</span></button><h1 className="truncate font-serif text-lg text-flow-ink sm:text-xl">{labels[route]}</h1></>}
    </div>
    <div className="flex items-center gap-1">
      <button data-action-id="history.undo-redo" aria-label="Undo last change" className="grid size-11 place-items-center rounded-full text-[#66717D] hover:bg-white disabled:opacity-25" data-flow-action="Undo" disabled={!canUndo} onClick={() => undo()} type="button"><Icon name="undo" size={17}/></button>
      <button data-action-id="history.undo-redo" aria-label="Redo last change" className="grid size-11 place-items-center rounded-full text-[#66717D] hover:bg-white disabled:opacity-25" data-flow-action="Redo" disabled={!canRedo} onClick={() => redo()} type="button"><Icon className="scale-x-[-1]" name="undo" size={17}/></button>
    </div>
  </header>;
}
