import { describe, expect, it } from "vitest";
import { referenceFromLegacyContext, legacyContextPatchFromReference } from "./kernelReferentBridge";
import { recognizeIntent } from "../kernel/productionBridge";
import { rememberSearchResults } from "../kernel/referents";
import { createSession } from "../kernel/session";
import type { LifeDocument, LifeContext } from "../domain/life-model";

function context(overrides: Partial<LifeContext> = {}): LifeContext {
  return { route: "home", ...overrides };
}

describe("referenceFromLegacyContext (legacy -> kernel)", () => {
  it("returns undefined when legacy has never referenced anything", () => {
    expect(referenceFromLegacyContext(context())).toBeUndefined();
  });

  it("translates legacy's selected reference into the kernel's shape", () => {
    const ref = referenceFromLegacyContext(context({ selected: { id: "j1", kind: "journal-entry", at: 100 } }));
    expect(ref).toEqual({ id: "j1", kind: "journal-entry", at: 100 });
  });

  it("picks whichever of selected/lastReferenced/lastChanged/lastCreated is most recent", () => {
    const ref = referenceFromLegacyContext(context({
      selected: { id: "old", kind: "journal-entry", at: 100 },
      lastReferenced: { id: "newest", kind: "calendar-event", at: 300 },
      lastChanged: { id: "middle", kind: "plan", at: 200 },
    }));
    expect(ref?.id).toBe("newest");
  });
});

describe("legacyContextPatchFromReference (kernel -> legacy)", () => {
  it("translates a real entity referent into a legacy context patch with a fresh timestamp", () => {
    const patch = legacyContextPatchFromReference({ id: "j1", kind: "journal-entry" }, 500);
    expect(patch).toEqual({
      focusedEntityId: "j1",
      selected: { id: "j1", kind: "journal-entry", at: 500 },
      lastReferenced: { id: "j1", kind: "journal-entry", at: 500 },
    });
  });

  it("returns undefined for a desktop-file referent — legacy has no slot for it", () => {
    expect(legacyContextPatchFromReference({ id: "/tmp/report.pdf", kind: "desktop-file", desktopPath: "/tmp/report.pdf" }, 500)).toBeUndefined();
  });

  it("returns undefined for a raw search-hit referent (e.g. a memory fact or Earmark item) with no LifeEntityId", () => {
    expect(legacyContextPatchFromReference({ id: "fact-1", kind: "search-hit" }, 500)).toBeUndefined();
  });
});

describe("end to end: legacy establishes a referent, a kernel command resolves it (Journey A)", () => {
  it("'bookmark it' resolves to the journal entry legacy just opened, with no bridge-local tracking involved", () => {
    // Simulates exactly what tryKernelBridge does at the top of every turn:
    // legacy's own context (as lifeCommandController.ts's entity-view intent
    // sets it via updateContext({selected, lastReferenced, ...})) becomes a
    // kernel referent through referenceFromLegacyContext, then
    // recognizeIntent resolves "it" against it via the ONE resolver.
    const legacyContext: LifeContext = { route: "journal", selected: { id: "j1", kind: "journal-entry", at: 1000 }, lastReferenced: { id: "j1", kind: "journal-entry", at: 1000 } };
    const legacyRef = referenceFromLegacyContext(legacyContext);
    expect(legacyRef).toBeDefined();
    const kernelSession = rememberSearchResults(createSession(), [legacyRef!], 1000);
    const recognized = recognizeIntent("Bookmark it", {} as LifeDocument, kernelSession);
    expect(recognized).toMatchObject({ kind: "capability", steps: [{ capabilityId: "journal.bookmark", args: { entryId: "j1" } }] });
  });
});
