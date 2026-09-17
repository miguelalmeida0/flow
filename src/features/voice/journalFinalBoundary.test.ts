import { describe, expect, it } from "vitest";
import { resolveGlobalCommand } from "../../shared/command/globalInterpreter";
import { partitionJournalFinals } from "./journalFinalBoundary";

const context = { route: "journal" as const, topic: "journal" as const, voiceMode: "journal-longform" as const, activeJournalEntryId: "J1", nowMs: Date.parse("2026-09-08T10:00:00Z") };
const classify = (text: string) => resolveGlobalCommand(text, context, "2026-09-08").segment?.classification ?? "AMBIGUOUS";
describe("native Journal final-boundary semantics", () => {
  it.each(["Open calendar", "Pause listening"])("preserves independent %s outside prior finalized prose", (control) => {
    expect(partitionJournalFinals(["I enjoyed the walk.", control], classify)).toEqual({ status: "ready", utterances: ["I enjoyed the walk.", control] });
  });
  it.each([
    ["She said", "go home because it was late."],
    ["He told me to", "go home"],
    ["I said", "delete the current journal entry"],
    ['I wrote "', 'Open calendar" as a reminder.'],
    ["Add a paragraph saying", "Open calendar and breathe"],
    ["Rename this journal to", "Rain and windows"],
  ])("preserves a narrative or literal value across finalized segments: %s", (first, last) => {
    expect(partitionJournalFinals([first, last], classify)).toEqual({ status: "ready", utterances: [`${first} ${last}`] });
  });
  it("does not execute a control prefix while its continuation remains unsupported", () => {
    expect(partitionJournalFinals(["Go home", "and breathe"], classify)).toMatchObject({ status: "clarification", utterances: [] });
  });
});
