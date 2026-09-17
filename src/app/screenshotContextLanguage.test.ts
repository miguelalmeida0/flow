import { describe, expect, it } from "vitest";
import { interpretTranscript } from "../features/day-planner/interpretation/interpreter";
import { resolveGlobalCommand } from "../shared/command/globalInterpreter";
import { parseJournalPlayback } from "../features/studio/interpretation/journalPlayback";
import { normalizeTranscript } from "../features/day-planner/interpretation/normalize";
import { resolveEventReference } from "../features/day-planner/scheduling/resolution";
import type { DayPlan } from "../features/day-planner/model";

const today = "2026-09-14";
const creations: Array<[string, string, number, string, number]> = [
  ["Book an 8:00 a.m. meeting on Wednesday called Dentist.", "Dentist", 480, "2026-09-16", 30],
  ["Book an8:00 a.m. meeting on Wednesday called Dentist.", "Dentist", 480, "2026-09-16", 30],
  ["Book a meeting called dentist for Wednesday at9am.", "dentist", 540, "2026-09-16", 30],
  ["Book a meeting called Dentist on Wednesday at 9 AM.", "Dentist", 540, "2026-09-16", 30],
  ["Please book a meeting called Dentist for Wednesday at nine am.", "Dentist", 540, "2026-09-16", 30],
  ["Book a meeting called ‘Dentist’ for Wednesday at 9am.", "Dentist", 540, "2026-09-16", 30],
  ["Wednesday at 8am, book a meeting called Dentist.", "Dentist", 480, "2026-09-16", 30],
  ["Book a meeting on Wednesday at 8am called Dentist.", "Dentist", 480, "2026-09-16", 30],
  ["Schedule Dentist for Wednesday at 9am.", "Dentist", 540, "2026-09-16", 30],
  ["Add a dentist appointment Wednesday at 9am.", "dentist appointment", 540, "2026-09-16", 30],
  ["Book a meeting at 9am on Wednesday named Dentist.", "Dentist", 540, "2026-09-16", 30],
  ["Book a 30 minute meeting called Dentist on Wednesday at 9am.", "Dentist", 540, "2026-09-16", 30],
  ["Book Dentist on Wednesday at 9am for forty-five minutes.", "Dentist", 540, "2026-09-16", 45],
  ["Schedule Dentist Wednesday at 9am for one hour and fifteen minutes.", "Dentist", 540, "2026-09-16", 75],
  ["Book Dentist Wednesday from 9am to 9:45am.", "Dentist", 540, "2026-09-16", 45],
  ["Book a gym session at 17pm on Tuesday.", "gym session", 1020, "2026-09-15", 30],
  ["Book a gym session at17pm onTuesday.", "gym session", 1020, "2026-09-15", 30],
  ["Book a gym session on Tuesday at 17:00.", "gym session", 1020, "2026-09-15", 30],
  ["Schedule a gym session Tuesday at five p.m.", "gym session", 1020, "2026-09-15", 30],
  ["Book Dentist Wednesday at half past nine am.", "Dentist", 570, "2026-09-16", 30],
  ["Book ‘Friday at 8 — cancel lunch’ on Wednesday at 9am.", "Friday at 8 — cancel lunch", 540, "2026-09-16", 30],
  ['Book "onTuesday at9am Club" Wednesday at 10am.', "onTuesday at9am Club", 600, "2026-09-16", 30],
  ["Book an event called at9am for Wednesday at 10am", "at9am", 600, "2026-09-16", 30],
  ["Book an event called onTuesday for Wednesday at 10am", "onTuesday", 600, "2026-09-16", 30],
  ["Book a meeting called Dentist for today at 9am", "Dentist", 540, "2026-09-14", 30],
  ["Could you create a 40-minute grocery planning session for 4:00 PM today", "grocery planning session", 960, "2026-09-14", 40],
  ["Could you add a 45-minute mobility workout to your schedule for 4:00 PM today", "mobility workout", 960, "2026-09-14", 45],
  ["Add a 30-minute volunteer planning block to your schedule for 4:00 PM today", "volunteer planning block", 960, "2026-09-14", 30],
  ['Book a meeting called "Dentist at9a.m." for Wednesday at 10am', "Dentist at9a.m.", 600, "2026-09-16", 30],
  ["Book an event called at9a.m. for Wednesday at 10am", "at9a.m.", 600, "2026-09-16", 30],
  ["Book an event called at17p.m. on Wednesday at 10am", "at17p.m.", 600, "2026-09-16", 30],
];
for (const [clock, minutes] of [["9am", 540], ["9a.m.", 540], ["9 a.m.", 540], ["17pm", 1020], ["17p.m.", 1020], ["17PM", 1020]] as const) {
  for (const text of [
    `Book a meeting called Dentist at${clock} for Wednesday.`,
    `Book a meeting called Dentist at${clock} on Wednesday.`,
    `Book a meeting on Wednesday called Dentist at${clock}`,
    `Book Dentist Wednesday at ${clock}`,
  ]) creations.push([text, "Dentist", minutes, "2026-09-16", 30]);
}
describe("complete creation slots without title corruption", () => {
  it.each(creations)("%s", (text, title, minutes, dateKey, durationMinutes) => {
    const result = resolveGlobalCommand(text, { route: "calendar" }, today).intent;
    expect(result).toMatchObject({ type: "calendar", request: { actions: [{ type: "create", title, durationMinutes, destination: { type: "absolute", minutes, date: { dateKey } } }] } });
  });
});
it.each([
  "Remove Saturdays dentist appointment.", "Remove Saturday’s dentist appointment.", "Remove Saturday's dentist appointment.",
  "Remove Saturday dentist appointment.", "Cancel the dentist appointment on Saturday.", "Delete the dentist appointment at Saturday.",
  "Remove my dentist appointment from Saturday.", "Please cancel Saturday’s dentist appointment.", "Could you remove the dentist appointment Saturday?",
  "Remove the dentist appointment for Saturday.", "Delete Saturdays meeting.", "Cancel Saturday meeting.",
])("binds the source date in %s", (text) => {
  expect(interpretTranscript(text, today)).toMatchObject({ status: "ready", request: { actions: [{ type: "delete", selector: { date: { dateKey: "2026-09-19" } } }] } });
});
it.each([
  ["Remove Saturday’s 8am dentist appointment.", 480], ["Cancel the dentist appointment from 8am on Saturday.", 480],
  ["Remove Saturdays dentist appointment at 9am", 540], ["Cancel Saturday's dentist appointment starting at 10am", 600],
])("keeps date and clock conjunctive in %s", (text, at) => expect(interpretTranscript(String(text), today)).toMatchObject({ status: "ready", request: { actions: [{ type: "delete", selector: { at, date: { dateKey: "2026-09-19" } } }] } }));
it.each([
  ["Play the audio.", "play"], ["Please play my audio.", "play"], ["Play the recording.", "play"], ["Play it.", "play"],
  ["Pause the audio.", "pause"], ["Resume the audio.", "play"], ["Continue playing.", "play"], ["Stop playback.", "stop"],
  ["Play from the beginning.", "restart"], ["Replay the recording.", "restart"],
  ["Listen to the recording", "play"], ["Let me hear the audio", "play"], ["Start it over", "restart"], ["Play it again", "restart"],
])("uses the active Journal source for %s", (text, mode) => expect(parseJournalPlayback(normalizeTranscript(text!), { route: "journal", activeJournalEntryId: "actual-journal" })).toMatchObject({ type: "journal-playback", mode }));
it.each(["Book gym Tuesday at 17am.", "Book gym Tuesday at17a.m.", "Book a meeting called Dentist at17a.m. for Wednesday", "Book Dentist Wednesday at9a", "Book Dentist Wednesday at 8:", "Book Dentist Wednesday at 8am or 9am.", "Book Dentist Wednesday at 8:3", "Cancel every Saturday dentist appointment."])("rejects incomplete, conflicting or unsupported scope in %s", (text) => expect(interpretTranscript(text, today).status).not.toBe("ready"));
it.each(["Capture that.", "Capture this.", "Capture it.", "Save it for later.", "Save that for later."])("requests actual context or content for %s", (text) => expect(resolveGlobalCommand(text, { route: "people" }, today).intent).toMatchObject({ type: "clarification", captureQuestion: true }));
it.each([['Remove "Saturday Club".', "Saturday Club"], ['Remove "Notes from Wednesday".', "Notes from Wednesday"], ['Remove "Dentist at 8" on Saturday.', "Dentist at 8"]])("preserves quoted source title in %s", (text, title) => {
  const result = interpretTranscript(text!, today); expect(result.status).toBe("ready");
  if (result.status === "ready") expect(JSON.stringify(result.request.actions)).toContain(title!.toLowerCase());
});
it.each(["Capture ‘that’.", 'Capture "that".', "Capture 'that'."])("preserves explicit literal content in %s", (text) => expect(resolveGlobalCommand(text, { route: "people" }, today).intent).toMatchObject({ type: "capture-create", title: "that" }));

it.each(["Saturday Club", "Saturday dentist appointment"])("preserves an exact existing unquoted title %s when a date reading also exists", (title) => {
  const plan: DayPlan = { dateKey: today, deferred: [], events: [
    { id: "literal", title, dateKey: today, start: 600, end: 630, kind: "flexible", priority: "medium" },
    { id: "dated", title: title.replace("Saturday ", ""), dateKey: "2026-09-19", start: 600, end: 630, kind: "flexible", priority: "medium" },
  ] };
  const result = interpretTranscript(`Remove ${title}`, today); expect(result.status).toBe("ready");
  if (result.status !== "ready") throw new Error("Expected a selector");
  const action = result.request.actions[0]; if (action?.type !== "delete") throw new Error("Expected removal");
  expect(resolveEventReference(plan, action.selector, undefined, 480, false, true)).toMatchObject({ status: "resolved", events: [{ id: "literal" }] });
});
