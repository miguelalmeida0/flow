import { describe, expect, it } from "vitest";
import type { LifeContext, LifeRoute, PlanStep } from "../../domain/life-model";
import { interpretGlobalCommand, type GlobalIntent } from "./globalInterpreter";

interface SemanticSeed {
  utterance: string;
  type: GlobalIntent["type"];
  context?: Partial<LifeContext>;
}

const systemSeeds: SemanticSeed[] = [
  ["Undo", "history"], ["Undo that", "history"], ["Undo last change", "history"], ["Go back one change", "history"],
  ["Redo", "history"], ["Redo that", "history"], ["Redo last change", "history"], ["Do that again", "history"],
  ["What changed", "what-changed"], ["What just changed", "what-changed"], ["Show last change", "what-changed"],
  ["Pause listening", "session"], ["Stop listening", "session"], ["Flow sleep", "session"], ["Go to sleep", "session"],
  ["Start listening", "session"], ["Resume listening", "session"], ["Wake up Flow", "session"],
  ["Confirm", "confirm"], ["Yes please", "confirm"], ["Proceed", "confirm"], ["Go ahead", "confirm"],
  ["Cancel", "cancel"], ["Never mind", "cancel"], ["Cancel that", "cancel"], ["No thanks", "cancel"],
  ["Help", "help"], ["What can I say", "help"], ["Start capture mode", "capture-mode"],
].map(([utterance, type]) => ({ utterance, type })) as SemanticSeed[];

const navigationSeeds: SemanticSeed[] = [
  ["Home", "navigate"], ["Go home", "navigate"], ["Open home", "navigate"], ["Take me home", "navigate"],
  ["Today", "temporal"], ["Calendar", "navigate"], ["Open the calendar", "navigate"], ["Show me today", "temporal"], ["Go to the calendar", "navigate"],
  ["Capture", "navigate"], ["Inbox", "navigate"], ["Open the inbox area", "navigate"], ["Show me capture", "navigate"], ["Go to the inbox", "navigate"],
  ["Outcomes", "navigate"], ["Plans", "navigate"], ["Open the outcomes view", "navigate"], ["Show me my plans", "navigate"], ["Take me to outcomes", "navigate"],
  ["Commitments", "navigate"], ["People", "navigate"], ["Open the commitments area", "navigate"], ["Show me people", "navigate"], ["Go to commitments", "navigate"],
  ["Now", "navigate"], ["Open now", "navigate"], ["Show me what needs me now", "navigate"], ["Go back", "navigate"], ["Previous space", "navigate"],
].map(([utterance, type]) => ({ utterance, type })) as SemanticSeed[];

const calendarSeeds: SemanticSeed[] = [
  ["Book dinner at Pizzeria Roma tomorrow at eight", "calendar"],
  ["Add a thirty minute walk at six", "calendar"],
  ["Schedule a twenty five minute break between three and five", "calendar"],
  ["Block one hour for reading tomorrow morning", "calendar"],
  ["Move my workout to six", "calendar"], ["Move deep work before lunch", "calendar"],
  ["Move the roadmap to tomorrow morning", "calendar"], ["Move roadmap to the next free slot", "calendar"],
  ["Push everything after lunch back thirty minutes", "calendar"], ["Shift the event at two back twenty minutes", "calendar"],
  ["Make email twenty minutes", "calendar"], ["Extend deep work by half an hour", "calendar"],
  ["Shorten roadmap by fifteen minutes", "calendar"], ["Make dinner ninety minutes", "calendar"],
  ["Protect lunch", "calendar"], ["Do not move the interview", "calendar"], ["Make dinner flexible again", "calendar"],
  ["I am thirty five minutes behind from now", "calendar"], ["Rebalance the afternoon", "calendar"],
  ["Fit a forty minute workout before dinner and do not move lunch", "calendar"],
  ["Make room for a twenty minute break before the interview", "calendar"],
  ["Give me twenty minutes before interview", "focus-request"], ["Move expenses to Friday morning", "calendar"],
  ["Defer low priority work", "calendar"], ["Cancel the dentist appointment", "calendar"],
  ["Make the two PM meeting important and red", "calendar"], ["Rename the two PM meeting to design review", "calendar"],
  ["Label the two PM meeting client", "calendar"], ["Remove client label from the two PM meeting", "calendar"],
  ["Split deep work into two thirty minute sessions", "calendar"], ["Combine email and roadmap", "calendar"],
  ["I finished the two PM meeting", "calendar"], ["End my day at half past five", "calendar"],
  ["What if I make roadmap critical and blue", "calendar"],
  ["Make it red and important", "calendar"],
].map(([utterance, type]) => ({
  utterance,
  type,
  ...(utterance === "Make it red and important" ? { context: { selected: { id: "roadmap", kind: "calendar-event", at: 1_000 }, nowMs: 1_001 } } : {}),
})) as SemanticSeed[];

const lifeSeeds: SemanticSeed[] = [
  ["Capture renew passport before Senegal", "capture-create"], ["Remember buy oat milk", "capture-create"],
  ["Note that Ana prefers mornings", "capture-create"], ["Jot down call the vet", "capture-create"],
  ["Add tax receipt to my inbox", "capture-create"], ["Save book recommendation in inbox", "capture-create"],
  ["I need to renew my passport before Senegal", "unsupported"], ["I want to prepare the client presentation", "unsupported"],
  ["My goal is to organize the house move", "unsupported"], ["I have to complete the job application", "unsupported"],
  ["Renew passport before Senegal", "unsupported"], ["Prepare documents before the visa appointment", "unsupported"],
  ["The first step is check the requirements", "step-set-first"], ["First step should be gather the forms", "step-set-first"],
  ["I promised Maya the proposal by Friday", "commitment-create"], ["I owe Alex the budget by Monday", "commitment-create"],
  ["I am waiting for Daniel's contract confirmation", "commitment-create"], ["Waiting on Priya for the design", "commitment-create"],
  ["Next time I see Ana remember to ask about the budget", "commitment-create"], ["For my next conversation with Luis review the launch date", "commitment-create"],
  ["What needs me now", "query-now"], ["What needs my attention", "query-now"], ["What fits right now", "query-now"],
  ["What can I do now", "query-now"], ["I have twenty minutes what fits", "query-now"], ["What fits before the next meeting", "query-now"],
].map(([utterance, type]) => ({ utterance, type })) as SemanticSeed[];

const steps: PlanStep[] = [{
  id: "requirements", kind: "plan-step", planId: "passport", title: "Check the requirements", status: "planned",
  estimatedMinutes: 30, createdAt: "2026-09-03T09:00:00.000Z", updatedAt: "2026-09-03T09:00:00.000Z",
}];
const contextualSeeds: SemanticSeed[] = [
  { utterance: "Schedule it Thursday after work", type: "step-schedule", context: { selected: { id: "requirements", kind: "plan-step", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Schedule this step Thursday at six", type: "step-schedule", context: { selected: { id: "requirements", kind: "plan-step", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Complete this step", type: "step-complete", context: { activePlanId: "passport", selected: { id: "requirements", kind: "plan-step", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Edit this capture to renew passport urgently", type: "capture-edit", context: { selected: { id: "capture-passport", kind: "capture", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Archive this capture", type: "capture-archive", context: { selected: { id: "capture-passport", kind: "capture", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Delete this capture", type: "capture-delete", context: { selected: { id: "capture-passport", kind: "capture", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Turn this capture into a thirty minute event tomorrow at nine", type: "capture-convert-event", context: { selected: { id: "capture-passport", kind: "capture", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Turn this capture into a waiting on commitment with Daniel", type: "capture-convert-commitment", context: { selected: { id: "capture-passport", kind: "capture", at: 1_000 }, nowMs: 1_001 } },
  { utterance: "Archive all capture items", type: "capture-batch-archive" },
  { utterance: "Rename this plan to Senegal ready", type: "plan-rename", context: { activePlanId: "passport" } },
  { utterance: "Pause this outcome", type: "plan-status", context: { activePlanId: "passport" } },
  { utterance: "Resume this outcome", type: "plan-status", context: { activePlanId: "passport" } },
  { utterance: "Delete this outcome", type: "plan-delete", context: { activePlanId: "passport" } },
  { utterance: "Add collect the forms step to this plan", type: "step-add", context: { activePlanId: "passport" } },
  { utterance: "Rename requirements step to gather requirements", type: "step-rename", context: { activePlanId: "passport" } },
  { utterance: "Move requirements step before documents step", type: "step-reorder", context: { activePlanId: "passport" } },
  { utterance: "Make requirements step forty five minutes", type: "step-duration", context: { activePlanId: "passport" } },
  { utterance: "Make requirements the next step", type: "step-set-next", context: { activePlanId: "passport" } },
  { utterance: "Find time for requirements step", type: "step-find-time", context: { activePlanId: "passport" } },
  { utterance: "Delete requirements step", type: "step-delete", context: { activePlanId: "passport" } },
  { utterance: "Defer requirements step until Monday", type: "step-defer", context: { activePlanId: "passport" } },
  { utterance: "Unschedule requirements step", type: "step-unschedule", context: { activePlanId: "passport" } },
  { utterance: "Reserve thirty minutes for the proposal promise to Maya Friday at ten", type: "commitment-schedule" },
  { utterance: "Find time for the proposal promise to Maya", type: "commitment-find-time" },
  { utterance: "Mark proposal promise to Maya complete", type: "commitment-complete" },
  { utterance: "Defer proposal commitment with Maya until Monday because she is away", type: "commitment-defer" },
  { utterance: "Delete proposal promise to Maya", type: "commitment-delete" },
  { utterance: "Link Maya promise to passport plan", type: "commitment-link-plan" },
  { utterance: "Move proposal deadline to Monday", type: "commitment-due" },
];

const framings = [
  (value: string) => value,
  (value: string) => `Please, ${value.replace(/^./, (letter) => letter.toLowerCase())}.`,
  (value: string) => `Actually, ${value.replace(/^./, (letter) => letter.toLowerCase())}?`,
  (value: string) => `Can you ${value.replace(/^./, (letter) => letter.toLowerCase())}?`,
];
const seeds = [...systemSeeds, ...navigationSeeds, ...calendarSeeds, ...lifeSeeds, ...contextualSeeds];
export const appleSupportedSemanticRows = seeds.flatMap((seed) => framings.map((frame) => ({ ...seed, utterance: frame(seed.utterance) })));
const routes: LifeRoute[] = ["home", "calendar", "inbox", "plans", "people"];

describe("Apple-grade global semantic corpus", () => {
  it.each([0, 1, 2, 3] as const)(`interprets ${appleSupportedSemanticRows.length} unique natural variants partition %s on every product route`, async (partition) => {
    if (partition === 0) {
      expect(appleSupportedSemanticRows.length).toBeGreaterThanOrEqual(320);
      expect(new Set(appleSupportedSemanticRows.map(({ utterance }) => utterance)).size).toBe(appleSupportedSemanticRows.length);
    }
    const partitionRows = appleSupportedSemanticRows.filter((_, index) => index % 4 === partition);
    expect(partitionRows).toHaveLength(Math.ceil((appleSupportedSemanticRows.length - partition) / 4));
    for (let start = 0; start < partitionRows.length; start += 64) {
      const rows = partitionRows.slice(start, start + 64);
      for (const row of rows) {
        for (const route of routes) {
          const context: LifeContext = { route, nowMs: 1_001, ...row.context };
          const result = interpretGlobalCommand(row.utterance, context, "2026-09-03", steps);
          expect(result.type, `${route}: ${row.utterance}`).toBe(row.type);
        }
      }
      // Keep all 2,960 production interpretations and route assertions while
      // allowing Vitest's worker to report progress between bounded batches
      // in CPU-constrained clean containers.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }, 15_000);
});
