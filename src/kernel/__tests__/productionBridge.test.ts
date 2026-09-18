import { describe, expect, it } from "vitest";
import { recognizeIntent, runKernelTurn, createBridgeSession, persistKernelMutation, fileReference, recentFileToReference, type RecognizedIntent } from "../productionBridge";
import { rememberSearchResults } from "../referents";
import { createSession, type ConversationSession, type EntityReference } from "../session";
import { emptyDocument, AT } from "./fixtures";
import type { PersonalMemoryFact } from "../types";
import type { PlanStepInput } from "../planner";

const NOW = () => new Date(AT);

/** A fresh session, optionally with a pre-populated result set — mirrors
 * how a real recall/desktop-list turn leaves session.referents, without
 * duplicating that turn just to set up a follow-up test. */
function sessionWithResults(refs: EntityReference[]): ConversationSession {
  return rememberSearchResults(createSession(), refs, new Date(AT).getTime());
}

function step0(recognized: RecognizedIntent | null): PlanStepInput | undefined {
  if (recognized?.kind !== "capability") return undefined;
  return recognized.steps[0];
}

describe("recognizeIntent", () => {
  it("recognizes an explicit remember about a known person as friends.remember", () => {
    const document = emptyDocument();
    document.people.push({ id: "p-sofia", kind: "person", name: "Sofia", createdAt: AT, updatedAt: AT });
    const recognized = recognizeIntent("Remember Sofia is vegetarian", document, createSession());
    expect(step0(recognized)).toMatchObject({ capabilityId: "friends.remember", args: { name: "Sofia", fact: "is vegetarian" } });
  });

  it("recognizes a subjectless remember as memory.store", () => {
    const document = emptyDocument();
    const recognized = recognizeIntent("Remember I prefer interviews before lunch", document, createSession());
    expect(step0(recognized)?.capabilityId).toBe("memory.store");
  });

  it("recognizes forget as memory.forget", () => {
    const recognized = recognizeIntent("Forget that Sofia is vegetarian", emptyDocument(), createSession());
    expect(step0(recognized)).toMatchObject({ capabilityId: "memory.forget", args: { query: "Sofia is vegetarian" } });
  });

  it("recognizes universal recall phrasing as recall.search", () => {
    for (const utterance of ["Where did I mention Lisbon", "What did I say about Lisbon", "Find where I talked about Lisbon", "Show me everything connected to Lisbon"]) {
      const recognized = recognizeIntent(utterance, emptyDocument(), createSession());
      expect(step0(recognized)).toMatchObject({ capabilityId: "recall.search", args: { query: "Lisbon" } });
    }
  });

  it("recognizes what-did-I-promise for a known person as recall.commitments", () => {
    const document = emptyDocument();
    document.people.push({ id: "p-sofia", kind: "person", name: "Sofia", createdAt: AT, updatedAt: AT });
    const recognized = recognizeIntent("What did I promise Sofia", document, createSession());
    expect(step0(recognized)).toMatchObject({ capabilityId: "recall.commitments", args: { personId: "p-sofia" } });
  });

  it("resolves 'What did I promise her' via the person referent, not a literal name match", () => {
    const document = emptyDocument();
    document.people.push({ id: "p-sofia", kind: "person", name: "Sofia", createdAt: AT, updatedAt: AT });
    const session = createSession();
    session.referents.person = { id: "p-sofia", kind: "person", label: "Sofia" };
    const recognized = recognizeIntent("What did I promise her", document, session);
    expect(step0(recognized)).toMatchObject({ capabilityId: "recall.commitments", args: { personId: "p-sofia" } });
  });

  it("falls back to recall.search for 'what did I promise her' when no person referent is set", () => {
    const recognized = recognizeIntent("What did I promise her", emptyDocument(), createSession());
    expect(step0(recognized)).toMatchObject({ capabilityId: "recall.search", args: { query: "her" } });
  });

  it("recognizes a buffered calendar move and accounts for the moved event's own duration", () => {
    const document = emptyDocument();
    const recognized = recognizeIntent("Move the workout so I have enough time before dinner", document, createSession());
    // dinner starts at 1140; workout is 60 minutes long; 45-minute buffer.
    expect(step0(recognized)).toMatchObject({ capabilityId: "calendar.move", args: { eventId: "workout", startMinutes: 1140 - 45 - 60 } });
  });

  it("does NOT claim a plain 'move X to TIME' phrase — legacy's mature calendar interpreter already owns that grammar and is strictly more capable (relative dates, constraints); only the novel buffer-aware phrasing is kernel-exclusive", () => {
    const document = emptyDocument();
    expect(recognizeIntent("Move the workout to 6:30 pm", document, createSession())).toBeNull();
  });

  it("resolves 'open that' against a desktop-file referent when it is the most recently established one", () => {
    const session = sessionWithResults([{ id: "/Users/me/Downloads/report.pdf", kind: "desktop-file", label: "report.pdf", desktopPath: "/Users/me/Downloads/report.pdf" }]);
    const recognized = recognizeIntent("Open that", emptyDocument(), session);
    expect(step0(recognized)).toMatchObject({ capabilityId: "desktop.openFile", args: { path: "/Users/me/Downloads/report.pdf" } });
  });

  it("resolves 'bookmark it' against a journal-entry referent regardless of which side established it (legacy navigation or a kernel recall)", () => {
    const session = sessionWithResults([{ id: "j1", kind: "journal-entry", label: "Trip planning" }]);
    const recognized = recognizeIntent("Bookmark it", emptyDocument(), session);
    expect(step0(recognized)).toMatchObject({ capabilityId: "journal.bookmark", args: { entryId: "j1" } });
  });

  it("does not attempt to bookmark a non-journal referent", () => {
    const session = sessionWithResults([{ id: "p1", kind: "plan", label: "Lisbon trip plan" }]);
    expect(recognizeIntent("Bookmark it", emptyDocument(), session)).toBeNull();
  });

  it("recognizes a known desktop app open", () => {
    const recognized = recognizeIntent("Open VS Code", emptyDocument(), createSession());
    expect(step0(recognized)).toMatchObject({ capabilityId: "desktop.openApp", args: { app: "Visual Studio Code" } });
  });

  it("returns null for something it doesn't confidently understand, rather than guessing", () => {
    expect(recognizeIntent("tell me a joke about calendars", emptyDocument(), createSession())).toBeNull();
  });

  it("recognizes the demo reset phrase", () => {
    expect(recognizeIntent("reset the demo", emptyDocument(), createSession())).toEqual({ kind: "demo-reset" });
  });

  it("resolves 'open the second one' against the last recall referents, using the ONE resolver (resolveOrdinal), not a bridge-local list", () => {
    const session = sessionWithResults([
      { id: "a", kind: "journal-entry", label: "First" },
      { id: "b", kind: "journal-entry", label: "Second" },
    ]);
    const recognized = recognizeIntent("Open the second one", emptyDocument(), session);
    expect(recognized).toMatchObject({ kind: "open-referent", ref: { id: "b" } });
  });

  it("resolves 'open that' to the top referent (resolveReferentWord/lastMentioned) when it isn't a desktop file", () => {
    const session = sessionWithResults([{ id: "a", kind: "journal-entry", label: "First" }]);
    const recognized = recognizeIntent("Open that", emptyDocument(), session);
    expect(recognized).toMatchObject({ kind: "open-referent", ref: { id: "a" } });
  });

  it("resolves bare 'play that part' to the top referent's timestamp when it has recording provenance", () => {
    const session = sessionWithResults([{ id: "a", kind: "journal-entry", label: "Trip planning", audioTimestamp: { recordingId: "journal/a", atMs: 4200, endAtMs: 9800, confidence: "exact" } }]);
    const recognized = recognizeIntent("Play that part", emptyDocument(), session);
    expect(recognized).toMatchObject({ kind: "play-referent", ref: { id: "a" } });
  });

  it("resolves 'play the part where I mentioned X' to the referent whose label matches X", () => {
    const session = sessionWithResults([
      { id: "a", kind: "journal-entry", label: "Trip planning", audioTimestamp: { recordingId: "journal/a", atMs: 4200, endAtMs: 9800, confidence: "exact" } },
      { id: "b", kind: "journal-entry", label: "the hotel booking", audioTimestamp: { recordingId: "journal/b", atMs: 1000, endAtMs: 2000, confidence: "exact" } },
    ]);
    const recognized = recognizeIntent("Play the part where I mentioned the hotel", emptyDocument(), session);
    expect(recognized).toMatchObject({ kind: "play-referent", ref: { id: "b" } });
  });

  it("resolves 'play that part' with no referent in memory to an explicit non-guess", () => {
    const recognized = recognizeIntent("Play that part", emptyDocument(), createSession());
    expect(recognized).toEqual({ kind: "play-referent", ref: undefined, query: "" });
  });

  it("re-searches fresh when the cached referent is for a different segment of the same entry (e.g. recalled 'Lisbon' but asked to play 'the hotel')", () => {
    const document = emptyDocument();
    document.studio.journalEntries.push({
      id: "j1", kind: "journal-entry", title: "Trip planning", text: "n/a", status: "saved", recordingState: "idle", recordingDurationMs: 9800,
      audioAssetId: "asset-1", photoAssetIds: [], bookmarks: [],
      transcriptSegments: [
        { id: "s1", text: "Thinking about visiting Lisbon next month.", startMs: 0, endMs: 4200, source: "voice" },
        { id: "s2", text: "I already booked the hotel near the river.", startMs: 4200, endMs: 9800, source: "voice" },
      ],
      drawings: [], tags: [], createdAt: AT, updatedAt: AT,
    });
    // The cached referent is the Lisbon segment (from a prior "where did I talk about Lisbon" recall).
    const session = sessionWithResults([{ id: "j1", kind: "journal-entry", label: "Lisbon", audioTimestamp: { recordingId: "journal/j1", atMs: 0, endAtMs: 4200 } }]);
    const recognized = recognizeIntent("Play the part where I mentioned the hotel", document, session);
    expect(recognized).toMatchObject({ kind: "play-referent", ref: { audioTimestamp: { atMs: 4200, endAtMs: 9800 } } });
  });
});

describe("runKernelTurn", () => {
  it("recalls a journal mention with provenance end to end, and records it as the current referent", () => {
    const document = emptyDocument();
    document.studio.journalEntries.push({
      id: "j1", kind: "journal-entry", title: "Trip notes", text: "n/a", status: "saved", recordingState: "idle", recordingDurationMs: 5000,
      audioAssetId: "asset-1", photoAssetIds: [], bookmarks: [],
      transcriptSegments: [{ id: "seg1", text: "We booked the hotel in Lisbon.", startMs: 1000, endMs: 4000, source: "voice" }],
      drawings: [], tags: [], createdAt: AT, updatedAt: AT,
    });
    const result = runKernelTurn("Where did I mention Lisbon", document, [], createBridgeSession(), NOW);
    expect(result.outcome.status).toBe("executed");
    expect(result.session.referents.lastMentioned).toMatchObject({ id: "j1", kind: "journal-entry", domain: "journal" });
    expect(result.session.referents.lastMentioned?.audioTimestamp).toMatchObject({ atMs: 1000, endAtMs: 4000 });
  });

  it("fails clearly (never fabricates) when recall finds nothing", () => {
    const result = runKernelTurn("Where did I mention Atlantis", emptyDocument(), [], createBridgeSession(), NOW);
    expect(result.outcome.status).toBe("error");
  });

  it("stores an explicit memory fact and reports it back", () => {
    const result = runKernelTurn("Remember I prefer interviews before lunch", emptyDocument(), [], createBridgeSession(), NOW);
    expect(result.outcome.status).toBe("executed");
    expect(result.message.toLowerCase()).toContain("remembered");
  });

  it("records the remembered person as the person referent, so 'her' resolves in the very next turn", () => {
    const document = emptyDocument();
    const first = runKernelTurn("Remember Sofia is vegetarian", document, [], createBridgeSession(), NOW);
    expect(first.outcome.status).toBe("executed");
    expect(first.session.referents.person?.kind).toBe("person");

    document.commitments.push({ id: "c1", kind: "commitment", personId: first.session.referents.person!.id, title: "Book dinner", direction: "i-owe", status: "open", createdAt: AT, updatedAt: AT });
    const second = runKernelTurn("What did I promise her", document, [], first.session, NOW);
    expect(second.outcome.status).toBe("executed");
    expect(second.message).toContain("1");
  });

  it("proposes an alternative when a buffered move collides with something else, and a later 'yes' executes the CURRENT proposal only", () => {
    const document = emptyDocument();
    // Force a genuine conflict: put a third event exactly where the buffered workout would land.
    const plan = document.calendars[document.calendar.dateKey]!;
    plan.events.push({ id: "call", title: "Call with Daniel", dateKey: plan.dateKey, start: 1140 - 45 - 60, end: 1140 - 45 - 30, kind: "flexible", priority: "medium" });

    const first = runKernelTurn("Move the workout so I have enough time before dinner", document, [], createBridgeSession(), NOW);
    expect(first.outcome.status).toBe("proposed");
    expect(first.session.activeProposal?.status).toBe("pending");

    const approved = runKernelTurn("yes", document, [], first.session, NOW);
    expect(approved.outcome.status).toBe("executed");
  });

  it("a correction (any fresh recognized command) replaces the pending proposal, and approving after that finds nothing left to approve", () => {
    const document = emptyDocument();
    const plan = document.calendars[document.calendar.dateKey]!;
    plan.events.push({ id: "call", title: "Call with Daniel", dateKey: plan.dateKey, start: 1140 - 45 - 60, end: 1140 - 45 - 30, kind: "flexible", priority: "medium" });

    const first = runKernelTurn("Move the workout so I have enough time before dinner", document, [], createBridgeSession(), NOW);
    expect(first.outcome.status).toBe("proposed");
    const firstProposalId = first.session.activeProposal?.id;

    // A direct new command (not a reply) supersedes the pending proposal —
    // kernel.submit clears in-flight state before building the new plan.
    const corrected = runKernelTurn("Remember I like tea", document, [], first.session, NOW);
    expect(corrected.outcome.status).toBe("executed");
    expect(corrected.session.activeProposal?.id).not.toBe(firstProposalId);

    // Threading the CURRENT session forward means there is nothing left to
    // approve — "yes" here cannot silently re-execute the stale proposal.
    const staleYes = runKernelTurn("yes", document, [], corrected.session, NOW);
    expect(staleYes.outcome.status).not.toBe("executed");
  });

  it("persists an explicit memory fact into the real app via dispatchLife", () => {
    const dispatched: unknown[] = [];
    const result = runKernelTurn("Remember I prefer interviews before lunch", emptyDocument(), [], createBridgeSession(), NOW, {
      dispatchLife: (actions) => dispatched.push(...actions),
    });
    expect(result.outcome.status).toBe("executed");
    expect(dispatched).toHaveLength(1);
    expect((dispatched[0] as { type: string }).type).toBe("memory.fact.create");
  });

  it("persists a real calendar move through dispatchLife only for the changed date", () => {
    const document = emptyDocument();
    const dispatched: unknown[] = [];
    const result = runKernelTurn("Move the workout so I have enough time before dinner", document, [], createBridgeSession(), NOW, {
      dispatchLife: (actions) => dispatched.push(...actions),
    });
    expect(result.outcome.status).toBe("executed");
    expect(dispatched).toEqual([{ type: "calendar.replace", plan: expect.objectContaining({ dateKey: document.calendar.dateKey }) }]);
  });

  it("never calls dispatchLife for a read-only recall query", () => {
    const dispatchLife = () => { throw new Error("should not persist a read-only query"); };
    const document = emptyDocument();
    document.plans.push({ id: "plan-1", kind: "plan", title: "Lisbon trip", outcome: "n/a", status: "active", stepIds: [], createdAt: AT, updatedAt: AT });
    const result = runKernelTurn("Where did I mention Lisbon", document, [], createBridgeSession(), NOW, { dispatchLife });
    expect(result.outcome.status).toBe("executed");
  });

  it("falls through to the legacy path (recognized: false) for an unrelated utterance even while a kernel proposal is pending, and clears the now-stale proposal", () => {
    const document = emptyDocument();
    const plan = document.calendars[document.calendar.dateKey]!;
    plan.events.push({ id: "call", title: "Call with Daniel", dateKey: plan.dateKey, start: 1140 - 45 - 60, end: 1140 - 45 - 30, kind: "flexible", priority: "medium" });

    const first = runKernelTurn("Move the workout so I have enough time before dinner", document, [], createBridgeSession(), NOW);
    expect(first.outcome.status).toBe("proposed");
    expect(first.session.activeProposal).toBeDefined();

    // Something totally unrelated that only the legacy interpreter would
    // understand — the bridge must NOT swallow this as "I didn't understand".
    const unrelated = runKernelTurn("show my calendar", document, [], first.session, NOW);
    expect(unrelated.recognized).toBe(false);
    expect(unrelated.session.activeProposal).toBeUndefined();

    // A later stray "yes" against the now-cleared session has nothing to approve.
    const staleYes = runKernelTurn("yes", document, [], unrelated.session, NOW);
    expect(staleYes.outcome.status).not.toBe("executed");
  });

  it("delegates undo to the real app rather than the kernel's own per-turn history", () => {
    const result = runKernelTurn("undo", emptyDocument(), [], createBridgeSession(), NOW);
    expect(result.delegateToApp).toBe("undo");
  });

  it("loads demo data through dispatchLife when recognized", () => {
    const dispatched: unknown[] = [];
    const result = runKernelTurn("reset the demo", emptyDocument(), [], createBridgeSession(), NOW, {
      dispatchLife: (actions) => dispatched.push(...actions),
    });
    expect(result.outcome.status).toBe("executed");
    expect(dispatched.length).toBeGreaterThan(0);
  });

  it("returns openReferent for a resolved recall referent instead of executing a capability, and re-promotes it as the current referent", () => {
    const session = sessionWithResults([{ id: "a", kind: "journal-entry", label: "First", domain: "journal" }]);
    const result = runKernelTurn("Open that", emptyDocument(), [], session, NOW);
    expect(result.openReferent?.id).toBe("a");
    expect(result.session.referents.lastMentioned?.id).toBe("a");
  });

  it("honestly reports when a referent has no recording to play, rather than faking playback", () => {
    const session = sessionWithResults([{ id: "a", kind: "plan", label: "Lisbon trip plan", domain: "plans" }]);
    const result = runKernelTurn("Play that part", emptyDocument(), [], session, NOW);
    expect(result.message.toLowerCase()).toContain("doesn't have a recording");
  });

  it("honestly reports the desktop companion isn't configured, rather than fabricating a file list, when 'show me my latest download' has no token set (see fileReference/recentFileToReference tests for the real conversion once a listing succeeds)", () => {
    const result = runKernelTurn("show me my latest download", emptyDocument(), [], createBridgeSession(), NOW);
    expect(result.outcome.status).toBe("error");
  });
});

describe("desktop-file referents (real conversion the async companion event handler in FlowEnvironmentProvider reuses once a listing/open genuinely succeeds)", () => {
  it("fileReference builds a desktop-file referent with the path as both id and desktopPath", () => {
    expect(fileReference("/Users/me/Downloads/report.pdf", "report.pdf")).toEqual({
      id: "/Users/me/Downloads/report.pdf", kind: "desktop-file", label: "report.pdf", desktopPath: "/Users/me/Downloads/report.pdf",
    });
  });

  it("recentFileToReference converts a real desktop.listRecentFiles entry the same way", () => {
    const ref = recentFileToReference({ path: "/Users/me/Downloads/report.pdf", name: "report.pdf", extension: "pdf", modifiedAt: AT, size: 100 });
    expect(ref).toEqual({ id: "/Users/me/Downloads/report.pdf", kind: "desktop-file", label: "report.pdf", desktopPath: "/Users/me/Downloads/report.pdf" });
  });

  it("a list of real files, remembered as search results, resolves both 'open the second one' and 'the one before that' to the same file", () => {
    const files = [
      { path: "/Users/me/Downloads/a.pdf", name: "a.pdf", extension: "pdf", modifiedAt: AT, size: 10 },
      { path: "/Users/me/Downloads/b.pdf", name: "b.pdf", extension: "pdf", modifiedAt: AT, size: 20 },
    ];
    const session = sessionWithResults(files.map(recentFileToReference));
    expect(recognizeIntent("open the second one", emptyDocument(), session)).toMatchObject({ kind: "capability", steps: [{ capabilityId: "desktop.openFile", args: { path: "/Users/me/Downloads/b.pdf" } }] });
    expect(recognizeIntent("the one before that", emptyDocument(), session)).toMatchObject({ kind: "capability", steps: [{ capabilityId: "desktop.openFile", args: { path: "/Users/me/Downloads/b.pdf" } }] });
  });
});

describe("persistKernelMutation", () => {
  it("translates memory.store into a memory.fact.create action", () => {
    const fact: PersonalMemoryFact = { id: "f1", text: "Sofia is vegetarian", createdAt: AT, source: "explicit" };
    const actions = persistKernelMutation("memory.store", emptyDocument(), [], emptyDocument(), [fact], "f1");
    expect(actions).toEqual([{ type: "memory.fact.create", fact }]);
  });

  it("translates memory.forget into a memory.fact.delete action", () => {
    const actions = persistKernelMutation("memory.forget", emptyDocument(), [], emptyDocument(), [], "f1");
    expect(actions).toEqual([{ type: "memory.fact.delete", factId: "f1" }]);
  });

  it("translates a calendar.move mutation into a calendar.replace action for the changed date only", () => {
    const before = emptyDocument();
    const after = { ...before, calendars: { ...before.calendars, [before.calendar.dateKey]: { ...before.calendars[before.calendar.dateKey]!, events: [] } } };
    const actions = persistKernelMutation("calendar.move", before, [], after, [], undefined);
    expect(actions).toEqual([{ type: "calendar.replace", plan: after.calendars[after.calendar.dateKey] }]);
  });

  it("emits no actions for a read-only capability", () => {
    expect(persistKernelMutation("recall.search", emptyDocument(), [], emptyDocument(), [], undefined)).toEqual([]);
  });

  it("translates a journal.bookmark mutation into a journal.bookmark.add action — regression test for a mutation that reported success in-memory but was never persisted through dispatchLife", () => {
    const entry = {
      id: "j1", kind: "journal-entry" as const, title: "Trip planning", text: "", status: "saved" as const,
      recordingState: "idle" as const, recordingDurationMs: 10_000, photoAssetIds: [], bookmarks: [],
      transcriptSegments: [], drawings: [], tags: [], createdAt: AT, updatedAt: AT,
    };
    const before = { ...emptyDocument(), studio: { ...emptyDocument().studio, journalEntries: [entry] } };
    const bookmark = { id: "bookmark-1", timestampMs: 4_000, createdAt: AT };
    const after = { ...before, studio: { ...before.studio, journalEntries: [{ ...entry, bookmarks: [bookmark] }] } };
    const actions = persistKernelMutation("journal.bookmark", before, [], after, [], undefined);
    expect(actions).toEqual([{ type: "journal.bookmark.add", entryId: "j1", bookmark }]);
  });
});
