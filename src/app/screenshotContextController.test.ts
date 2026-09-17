import { describe, expect, it, vi } from "vitest";
import { createLifeCommandRunner, type ControllerOptions } from "./lifeCommandController";
import type { CommandFeedback, PendingLifeChange } from "./environment-types";
import type { LifeContext } from "../domain/life-model";
import { createFreshLifeSnapshot } from "../domain/life-storage";
import { resolveGlobalCommand } from "../shared/command/globalInterpreter";
import { PromptSpeechCoordinator, setVoicePlaybackActive } from "../features/voice/promptSpeech";

function harness() {
  const snapshot = createFreshLifeSnapshot("2026-09-12"), commit = vi.fn(() => true), choosePending = vi.fn();
  snapshot.document.studio.journalEntries.push({ id: "both-owners", kind: "journal-entry", title: "Current take", text: "", status: "draft", recordingState: "paused", recordingDurationMs: 12000, audioAssetId: "take", photoAssetIds: [], bookmarks: [], transcriptSegments: [], drawings: [], tags: [], createdAt: "2026-09-12T12:00:00Z", updatedAt: "2026-09-12T12:00:00Z" });
  let context: LifeContext = { route: "journal", activeJournalEntryId: "both-owners", activePlayback: { kind: "journal", id: "both-owners", status: "paused" } }, pending: PendingLifeChange | undefined, feedback: CommandFeedback = { phase: "ready", title: "Ready" };
  const noop = () => undefined;
  const options: ControllerOptions = { route: "journal", now: () => new Date("2026-09-12T12:00:00Z"), getSnapshot: () => snapshot, getContext: () => context, updateContext: (patch) => { context = { ...context, ...patch }; }, getPending: () => pending, commit, choosePending,
    navigate: noop, setTemporalScope: noop, recordInstinctExposure: noop, undo: noop, redo: noop, confirm: noop, cancel: noop, setFocusedEntityId: noop, setSelectedCalendarEventId: noop, setActivePlanId: noop, setFeedback: (value) => { feedback = typeof value === "function" ? value(feedback) : value; }, setLastTranscript: noop, setPending: (value) => { pending = typeof value === "function" ? value(pending) : value; }, setNowQuery: noop, setNowExplanationOpen: noop, showCalendarChange: noop, setIntentType: noop, acknowledgeVoiceIntent: noop };
  return { run: createLifeCommandRunner(options), commit, choosePending, snapshot, context: () => context, pending: () => pending, feedback: () => feedback };
}

describe("contextual owner boundaries", () => {
  it.each(["Pause", "Resume", "Stop"])("asks an answerable source question for %s when microphone and audio both have context", (text) => {
    const subject = harness(), before = structuredClone(subject.snapshot);
    subject.run(text); expect(subject.pending()?.media).toMatchObject({ entryId: "both-owners", mode: text.toLowerCase() }); expect(subject.feedback().phase).toBe("clarification");
    expect(subject.commit).not.toHaveBeenCalled(); expect(subject.snapshot).toEqual(before);
    expect(resolveGlobalCommand("the audio", subject.context(), "2026-09-12").intent).toEqual({ type: "pending-choice", choiceId: "playback" });
    subject.run("the audio"); expect(subject.choosePending).toHaveBeenCalledWith("playback", "the audio");
  });
  it("keeps an explicit microphone noun out of playback", () => {
    const subject = harness();
    expect(resolveGlobalCommand("Resume recording", subject.context(), "2026-09-12").intent).toMatchObject({ type: "journal-recording", mode: "resume" });
  });
  it.each(["Seek the audio to 30 seconds", "Replay the recording", "Listen to the recording", "Start it over"])("allows intentional playback control %s while incoming audio is audible", (text) => {
    const coordinator = new PromptSpeechCoordinator({ supported: false, speak: async () => undefined, cancel: () => undefined });
    setVoicePlaybackActive("fixture-audio", true);
    expect(coordinator.assess(text)).toBe("allow"); setVoicePlaybackActive("fixture-audio", false);
  });
});
