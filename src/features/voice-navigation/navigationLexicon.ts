import type { NavigationTarget } from "./model";

export interface NavigationDestinationDefinition {
  id: string;
  label: string;
  target: NavigationTarget;
  aliases: readonly string[];
  safeFolds?: readonly string[];
}

export const navigationFrames = [
  "go back to", "take me back to", "bring me back to", "get me back to", "take me back", "bring me back", "i want to go to", "i want to go", "go back",
  "open", "see", "show", "show me", "show what is in", "go", "go to", "take me", "take me to", "back", "bring me to", "bring up",
  "pull up", "switch to", "change to", "jump to", "head to", "navigate to", "enter",
  "visit", "display", "launch", "let me see", "i want to see", "i would like to see",
  "can you open", "could you open", "would you open", "can we go to", "let s go to",
  "go into", "take me over to", "return to", "return", "come back to", "i want", "can i see", "let me open",
] as const;

export const genericSurfaceNouns = [
  "area", "section", "page", "screen", "view", "tab", "space", "container", "panel",
  "module", "world", "room", "menu", "place", "mode",
] as const;

export const navigationDestinations: readonly NavigationDestinationDefinition[] = [
  { id: "home", label: "Home", target: { world: "home" }, aliases: ["home", "homepage", "main", "main page", "main screen", "start", "start page", "start screen", "overview", "front page", "home page", "dashboard", "back home"] },
  { id: "today", label: "Today", target: { world: "today" }, aliases: ["today", "calendar", "schedule", "agenda", "day", "my day", "day view", "day planner", "timeline", "calendar area", "schedule area"] },
  { id: "focus", label: "Focus", target: { world: "focus" }, aliases: ["focus", "focus area", "focus view", "focus mode", "focus session", "deep work", "work session", "timer", "focus timer", "concentration"], safeFolds: ["focus aria"] },
  { id: "weather-outfit", label: "Weather & Outfit", target: { world: "weather-outfit" }, aliases: ["weather", "forecast", "weather and outfit", "weather outfit", "outfit", "clothes", "clothing", "outside conditions"], safeFolds: ["weather and out fit"] },
  { id: "people", label: "People", target: { world: "people" }, aliases: ["people", "person", "contacts", "friends", "people area", "who matters", "my people"] },
  { id: "good-to-know", label: "Good to know", target: { world: "good-to-know" }, aliases: ["good to know", "insights", "heads up", "brief", "recommendations", "useful things", "things to know"], safeFolds: ["good to no"] },
  { id: "capture", label: "Capture", target: { world: "capture" }, aliases: ["capture", "capture area", "inbox", "notes", "thoughts", "quick capture", "brain dump", "capture page"] },
  { id: "outcomes", label: "Outcomes", target: { world: "outcomes" }, aliases: ["outcomes", "plans", "goals", "projects", "roadmap", "outcome area", "plans area", "goals page"] },
  { id: "journal", label: "Journal", target: { world: "journal" }, aliases: ["journal", "my journal", "journal area", "journal page", "journal screen", "journal section", "journal place", "writing", "writing space"] },
  { id: "atmosphere", label: "Atmosphere", target: { world: "atmosphere" }, aliases: ["atmosphere", "atmospheres", "sound", "sound space", "music", "music area", "listening room", "sound instrument", "shape sound", "shape the sound"] },
  { id: "memories", label: "Memories", target: { world: "memories" }, aliases: ["memories", "memory", "memory area", "memory page", "my memories", "pieces", "keepsakes"] },
  { id: "commitments", label: "People · Commitments", target: { world: "people", view: "commitments" }, aliases: ["commitments", "promises", "things i owe", "waiting on", "follow ups", "commitments area", "promises page"], safeFolds: ["commit mints", "commit mints area"] },
] as const;
