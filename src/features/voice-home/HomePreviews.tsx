import { motion } from "motion/react";
import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { eventColor } from "../day-planner/eventDefaults";
import { formatRange, localDateKey } from "../day-planner/time";
import { useStudioMediaUrl } from "../studio/useStudioMediaUrl";
import { HomeDomainCard } from "./HomeDomainCard";
import { buildEliteHomeModel } from "../elite/eliteViewModel";
import { TodayLens } from "../elite/components/TodayLens";
import { FocusLens } from "../elite/components/FocusLens";
import { WeatherLens } from "../elite/components/WeatherLens";
import { PeopleLens } from "../elite/components/PeopleLens";
import { InstinctLens } from "../elite/components/InstinctLens";
import { useReducedMotionPreference } from "../../shared/motion/useReducedMotionPreference";
import { selectCalendarPreviewEvents } from "./calendarPreview";
import { FriendsPreview } from "../friends/FriendsPreview";

const colorClass = {
  neutral: "bg-[#9CA8A4]", red: "bg-[#C86D63]", orange: "bg-[#C88A52]", yellow: "bg-[#CEAA55]",
  green: "bg-[#6F9D79]", cyan: "bg-[#62A5A2]", blue: "bg-[#688FC4]", indigo: "bg-[#777DB6]",
} as const;

function CalendarPreview() {
  const { renderedCalendar, currentTime, voiceWorld, pending } = useFlowEnvironment();
  const reduced = useReducedMotionPreference();
  const candidateIds = pending?.clarification?.type === "event" ? pending.clarification.choices.map(({ id }) => id) : [];
  const events = selectCalendarPreviewEvents(renderedCalendar, currentTime, { targetId: voiceWorld.targetId, candidateIds });
  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const isToday = renderedCalendar.dateKey === localDateKey(currentTime);
  return <HomeDomainCard destination="today" eyebrow={renderedCalendar.dateKey} icon="calendar" title="Calendar">
    <div className="space-y-2.5 [@media(min-width:1024px)_and_(max-height:900px)]:space-y-1" data-home-calendar-preview>
      {events.map((event) => <motion.div data-calendar-event-continuity={event.id} key={event.id} layoutId={reduced ? undefined : `calendar-event-${event.id}`} transition={reduced ? { duration: 0.1 } : { layout: { duration: 0.48, ease: [0.22, 1, 0.36, 1] } }}>
        <motion.div animate={voiceWorld.targetId === event.id || candidateIds.includes(event.id) ? { x: 4, backgroundColor: "#EDF4EF" } : { x: 0, backgroundColor: "rgba(0,0,0,0)" }} className="flex items-center gap-3 rounded-2xl px-2 py-2 [@media(min-width:1024px)_and_(max-height:900px)]:gap-2 [@media(min-width:1024px)_and_(max-height:900px)]:py-1" data-color={eventColor(event)} data-life-entity-id={event.id} data-visible-reference={candidateIds.includes(event.id) ? "candidate" : voiceWorld.targetId === event.id ? "resolved" : undefined}>
          <span className={`h-9 w-1 shrink-0 rounded-full [@media(min-width:1024px)_and_(max-height:900px)]:h-6 ${colorClass[eventColor(event)]}`} /><span className="min-w-[82px] text-[11px] font-medium text-[#7A746C]">{formatRange(event)}</span><span className="min-w-0 flex-1 truncate text-sm font-medium text-[#2C373C]">{event.title}{candidateIds.includes(event.id) && <span className="block text-[10px] font-normal text-[#4A7773]">Possible match</span>}</span>
        </motion.div>
      </motion.div>)}
      {!events.length && <p className="rounded-2xl border border-dashed border-[#D8CEC2] px-4 py-8 text-center text-sm text-[#756F66]">{isToday && renderedCalendar.events.length ? "Nothing else scheduled today." : "This day is open."}</p>}
      {isToday && nowMinutes >= 7 * 60 && nowMinutes <= 21 * 60 && <p className="pt-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#63837F]">Now · {currentTime.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}</p>}
    </div>
  </HomeDomainCard>;
}

function JournalPreview() {
  const { document, voiceWorld } = useFlowEnvironment();
  const entry = [...document.studio.journalEntries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const excerpt = entry?.text.trim() || entry?.transcriptSegments.at(-1)?.text;
  return <HomeDomainCard destination="journal" eyebrow={entry ? entry.status : "Private by default"} icon="plus" title="Journal">
    <div data-life-entity-id={entry?.id}>{entry ? <><p className="font-serif text-xl text-[#2D383B]">{entry.title}</p><p className="mt-2 text-xs text-[#817970]">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.updatedAt))}</p><p className="mt-5 line-clamp-4 font-serif text-[17px] leading-7 text-[#55564F]">{excerpt || (entry.recordingState === "recording" ? "Listening to this entry…" : "Unfinished is welcome here.")}</p><p className="mt-4 text-xs font-medium text-[#63837F]">{entry.bookmarks.length} marked {entry.bookmarks.length === 1 ? "moment" : "moments"}{voiceWorld.targetId === entry.id ? " · in focus" : ""}</p></> : <div className="grid min-h-[150px] place-items-center rounded-[22px] bg-[#F1E9DC] px-5 text-center"><div><p className="font-serif text-2xl text-[#344047]">There is room.</p><p className="mt-2 text-sm leading-6 text-[#756F66]">Say “New journal entry” and begin anywhere.</p></div></div>}</div>
  </HomeDomainCard>;
}

function MemoriesPreview() {
  const { document } = useFlowEnvironment();
  const memory = [...document.studio.memories].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const { url, missing } = useStudioMediaUrl(memory?.photoAssetId);
  return <HomeDomainCard destination="memories" eyebrow={`${document.studio.memories.length} personal`} icon="star" title="Memories">
    <div data-life-entity-id={memory?.id}>{memory ? <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-4"><div><p className="font-serif text-xl text-[#2D383B]">{memory.title}</p><p className="mt-3 line-clamp-4 font-serif text-[16px] leading-7 text-[#55564F]">{memory.passage}</p><p className="mt-4 text-xs capitalize text-[#63837F]">{memory.composition} · {memory.status}</p></div>{url ? <img alt="Original memory source" className="aspect-[3/4] w-full rounded-2xl object-contain" src={url} /> : <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-dashed border-[#D8CEC2] px-2 text-center text-[10px] text-[#817970]">{missing ? "Source unavailable on this device" : "Words only"}</div>}</div> : <div className="grid min-h-[150px] place-items-center rounded-[22px] bg-[#EFE8DE] px-5 text-center"><div><p className="font-serif text-2xl text-[#344047]">Nothing fabricated.</p><p className="mt-2 text-sm leading-6 text-[#756F66]">Your own words, photographs, marks, and voice will live here.</p></div></div>}</div>
  </HomeDomainCard>;
}

export function HomePreviews() {
  const environment = useFlowEnvironment();
  const legacyModel = buildEliteHomeModel(environment.document, environment.temporalScope, environment.currentTime);
  const insight = environment.nowQuery ? environment.nowCandidates[0] : undefined;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-elite-lens-grid data-testid="locked-home-previews">
    <div><CalendarPreview /></div><div><JournalPreview /></div><div><FriendsPreview /></div><div><MemoriesPreview /></div>
    <div className="col-span-full flex flex-wrap items-center justify-between gap-3 border-t border-[#D8CEC2] px-1 pt-4 text-xs text-[#6F6D68]"><div><h2 className="inline font-semibold text-[#3E514F]">Good to know</h2><span> · {insight?.reason ?? "Flow only surfaces grounded, locally derived context."}</span></div><button data-action-id="home.domain-card" aria-label="Open Focus" className="min-h-11 rounded-full border border-[#CFC4B7] bg-[#FFFDF8] px-4 font-semibold text-[#385E5B] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#376F6A]" data-flow-action="Open Focus" onClick={() => environment.navigate("focus")} type="button">Focus</button><div aria-hidden="true" className="sr-only" data-home-legacy-projections><TodayLens model={legacyModel} /><FocusLens model={legacyModel} /><WeatherLens model={legacyModel} /><PeopleLens model={legacyModel} /><InstinctLens model={legacyModel} /></div></div>
  </div>;
}
