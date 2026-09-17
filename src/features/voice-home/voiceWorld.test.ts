import { describe, expect, it } from "vitest";
import { createFreshLifeSnapshot } from "../../domain/life-storage";
import type { LifeContext } from "../../domain/life-model";
import { resolveGlobalCommand, type GlobalIntent } from "../../shared/command/globalInterpreter";
import { projectResolvedCommand } from "./voiceWorld";

const dateKey = "2026-09-06";
const context: LifeContext = {
  route: "home",
  currentWorld: "home",
  currentTimeScope: { kind: "day", dateKey },
  nowMs: new Date("2026-09-06T09:00:00").getTime(),
};

function project(transcript: string) {
  const snapshot = createFreshLifeSnapshot(dateKey);
  const resolution = resolveGlobalCommand(
    transcript,
    context,
    dateKey,
    snapshot.document.steps,
    snapshot.document.preferences.workdayEndMinutes,
    snapshot.document.calendar,
  );
  return projectResolvedCommand(resolution, snapshot.document, context, transcript, "voice", "voice-1");
}

describe("canonical voice-world projection", () => {
  it("projects navigation from the resolved global intent instead of reparsing UI copy", () => {
    expect(project("Flow, open my journal")).toMatchObject({ domain: "journal", targetDirection: "left", actionId: "voice-1", transcript: "Flow, open my journal" });
  });

  it("projects the resolved calendar object identity for target acknowledgement", () => {
    const projection = project("Move deep work to three");
    expect(projection.domain).toBe("today");
    expect(projection.targetId).toBe("deep-work");
    expect(projection.targetDirection).toBe("left");
  });

  it("keeps unsupported intent explicit", () => {
    expect(project("compose a symphony in ultraviolet")).toMatchObject({ confidenceTier: "unsupported" });
  });

  it("acknowledges the typed compound's primary world before execution", () => {
    expect(project("Open my journal and leave Sunday evening playing")).toMatchObject({ domain: "journal", targetDirection: "left" });
  });

  it.each<[GlobalIntent, string]>([
    [{ type: "studio-compound", steps: [{ type: "atmosphere-play", query: "Sunday evening" }, { type: "navigate", route: "journal" }] }, "journal"],
    [{ type: "studio-compound", steps: [{ type: "workspace", operation: "primary", surface: "memories" }, { type: "workspace", operation: "secondary", surface: "atmosphere" }] }, "memories"],
    [{ type: "studio-compound", steps: [{ type: "journal-create", beginRecording: false }, { type: "atmosphere-play", query: "Sunday evening" }] }, "journal"],
  ])("projects primary compound steps independently of ordering or an unrelated previous target", (intent, domain) => {
    const document = createFreshLifeSnapshot(dateKey).document;
    const projection = projectResolvedCommand({ intent, candidates: [] }, document, { ...context, selected: { kind: "calendar-event", id: "deep-work", at: context.nowMs! } }, "compound", "voice", "compound-1");
    expect(projection.domain).toBe(domain);
    expect(projection.targetId).toBeUndefined();
  });
});
