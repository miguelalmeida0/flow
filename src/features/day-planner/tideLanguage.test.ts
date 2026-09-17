import { describe, expect, it } from "vitest";
import { interpretTranscript } from "./parser";
import type { CalendarAction } from "./model";

const today = "2026-09-02";

interface LanguageCase {
  utterance: string;
  types: CalendarAction["type"][];
  mode?: "commit" | "preview";
  patch?: Record<string, unknown>;
  firstAction?: Record<string, unknown>;
  actions?: Record<string, unknown>[];
  constraints?: Record<string, unknown>[];
}

// New Tide acceptance language. These rows are deliberately separate from the
// The parser suite has 156 distinct utterances. The release runner de-duplicates
// exact utterances across suites; every row below still owns a complete Tide
// golden request for P0/P1 vocabulary, zero-selection references, or bindings.
const tideCorpus: LanguageCase[] = [
  { utterance: "Move the 2 PM meeting to four", types: ["move"], firstAction: { selector: { type: "source", at: 14 * 60, query: "meeting" }, destination: { type: "absolute", minutes: 16 * 60 } } },
  { utterance: "Put the two PM meeting to quarter past four", types: ["move"] },
  { utterance: "Shift the event at fourteen hundred back twenty minutes", types: ["shift"], firstAction: { selector: { type: "source", at: 14 * 60, query: "event" }, deltaMinutes: 20 } },
  { utterance: "Move my next meeting after lunch", types: ["move"], firstAction: { selector: { type: "position", position: "next" }, destination: { type: "relative", relation: "after", anchor: { type: "title", query: "lunch" } } } },
  { utterance: "Move the current event after the interview", types: ["move"] },
  { utterance: "Put roadmap on Thursday afternoon", types: ["defer"] },
  { utterance: "Move this after the interview", types: ["move"] },
  { utterance: "Change the meeting at 2 PM to half past four", types: ["move"] },
  { utterance: "Move roadmap to the next free slot", types: ["move"] },
  { utterance: "Move email before lunch", types: ["move"] },
  { utterance: "Push everything after lunch back thirty minutes", types: ["shift"], firstAction: { selector: { type: "all", after: { type: "title", query: "lunch" } }, deltaMinutes: 30 } },
  { utterance: "Move light work after lunch", types: ["move"] },

  { utterance: "Add lunch with Ana tomorrow at one", types: ["create"], firstAction: { title: "lunch with Ana", durationMinutes: 30, destination: { type: "absolute", minutes: 13 * 60, date: "tomorrow" } } },
  { utterance: "Schedule review next Thursday at half past three", types: ["create"], firstAction: { title: "review", durationMinutes: 30, destination: { type: "absolute", minutes: 15 * 60 + 30, date: { dateKey: "2026-09-03" } } } },
  { utterance: "Block seventy five minutes for planning at ten", types: ["create"], firstAction: { title: "planning", durationMinutes: 75, destination: { type: "absolute", minutes: 10 * 60 } } },
  { utterance: "Schedule debrief at noon", types: ["create"] },
  { utterance: "Add a forty minute walk after design review", types: ["create"] },
  { utterance: "Schedule a quick twenty five minute call tomorrow at eleven", types: ["create"] },
  { utterance: "Create a thirty minute focus block at quarter past four", types: ["create"] },
  { utterance: "Add a one hour reading block tomorrow afternoon", types: ["create"] },
  { utterance: "Schedule a fifteen minute reset before lunch", types: ["create"] },
  { utterance: "Block thirty minutes for expenses at three", types: ["create"] },

  { utterance: "Stretch the 2 PM meeting to ninety minutes", types: ["resize"], firstAction: { selector: { type: "source", at: 14 * 60, query: "meeting" }, mode: "set", minutes: 90 } },
  { utterance: "Trim the next meeting by ten minutes", types: ["resize"] },
  { utterance: "Give interview another fifteen minutes", types: ["resize"] },
  { utterance: "Make focus one hour and fifteen minutes", types: ["resize"] },
  { utterance: "Shorten current event by twenty minutes", types: ["resize"] },
  { utterance: "Extend roadmap by half an hour", types: ["resize"] },
  { utterance: "Make the event at 2 PM forty five minutes", types: ["resize"] },
  { utterance: "Reduce the selected event by a quarter hour", types: ["resize"] },
  { utterance: "Make dinner ninety minutes", types: ["resize"], firstAction: { selector: { type: "title", query: "dinner" }, mode: "set", minutes: 90 } },
  { utterance: "Extend the previous appointment by ten minutes", types: ["resize"] },

  { utterance: "Make the 2 PM meeting important and red", types: ["update"], patch: { importance: "important", color: "red" } },
  { utterance: "Mark roadmap critical", types: ["update"], patch: { importance: "critical" } },
  { utterance: "Set lunch back to normal importance", types: ["update"], patch: { importance: "normal" } },
  { utterance: "Paint interview cyan", types: ["update"], patch: { color: "cyan" } },
  { utterance: "Color deep work blue", types: ["update"], patch: { color: "blue" } },
  { utterance: "Make current event orange and critical", types: ["update"], patch: { color: "orange", importance: "critical" } },
  { utterance: "Make the next meeting green", types: ["update"], patch: { color: "green" } },
  { utterance: "Make the event covering 2:30 red", types: ["update"], patch: { color: "red" }, firstAction: { selector: { type: "source", at: 14 * 60 + 30, query: "event" } } },
  { utterance: "Make the last event yellow", types: ["update"], patch: { color: "yellow" } },
  { utterance: "Make roadmap indigo", types: ["update"], patch: { color: "indigo" } },
  { utterance: "Paint lunch neutral", types: ["update"], patch: { color: "neutral" } },
  { utterance: "Make interview blue and important", types: ["update"], patch: { color: "blue", importance: "important" } },
  { utterance: "Make every red meeting neutral", types: ["update"], patch: { color: "neutral" }, firstAction: { selector: { type: "filter", cardinality: "many", color: "red" } } },
  { utterance: "Make all yellow tasks blue", types: ["update"], patch: { color: "blue" }, firstAction: { selector: { type: "filter", cardinality: "many", color: "yellow" } } },
  { utterance: "Make lunch heavy", types: ["update"], patch: { mobility: "heavy" } },
  { utterance: "Make dinner light again", types: ["update"], patch: { mobility: "light" }, firstAction: { selector: { type: "title", query: "dinner" } } },
  { utterance: "Anchor interview", types: ["update"], patch: { mobility: "anchored" } },
  { utterance: "Let email flow", types: ["update"], patch: { mobility: "fluid" } },
  { utterance: "Make roadmap movable", types: ["update"], patch: { mobility: "light" } },
  { utterance: "Make the current event heavy and important", types: ["update"], patch: { mobility: "heavy", importance: "important" } },
  { utterance: "Rename the event before lunch to prep", types: ["update"], patch: { title: "prep" } },
  { utterance: "Rename the 2 PM meeting to design review", types: ["update"], patch: { title: "design review" } },
  { utterance: "Call the next meeting portfolio review", types: ["update"], patch: { title: "portfolio review" } },
  { utterance: "Rename current event to focused work", types: ["update"], patch: { title: "focused work" } },

  { utterance: "Label the 2 PM meeting client", types: ["update"], patch: { addLabels: ["client"] }, firstAction: { selector: { type: "source", at: 14 * 60, query: "meeting" } } },
  { utterance: "Label roadmap as strategy", types: ["update"], patch: { addLabels: ["strategy"] } },
  { utterance: "Add strategy and planning labels to roadmap", types: ["update"], patch: { addLabels: ["strategy", "planning"] } },
  { utterance: "Add client label to interview", types: ["update"], patch: { addLabels: ["client"] } },
  { utterance: "Remove client label from the 2 PM meeting", types: ["update"], patch: { removeLabels: ["client"] } },
  { utterance: "Remove planning label from roadmap", types: ["update"], patch: { removeLabels: ["planning"] } },
  { utterance: "Label current event with focus", types: ["update"], patch: { addLabels: ["focus"] } },
  { utterance: "Label the previous appointment admin", types: ["update"], patch: { addLabels: ["admin"] } },

  { utterance: "Protect the 2 PM event", types: ["protect"], firstAction: { selector: { type: "source", at: 14 * 60, query: "event" } } },
  { utterance: "Remove protection from dinner", types: ["unprotect"] },
  { utterance: "Protect all interviews", types: ["protect"] },
  { utterance: "Unprotect the current event", types: ["unprotect"] },
  { utterance: "Make the selected event flexible", types: ["unprotect", "update"], patch: { mobility: "light" } },
  { utterance: "Lock the next meeting", types: ["protect"] },
  { utterance: "Release the previous appointment", types: ["unprotect"] },
  { utterance: "Make dinner flexible again", types: ["unprotect", "update"], patch: { mobility: "light" } },

  { utterance: "Give me twenty minutes before interview", types: ["createBreathingRoom", "reflow"], firstAction: { durationMinutes: 20, destination: { type: "relative", relation: "before", anchor: { type: "title", query: "interview" } }, protected: true } },
  { utterance: "Keep half an hour free after lunch", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Add a fifteen minute buffer before the next meeting", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Leave ten minutes free after current event", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Create breathing room from three to three thirty", types: ["createBreathingRoom", "reflow"], firstAction: { durationMinutes: 30, destination: { type: "absolute", minutes: 15 * 60 } } },
  { utterance: "Add a twenty minute buffer at four", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Give me thirty minutes after the 2 PM meeting", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Keep fifteen minutes free before dinner", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Leave twenty five minutes free at five", types: ["createBreathingRoom", "reflow"] },
  { utterance: "Create a ten minute breathing room after email", types: ["createBreathingRoom", "reflow"] },

  { utterance: "Split deep work into two thirty minute sessions", types: ["split"], firstAction: { selector: { type: "title", query: "deep work" }, durations: [30, 30] } },
  { utterance: "Divide the 2 PM block in half", types: ["split"] },
  { utterance: "Break planning into three twenty minute blocks", types: ["split"] },
  { utterance: "Split current event into two fifteen minute sessions", types: ["split"] },
  { utterance: "Divide interview into two thirty minute sessions", types: ["split"] },
  { utterance: "Break roadmap in half", types: ["split"] },
  { utterance: "Combine email and roadmap", types: ["merge"], firstAction: { selector: { type: "multi", selectors: [{ type: "title", query: "email" }, { type: "title", query: "roadmap" }] } } },
  { utterance: "Merge email and deep work", types: ["merge"] },
  { utterance: "Combine email, roadmap, and workout", types: ["merge"], firstAction: { selector: { type: "multi", selectors: [{ type: "title", query: "email" }, { type: "title", query: "roadmap" }, { type: "title", query: "workout" }] } } },
  { utterance: "Merge lunch and dinner", types: ["merge"] },
  { utterance: "Combine deep work and email and call it admin batch", types: ["merge"] },
  { utterance: "Batch all three admin tasks", types: ["merge"], firstAction: { expectedCount: 3, selector: { type: "filter", cardinality: "many", query: "admin" } } },

  { utterance: "I finished the current event", types: ["complete", "reflow"] },
  { utterance: "Start roadmap", types: ["update"], patch: { status: "active" }, firstAction: { selector: { type: "title", query: "roadmap" } } },
  { utterance: "Mark the 2 PM meeting done", types: ["complete", "reflow"], firstAction: { selector: { type: "source", at: 14 * 60, query: "meeting" } } },
  { utterance: "Finish this early", types: ["complete", "reflow"] },
  { utterance: "I finished twenty minutes early", types: ["complete", "reflow"] },
  { utterance: "Complete roadmap", types: ["complete", "reflow"] },
  { utterance: "Reopen design review", types: ["reopen"] },
  { utterance: "Reopen the last event", types: ["reopen"], firstAction: { selector: { type: "position", position: "last" } } },
  { utterance: "Reopen the 2 PM meeting", types: ["reopen"], firstAction: { selector: { type: "source", at: 14 * 60, query: "meeting" } } },

  { utterance: "What if I add a workout at five", types: ["create"], mode: "preview", firstAction: { title: "workout", durationMinutes: 30, destination: { type: "absolute", minutes: 17 * 60 } } },
  { utterance: "Suppose I move roadmap before lunch", types: ["move"], mode: "preview" },
  { utterance: "Preview a twenty minute buffer before interview", types: ["createBreathingRoom", "reflow"], mode: "preview" },
  { utterance: "What if all red meetings move Thursday", types: ["defer"], mode: "preview", firstAction: { selector: { type: "filter", cardinality: "many", color: "red" }, date: { dateKey: "2026-09-03" } } },
  { utterance: "What if I make roadmap critical and blue", types: ["update"], mode: "preview" },
  { utterance: "Suppose I split deep work in half", types: ["split"], mode: "preview" },
  { utterance: "Preview moving email after lunch", types: ["move"], mode: "preview" },
  { utterance: "Try six instead", types: ["adjustPreview"] },
  { utterance: "Make that one forty five minutes instead", types: ["adjustPreview"] },
  { utterance: "Apply the preview", types: ["commitPreview"] },
  { utterance: "Cancel the preview", types: ["cancelPreview"] },

  { utterance: "End my day at half past five", types: ["setDayBoundary", "reflow"], firstAction: { endMinutes: 17 * 60 + 30 } },
  { utterance: "I am done at six today", types: ["setDayBoundary", "reflow"] },
  { utterance: "Finish by seven", types: ["setDayBoundary", "reflow"] },
  { utterance: "Rebalance the afternoon", types: ["reflow"] },
  { utterance: "Move anything flexible out of the way", types: ["reflow"] },
  { utterance: "I am thirty five minutes behind from now", types: ["recover"], firstAction: { delayMinutes: 35 } },
  { utterance: "Move expenses to Friday morning", types: ["defer"] },
  { utterance: "Send every normal admin task tomorrow", types: ["defer"], firstAction: { selector: { type: "filter", cardinality: "many", importance: "normal", query: "admin" }, date: "tomorrow" } },
  { utterance: "Delete the event after lunch", types: ["delete"] },
  { utterance: "Cancel every red meeting", types: ["delete"], firstAction: { selector: { type: "filter", cardinality: "many", color: "red" } } },

  {
    utterance: "Make the 2 PM meeting important and red, give me 20 minutes before it, and move anything flexible out of the way",
    types: ["update", "createBreathingRoom", "reflow"],
  },
  { utterance: "Move the 2 PM meeting to four and make it forty five minutes", types: ["move", "resize"] },
  { utterance: "Rename interview to hiring review and paint it blue", types: ["update", "update"] },
  { utterance: "Unprotect dinner, make it light, and move it to eight", types: ["unprotect", "update", "move"], actions: [
    { selector: { type: "title", query: "dinner" } },
    { selector: { type: "anaphor" }, patch: { mobility: "light" } },
    { selector: { type: "anaphor" }, destination: { type: "absolute", minutes: 20 * 60 } },
  ] },
  { utterance: "Split deep work in half and put the second one after lunch", types: ["split", "move"], actions: [
    { selector: { type: "title", query: "deep work" }, durations: [0, 0] },
    { selector: { type: "anaphor", ordinal: 2 }, destination: { type: "relative", relation: "after", anchor: { type: "title", query: "lunch" } } },
  ] },
  { utterance: "Split deep work into two 45-minute sessions and keep one before lunch", types: ["split", "move"], actions: [
    { selector: { type: "title", query: "deep work" }, durations: [45, 45] },
    { selector: { type: "anaphor", ordinal: 1 }, destination: { type: "relative", relation: "before", anchor: { type: "title", query: "lunch" }, preserveIfSatisfied: true } },
  ] },
  { utterance: "Add a workout at five, protect it, and give ten minutes before it", types: ["create", "protect", "createBreathingRoom", "reflow"] },
  { utterance: "Protect lunch and clear two to four", types: ["protect", "createBreathingRoom", "reflow"] },
  { utterance: "Clear my afternoon without moving dinner", types: ["createBreathingRoom", "reflow"], firstAction: { durationMinutes: 300, destination: { type: "absolute", minutes: 12 * 60 } }, constraints: [{ type: "keep", selector: { type: "title", query: "dinner" } }] },
  { utterance: "Clear two to four without moving the interview", types: ["createBreathingRoom", "reflow"], firstAction: { durationMinutes: 120, destination: { type: "absolute", minutes: 14 * 60 } }, constraints: [{ type: "keep", selector: { type: "title", query: "interview" } }] },
  { utterance: "I need another 20 minutes on this", types: ["resize", "reflow"], firstAction: { selector: { type: "selected" }, mode: "add", minutes: 20 } },
  { utterance: "Make roadmap normal", types: ["update"], patch: { importance: "normal" }, firstAction: { selector: { type: "title", query: "roadmap" } } },
  { utterance: "Remove the client label", types: ["update"], patch: { removeLabels: ["client"] }, firstAction: { selector: { type: "selected" } } },
  { utterance: "Make the active event red", types: ["update"], patch: { color: "red" }, firstAction: { selector: { type: "filter", cardinality: "one", status: "active" } } },
  { utterance: "Protect the active event", types: ["protect"], firstAction: { selector: { type: "filter", cardinality: "one", status: "active" } } },
  { utterance: "Confirm the 8 AM meeting", types: ["update"], patch: { status: "confirmed" }, firstAction: { selector: { type: "source", at: 8 * 60, query: "meeting" } } },
];

function expectMaterialAction(action: CalendarAction, utterance: string) {
  if ("selector" in action) expect(action.selector, utterance).toEqual(expect.objectContaining({ type: expect.any(String) }));
  if (action.type === "create" || action.type === "fit") {
    expect(action.title, utterance).not.toBe("");
    expect(action.durationMinutes, utterance).toBeGreaterThan(0);
    expect(action.destination, utterance).toEqual(expect.objectContaining({ type: expect.any(String) }));
  }
  if (action.type === "move") expect(action.destination, utterance).toEqual(expect.objectContaining({ type: expect.any(String) }));
  if (action.type === "resize") expect(action.minutes, utterance).not.toBe(0);
  if (action.type === "update") expect(Object.keys(action.patch).length, utterance).toBeGreaterThan(0);
  if (action.type === "createBreathingRoom") {
    expect(action.durationMinutes, utterance).toBeGreaterThan(0);
    expect(action.destination, utterance).toEqual(expect.objectContaining({ type: expect.any(String) }));
  }
  if (action.type === "split") {
    expect(action.durations.length, utterance).toBeGreaterThanOrEqual(2);
    expect(action.durations.every((minutes) => minutes >= 0), utterance).toBe(true);
  }
  if (action.type === "setDayBoundary") expect(action.endMinutes, utterance).toBeGreaterThan(0);
}

describe("Tide natural-language corpus", () => {
  it(`covers ${tideCorpus.length} additional semantic outcomes`, () => {
    expect(tideCorpus.length).toBeGreaterThanOrEqual(100);
    for (const sample of tideCorpus) {
      const result = interpretTranscript(sample.utterance, today);
      expect(result.status, sample.utterance).toBe("ready");
      if (result.status !== "ready") continue;
      expect(result.request.actions.map((action) => action.type), sample.utterance).toEqual(sample.types);
      result.request.actions.forEach((action) => expectMaterialAction(action, sample.utterance));
      expect(result.request.mode, sample.utterance).toBe(sample.mode ?? "commit");
      if (sample.patch) {
        const update = result.request.actions.find((action) => action.type === "update");
        expect(update && update.type === "update" ? update.patch : undefined, sample.utterance).toEqual(expect.objectContaining(sample.patch));
      }
      if (sample.firstAction) {
        expect(result.request.actions[0], sample.utterance).toMatchObject(sample.firstAction);
      }
      sample.actions?.forEach((action, index) => {
        expect(result.request.actions[index], sample.utterance).toMatchObject(action);
      });
      if (sample.constraints) expect(result.request.constraints, sample.utterance).toMatchObject(sample.constraints);
      // Full golden semantics catch selector, date, clock, duration, patch,
      // constraints, preview mode, and compound ordering regressions—not just
      // the broad action family asserted above.
      expect(result.request, sample.utterance).toMatchSnapshot(sample.utterance);
    }
  });
});
