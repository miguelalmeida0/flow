import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute } from "../../domain/life-model";
import { interpretGlobalCommand, type GlobalIntent } from "./globalInterpreter";

const dateKey = "2026-09-03";
const baseContext: LifeContext = { route: "home", nowMs: new Date("2026-09-03T09:32:00").getTime() };
type Expected = { type: GlobalIntent["type"] } & Record<string, unknown>;

// Each row is manually authored. These are not polite-wrapper multiplication:
// every phrase represents a distinct temporal, query, focus, people, system,
// routing, Calendar, or safety behavior in the product contract.
const corpus: Array<[string, Expected]> = [
  ["Today.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-03" } }],
  ["Show me today.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-03" } }],
  ["Tomorrow.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-04" } }],
  ["Show tomorrow.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-04" } }],
  ["Take me to tomorrow.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-04" } }],
  ["Friday.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-04" } }],
  ["Show Friday.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-04" } }],
  ["Next Friday.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-04" } }],
  ["Tonight.", { type: "temporal", scope: { kind: "day", dateKey: "2026-09-03" } }],
  ["This week.", { type: "temporal", scope: { kind: "week", dateKey: "2026-08-31", endDateKey: "2026-09-06" } }],
  ["Next weekend.", { type: "temporal", scope: { kind: "week", dateKey: "2026-09-05", endDateKey: "2026-09-06" } }],
  ["Tomorrow, what should I wear?", { type: "outfit-query", dateKey: "2026-09-04" }],
  ["Friday, what is the weather?", { type: "weather-query", dateKey: "2026-09-04" }],
  ["What should I wear?", { type: "outfit-query" }],
  ["What should I wear Friday?", { type: "outfit-query", dateKey: "2026-09-04" }],
  ["What do I wear tomorrow?", { type: "outfit-query", dateKey: "2026-09-04" }],
  ["Help me dress today.", { type: "outfit-query", dateKey: "2026-09-03" }],
  ["Do I need an umbrella?", { type: "umbrella-query" }],
  ["Will I need an umbrella tomorrow?", { type: "umbrella-query", dateKey: "2026-09-04" }],
  ["Should I take an umbrella Friday?", { type: "umbrella-query", dateKey: "2026-09-04" }],
  ["Is rain going to catch me after work?", { type: "umbrella-query" }],
  ["How cold will it be when I come home?", { type: "weather-query" }],
  ["What is the weather Friday?", { type: "weather-query", dateKey: "2026-09-04" }],
  ["Will it rain tomorrow?", { type: "weather-query", dateKey: "2026-09-04" }],
  ["When does the sun set?", { type: "daylight-query" }],
  ["What time is sunset?", { type: "daylight-query" }],
  ["Can I walk before sunset?", { type: "daylight-query" }],
  ["What's next?", { type: "next-query" }],
  ["What is my next meeting?", { type: "next-query" }],
  ["Show my next anchor.", { type: "next-query" }],
  ["Give me twenty minutes.", { type: "focus-request", minutes: 20 }],
  ["Give me forty minutes before lunch.", { type: "focus-request", minutes: 40, beforeQuery: "lunch" }],
  ["I need forty minutes to work.", { type: "focus-request", minutes: 40 }],
  ["Can I get half an hour before lunch?", { type: "focus-request", minutes: 30, beforeQuery: "lunch" }],
  ["Start focus.", { type: "focus-request" }],
  ["Start a twenty-five-minute focus session.", { type: "focus-request", minutes: 25 }],
  ["Start a 15 minute focus session.", { type: "focus-request", minutes: 15 }],
  ["Focus on passport for twenty minutes.", { type: "focus-request", minutes: 20, subjectQuery: "passport" }],
  ["Focus on proposal for half an hour.", { type: "focus-request", minutes: 30, subjectQuery: "proposal" }],
  ["How much focus time do I have?", { type: "focus-availability" }],
  ["How much time do I have?", { type: "focus-availability" }],
  ["How much clear time do I have?", { type: "focus-availability" }],
  ["Stop focus.", { type: "focus-stop" }],
  ["Pause focus.", { type: "focus-stop" }],
  ["End the focus session.", { type: "focus-stop" }],
  ["What did you notice?", { type: "instinct-query" }],
  ["What should I know?", { type: "instinct-query" }],
  ["Anything I should know?", { type: "instinct-query" }],
  ["Why this?", { type: "instinct-why" }],
  ["Why that?", { type: "instinct-why" }],
  ["How do you know?", { type: "instinct-why" }],
  ["Not now.", { type: "instinct-dismiss" }],
  ["Dismiss that.", { type: "instinct-dismiss" }],
  ["Hide that.", { type: "instinct-dismiss" }],
  ["Show Sarah.", { type: "person-query", query: "Sarah", prepare: false }],
  ["Prepare me for Sarah.", { type: "person-query", query: "Sarah", prepare: true }],
  ["Show Maya Friday.", { type: "person-query", query: "Maya", prepare: false, dateKey: "2026-09-04" }],
  ["Prepare me for Daniel tomorrow.", { type: "person-query", query: "Daniel", prepare: true, dateKey: "2026-09-04" }],
  ["Who do I need to follow up with?", { type: "people-query", mode: "relevant" }],
  ["Who needs me?", { type: "people-query", mode: "relevant" }],
  ["Show relevant people.", { type: "people-query", mode: "relevant" }],
  ["What promises are at risk?", { type: "people-query", mode: "at-risk" }],
  ["Which promises are at risk?", { type: "people-query", mode: "at-risk" }],
  ["Who am I waiting on?", { type: "people-query", mode: "waiting" }],
  ["What am I waiting on?", { type: "people-query", mode: "waiting" }],
  ["What does Daniel owe me?", { type: "people-query", mode: "owed-by", person: "Daniel" }],
  ["Undo.", { type: "history", direction: "undo" }],
  ["Undo that.", { type: "history", direction: "undo" }],
  ["Redo.", { type: "history", direction: "redo" }],
  ["Redo that.", { type: "history", direction: "redo" }],
  ["What changed?", { type: "what-changed" }],
  ["Start listening.", { type: "session", mode: "start" }],
  ["Pause listening.", { type: "session", mode: "sleep" }],
  ["Do it.", { type: "confirm" }],
  ["Never mind.", { type: "cancel" }],
  ["Help.", { type: "help" }],
  ["Home.", { type: "navigate", route: "home" }],
  ["Open the calendar.", { type: "navigate", route: "calendar" }],
  ["Open the inbox.", { type: "navigate", route: "inbox" }],
  ["Open my plans.", { type: "navigate", route: "plans" }],
  ["Show me my people.", { type: "navigate", route: "people" }],
  ["Take me to Now.", { type: "navigate", route: "now" }],
  ["Go back.", { type: "navigate", route: "back" }],
  ["What fits right now?", { type: "query-now", excluded: [] }],
  ["Something under 20 minutes.", { type: "query-now", excluded: [], maxMinutes: 20 }],
  ["Keep the time free.", { type: "keep-free" }],
  ["Capture renew passport before Senegal.", { type: "capture-create", title: "renew passport before Senegal" }],
  ["Remember to call the embassy.", { type: "capture-create", title: "call the embassy" }],
  ["Add a 30 minute walk at 5.", { type: "calendar" }],
  ["Move my workout to 6.", { type: "calendar" }],
  ["Move deep work before lunch.", { type: "calendar" }],
  ["Make email 20 minutes.", { type: "calendar" }],
  ["Protect lunch.", { type: "calendar" }],
  ["Move the roadmap to tomorrow.", { type: "calendar" }],
  ["Delete the dentist appointment.", { type: "calendar" }],
  ["Coffee.", { type: "unsupported" }],
  ["Tell me a joke.", { type: "unsupported" }],
  ["Move it.", { type: "clarification" }],
  ["Add something.", { type: "clarification" }],
];

describe("manually authored Flow Elite semantic corpus", () => {
  it.each(corpus)("preserves the full semantic payload for %s", (utterance, expected) => {
    expect(interpretGlobalCommand(utterance, baseContext, dateKey)).toMatchObject(expected);
  });

  it("keeps global Elite commands route independent", () => {
    const routes: LifeRoute[] = ["home", "calendar", "inbox", "plans", "people"];
    const global = ["Tomorrow", "What should I wear?", "Give me twenty minutes", "What did you notice?", "Pause listening", "Open the calendar"];
    for (const utterance of global) {
      const expected = interpretGlobalCommand(utterance, baseContext, dateKey);
      for (const route of routes) expect(interpretGlobalCommand(utterance, { ...baseContext, route }, dateKey)).toEqual(expected);
    }
  });

  it("keeps a contextual duration extension in the Calendar pipeline", () => {
    expect(interpretGlobalCommand("I need another twenty minutes on this.", { ...baseContext, selected: { id: "email", kind: "calendar-event", at: baseContext.nowMs! } }, dateKey)).toMatchObject({
      type: "calendar",
      request: { actions: [{ type: "resize", selector: { type: "selected" }, mode: "add", minutes: 20 }, { type: "reflow" }] },
    });
  });
});
