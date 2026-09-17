import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute } from "../../../domain/life-model";
import { interpretGlobalCommand } from "../../../shared/command/globalInterpreter";
import { interpretStudioCommand } from "./studioInterpreter";

const dateKey = "2026-09-05";
const context = (route: LifeRoute = "home", patch: Partial<LifeContext> = {}): LifeContext => ({
  route,
  currentWorld: route === "calendar" ? "today" : route === "inbox" ? "capture" : route === "plans" ? "outcomes" : route === "now" ? "home" : route,
  nowMs: Date.parse("2026-09-05T19:00:00Z"),
  epoch: 0,
  ...patch,
});

const navigationRows: Array<[string, LifeRoute]> = [
  ["Journal", "journal"], ["Open journal", "journal"], ["Open my journal", "journal"], ["Open the journal area", "journal"],
  ["Go to the journal page", "journal"], ["Go into my journal", "journal"], ["Take me to my journal", "journal"],
  ["Take me over to the journal screen", "journal"], ["Bring up the journal section", "journal"], ["Show me my journal", "journal"],
  ["Switch to journal", "journal"], ["I want journal", "journal"], ["I want to see my journal", "journal"], ["Can I see the journal view", "journal"],
  ["Atmosphere", "atmosphere"], ["Open the atmosphere area", "atmosphere"], ["Go into the sound space", "atmosphere"],
  ["Take me over to music", "atmosphere"], ["Show the listening room", "atmosphere"], ["Memories", "memories"],
  ["Open my memories", "memories"], ["Open the memory page", "memories"], ["Go into my keepsakes", "memories"], ["Return to journal", "journal"],
];

const studioRows: Array<[string, Partial<LifeContext>, string, Record<string, unknown>?]> = [
  ["Start a journal", {}, "journal-create"], ["Start journaling", {}, "journal-create"], ["Let me talk", {}, "journal-create"],
  ["Let me talk for a bit", {}, "journal-create"], ["Let me talk for a while", {}, "journal-create"],
  ["Open a new journal. I just want to talk.", {}, "journal-create", { beginRecording: true }],
  ["I need to get something out", {}, "journal-create"], ["I want to record something", {}, "journal-create"],
  ["I want to write something", {}, "journal-create"], ["I need to write something down", {}, "journal-create"],
  ["I want to capture a thought", {}, "journal-create"], ["New journal entry", {}, "journal-create"],
  ["Make a new journal entry", {}, "journal-create"], ["Make a journal entry", {}, "journal-create"],
  ["Journal this the street was quiet after the rain", {}, "journal-create", { initialText: "the street was quiet after the rain" }],
  ["Write this down I finally made the call", {}, "journal-create", { initialText: "i finally made the call" }],
  ["Start a new one", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-create"],
  ["Start the journal recording", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-recording", { mode: "start" }],
  ["Pause the recording", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-recording", { mode: "pause" }],
  ["Continue the journal", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-recording", { mode: "resume" }],
  ["Stop this journal entry", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-recording", { mode: "stop" }],
  ["Discard this recording", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-recording", { mode: "discard" }],
  ["Bookmark that", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-bookmark"],
  ["Keep that part", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-bookmark"],
  ["Mark what I just said", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-bookmark", { anchor: "recent" }],
  ["Save the last sentence", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-bookmark", { anchor: "last-sentence" }],
  ["Keep the selected lines", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-bookmark", { anchor: "selection" }],
  ["Rename this journal to Night walk", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-rename", { title: "Night walk" }],
  ["Save this journal", { topic: "journal", activeJournalEntryId: "journal-1" }, "journal-save"],
  ["Play Sunday evening", {}, "atmosphere-play", { query: "sunday evening" }],
  ["Start Sunday evening", {}, "atmosphere-play"], ["Put on Sunday evening", {}, "atmosphere-play"],
  ["Use my Sunday evening atmosphere", {}, "atmosphere-play"], ["Less rain", {}, "atmosphere-adjust", { layerId: "rain", operation: "decrease" }],
  ["More rain", {}, "atmosphere-adjust", { layerId: "rain", operation: "increase" }],
  ["Turn the rain down", {}, "atmosphere-adjust"], ["Make the rain softer", {}, "atmosphere-adjust"],
  ["Remove the rain", {}, "atmosphere-adjust", { property: "enabled", operation: "remove" }],
  ["Bring the rain back", {}, "atmosphere-adjust", { property: "enabled", operation: "restore" }],
  ["Make the piano quieter", {}, "atmosphere-adjust", { layerId: "tone" }], ["Lower the music", {}, "atmosphere-adjust", { layerId: "tone" }],
  ["Remove the rhythm", {}, "atmosphere-adjust", { layerId: "pulse" }], ["Slow the pulse", {}, "atmosphere-adjust", { property: "rate" }],
  ["Make everything quieter", { topic: "atmosphere" }, "atmosphere-adjust"], ["Mute the atmosphere", {}, "atmosphere-playback", { mode: "mute" }],
  ["Pause the atmosphere", {}, "atmosphere-playback", { mode: "pause" }], ["Resume the atmosphere", {}, "atmosphere-playback", { mode: "resume" }],
  ["Stop the atmosphere", {}, "atmosphere-playback", { mode: "stop" }], ["Leave the music playing", {}, "atmosphere-playback", { mode: "resume" }],
  ["Save this", { topic: "atmosphere" }, "atmosphere-save", { mode: "save" }],
  ["Save this as Sunday room", { topic: "atmosphere" }, "atmosphere-save", { mode: "save", name: "Sunday room" }],
  ["Save this as Sunday evening studio", { topic: "atmosphere" }, "atmosphere-save", { mode: "save", name: "Sunday evening studio" }],
  ["Duplicate this atmosphere", {}, "atmosphere-save", { mode: "duplicate" }],
  ["Make something from this", { topic: "journal", activeJournalEntryId: "journal-1" }, "memory-create"],
  ["Make a memory from this", { topic: "journal", activeJournalEntryId: "journal-1" }, "memory-create"],
  ["Make a little piece from this photo and the bookmarked part", { topic: "journal", activeJournalEntryId: "journal-1" }, "memory-create", { source: "photo-bookmark" }],
  ["Use this photo and that bookmark", { topic: "journal", activeJournalEntryId: "journal-1" }, "memory-source", { source: "photo-bookmark" }],
  ["Use the bookmarked part", { topic: "memory", activeMemoryId: "memory-1" }, "memory-source", { source: "bookmark" }],
  ["Use that sentence", { topic: "memory", activeMemoryId: "memory-1" }, "memory-source", { source: "passage" }],
  ["Keep the photo unchanged", { topic: "memory", activeMemoryId: "memory-1" }, "memory-source", { source: "photo" }],
  ["Remove the voice", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "audioEnabled", operation: "hide" }],
  ["Bring the voice back", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "audioEnabled", operation: "show" }],
  ["Remove the photo", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "photo", operation: "hide" }],
  ["Bring the photograph back", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "photo", operation: "show" }],
  ["Make the words larger", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "textScale", operation: "increase" }],
  ["Hide the date", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "showDate", operation: "hide" }],
  ["Move the text down", { topic: "memory", activeMemoryId: "memory-1" }, "memory-update", { property: "textY", operation: "down" }],
  ["Play it", { topic: "memory", activeMemoryId: "memory-1" }, "memory-playback", { mode: "play" }],
  ["Start it again", { topic: "memory", activeMemoryId: "memory-1" }, "memory-playback", { mode: "restart" }],
  ["Keep this", { topic: "memory", activeMemoryId: "memory-1" }, "memory-save"],
  ["Bring my journal closer", {}, "workspace", { operation: "primary", surface: "journal" }],
  ["Leave the music open beside it", {}, "workspace", { operation: "secondary", surface: "atmosphere" }],
  ["Keep the journal alongside", {}, "workspace", { operation: "secondary", surface: "journal" }],
  ["Put the journal away", {}, "workspace", { operation: "put-away", surface: "journal" }],
  ["Put these away", {}, "workspace", { operation: "put-away" }], ["Show less", {}, "workspace", { operation: "show-less" }],
  ["Show everything again", {}, "workspace", { operation: "show-more" }], ["Go back to what I was doing", {}, "workspace", { operation: "restore" }],
  ["I'm home", {}, "ritual-home"],
];

describe("Living Studio production language corpus", () => {
  it("keeps memory creation inside the Studio interpreter", () => {
    expect(interpretStudioCommand("Make a memory from this", context("home", { topic: "journal", activeJournalEntryId: "journal-1" }))).toMatchObject({ type: "memory-create" });
  });
  it.each(navigationRows)("routes %s through the canonical global navigator", (utterance, route) => {
    expect(interpretGlobalCommand(utterance, context(), dateKey)).toMatchObject({ type: "navigate", route });
  });

  it.each(studioRows)("interprets %s through the production global router", (utterance, patch, type, expected = {}) => {
    expect(interpretGlobalCommand(utterance, context("home", patch), dateKey)).toMatchObject({ type, ...expected });
  });

  it.each(["Start focus", "Start roadmap", "Make room for a twenty minute break before the interview", "Move deep work to three"])("does not let Studio steal the existing domain command %s", (utterance) => {
    const result = interpretGlobalCommand(utterance, context(), dateKey);
    expect(["atmosphere-play", "atmosphere-adjust", "journal-create", "memory-create"]).not.toContain(result.type);
  });
});
