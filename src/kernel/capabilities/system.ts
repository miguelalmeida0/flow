import { undo as undoHistory, redo as redoHistory, whatChanged as describeChanges } from "../history";
import { fail, ok, type Capability, type CapabilityResult } from "../types";

export type SystemUndoArgs = Record<string, never>;
export type SystemRedoArgs = Record<string, never>;
export interface SystemWhatChangedArgs {
  sinceTimestamp?: string;
}

export const systemUndo: Capability<SystemUndoArgs> = {
  id: "system.undo",
  domain: "system",
  description: "Revert the most recent mutation.",
  mutates: true,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (_args, ctx): CapabilityResult => {
    const step = undoHistory({ entries: ctx.history, pointer: ctx.historyPointer });
    if (!step) return fail("nothing-to-undo", "There's nothing to undo.");
    return ok(step.description, { document: step.state.document, navigation: step.state.navigation, memory: step.state.memory }, { data: { historyPointer: step.pointer } });
  },
};

export const systemRedo: Capability<SystemRedoArgs> = {
  id: "system.redo",
  domain: "system",
  description: "Re-apply the most recently undone mutation.",
  mutates: true,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (_args, ctx): CapabilityResult => {
    const step = redoHistory({ entries: ctx.history, pointer: ctx.historyPointer });
    if (!step) return fail("nothing-to-redo", "There's nothing to redo.");
    return ok(step.description, { document: step.state.document, navigation: step.state.navigation, memory: step.state.memory }, { data: { historyPointer: step.pointer } });
  },
};

export const systemWhatChanged: Capability<SystemWhatChangedArgs> = {
  id: "system.whatChanged",
  domain: "system",
  description: "Describe recent changes in plain language.",
  mutates: false,
  undoable: false,
  riskLevel: "low",
  requiresConfirmation: () => false,
  validate: () => null,
  execute: (args, ctx): CapabilityResult => {
    const changes = describeChanges({ entries: ctx.history, pointer: ctx.historyPointer }, args.sinceTimestamp);
    return ok(changes.length === 0 ? "Nothing has changed." : changes.join(" "), {}, { data: changes });
  },
};

export const systemCapabilities = [systemUndo, systemRedo, systemWhatChanged];
