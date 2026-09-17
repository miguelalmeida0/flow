import { useEffect, useRef, useState } from "react";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import type { LifeRoute } from "../../../domain/life-model";

type Destination = Extract<LifeRoute, "calendar" | "inbox" | "plans" | "people">;
const labels = { calendar: "Today", inbox: "Capture", plans: "Outcomes", people: "Commitments" } as const;
const focusReveal = "sr-only focus:not-sr-only focus:pointer-events-auto focus:relative focus:min-h-11 focus:rounded-full focus:bg-flow-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-[#245D9C] focus:ring-offset-2 focus:ring-offset-flow-page";

export function HomeAccessibleActions() {
  const environment = useFlowEnvironment();
  const isHome = environment.route === "home";
  const [selected, setSelected] = useState<Destination>();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function open(route: Destination) {
    setSelected(route);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => environment.navigate(route), 180);
  }
  return <div className="pointer-events-none fixed left-4 top-4 z-[80] flex max-w-[calc(100%-2rem)] flex-wrap gap-2" data-testid="home-accessible-actions">
    {isHome && (["calendar", "inbox", "plans", "people"] as const).map((route) => <button data-action-id="home.accessible-domains"
      data-flow-action="Open primary space"
      data-home-space-card={route}
      data-home-space-receded={String(Boolean(selected && selected !== route))}
      data-home-space-selected={String(selected === route)}
      data-layout-id={`space-${route}`}
      className={focusReveal}
      key={route}
      onClick={() => open(route)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") open(route); }}
      type="button"
    >{labels[route]}</button>)}
    <button data-action-id="session.control"
      aria-label={`Flow Live is ${environment.flowLiveStatus}. ${environment.flowLiveStatus === "sleeping" ? "Start voice session" : "Put voice session to sleep"}`}
      className="sr-only"
      data-flow-live-status={environment.flowLiveStatus}
      data-flow-action="Flow Live session"
      data-testid="flow-live-presence"
      onClick={() => window.dispatchEvent(new CustomEvent("flow-live-command", { detail: environment.flowLiveStatus === "sleeping" ? "start" : "sleep" }))}
      tabIndex={-1}
      type="button"
    >Flow Live {environment.flowLiveStatus}</button>
    {isHome && <button data-action-id="history.undo-redo" aria-label="Undo last change" className={focusReveal} data-flow-action="Undo" disabled={!environment.canUndo} onClick={() => environment.undo()} type="button">Undo</button>}
    {isHome && <button data-action-id="history.undo-redo" aria-label="Redo last change" className={focusReveal} data-flow-action="Redo" disabled={!environment.canRedo} onClick={() => environment.redo()} type="button">Redo</button>}
    {isHome && (() => {
      const capture = environment.document.captures.find(({ status }) => status === "unresolved");
      return capture && <button data-action-id="home.accessible-convert" className={focusReveal} data-flow-action="Make outcome" onClick={() => { environment.focusEntity(capture.id); environment.runCommand("Turn that into a plan", "quick"); }} type="button">Make outcome</button>;
    })()}
    {isHome && (() => {
      const plan = environment.document.plans.find(({ status }) => status === "active");
      const step = plan && environment.document.steps.find(({ planId, status }) => planId === plan.id && status === "planned");
      return step && <button data-action-id="home.accessible-find-time" className={focusReveal} data-flow-action="Find time" onClick={() => { environment.focusEntity(step.id); environment.runCommand(`Find time for ${step.title} step`, "quick"); }} type="button">Find time</button>;
    })()}
    {isHome && (() => {
      const commitment = environment.document.commitments.find(({ status }) => status !== "completed");
      const person = commitment && environment.document.people.find(({ id }) => id === commitment.personId);
      return commitment && person && <button data-action-id="home.accessible-reserve" className={focusReveal} data-flow-action="Reserve time" onClick={() => { environment.focusEntity(commitment.id); environment.runCommand(`Find time for ${commitment.title} promise to ${person.name}`, "quick"); }} type="button">Reserve time</button>;
    })()}
  </div>;
}
