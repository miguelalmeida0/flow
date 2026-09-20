import { describe, it, expect, beforeEach } from "vitest";
import { createSession } from "../kernel";
import { journeyDocument, testEnvironment, fixedClock } from "../__tests__/fixtures";
import { runConversationTurn } from "./conversationCoordinator";
import { DESKTOP_COMPANION_TOKEN_KEY } from "../lib/desktopBridgeClient";

function fakeFetchReturning(content: unknown) {
  return async () =>
    ({
      ok: true,
      json: async () => ({ content: JSON.stringify(content), model: "qwen3-vl:2b-instruct-q4_K_M", totalDurationMs: 10, loadDurationMs: 1, evalCount: 5 }),
    }) as Response;
}

function fakeFetchSequence(payloads: unknown[]) {
  let call = 0;
  return async () => {
    const content = payloads[Math.min(call, payloads.length - 1)];
    call += 1;
    return { ok: true, json: async () => ({ content: JSON.stringify(content), model: "qwen3-vl:2b-instruct-q4_K_M", totalDurationMs: 10, loadDurationMs: 1, evalCount: 5 }) } as Response;
  };
}

beforeEach(() => {
  localStorage.setItem(DESKTOP_COMPANION_TOKEN_KEY, "test-token");
});

describe("runConversationTurn", () => {
  it("returns a spoken answer for a pure conversational question, taking no action", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "How does a JavaScript closure work?",
      normalizedTranscript: "How does a JavaScript closure work?",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: fakeFetchReturning({ kind: "answer", text: "A closure is a function bundled with its surrounding scope.", sources: [] }),
    });
    expect(result.recognized).toBe(true);
    expect(result.phase).toBe("done");
    expect(result.message).toContain("closure");
    expect(result.outcome.status).toBe("executed");
    // No document mutation happened for a pure answer.
    expect(result.env.document).toBe(env.document);
  });

  it("executes a validated calendar.move plan through the real kernel submit(), including deterministic time extraction", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Move dinner to six tonight",
      normalizedTranscript: "Move dinner to six tonight",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: fakeFetchReturning({
        kind: "plan",
        summary: "Move dinner to 6pm",
        steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 999 } }],
      }),
    });
    // The model's bogus startMinutes (999) must never reach execution — the
    // deterministic extractor's 18:00 (1080) from "six" + "dinner"/"tonight" wins.
    expect(result.outcome.status).toBe("executed");
    const movedDinner = result.env.document.calendar.events.find((event) => event.id === "dinner");
    expect(movedDinner?.start).toBe(18 * 60);
  });

  it("proposes an alternative instead of executing when the target time conflicts with another event", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Move dinner to eight tonight",
      normalizedTranscript: "Move dinner to eight tonight",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: fakeFetchReturning({ kind: "plan", summary: "Move dinner to 8pm", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 480 } }] }),
    });
    // 8pm collides with Drinks (8-8:30pm) — the existing preflight/proposal
    // machinery must catch this exactly like any other kernel-recognized move.
    expect(result.outcome.status).toBe("proposed");
    expect(result.env.document.calendar.events.find((event) => event.id === "dinner")?.start).toBe(19 * 60);
  });

  it("rejects a plan step naming a capability id that isn't in the registry, and declines after exhausting the round budget", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Message Sofia that I'll be late",
      normalizedTranscript: "Message Sofia that I'll be late",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: fakeFetchReturning({ kind: "plan", summary: "send message", steps: [{ capabilityId: "friends.message", args: { name: "Sofia", text: "running late" } }] }),
    });
    expect(result.recognized).toBe(false);
    expect(result.declineReason).toBe("invalid-output");
  });

  it("rejects a plan step whose eventId was invented rather than resolved from real data", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Move the made-up thing to nine",
      normalizedTranscript: "Move the made-up thing to nine",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: fakeFetchReturning({ kind: "plan", summary: "move", steps: [{ capabilityId: "calendar.move", args: { eventId: "not-a-real-event-id", startMinutes: 540 } }] }),
    });
    expect(result.recognized).toBe(false);
    expect(result.declineReason).toBe("invalid-output");
    // Nothing in the document changed.
    expect(result.env.document.calendar.events).toEqual(env.document.calendar.events);
  });

  it("asks for am/pm instead of guessing when the time is genuinely ambiguous", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Move it to six",
      normalizedTranscript: "Move it to six",
      env,
      session,
      referents: [{ key: "lastMentioned", label: "Dinner", kind: "calendar-event" }],
      recentTurns: [],
      // No dinner/breakfast/evening/am/pm context word at all — the extractor
      // must refuse to guess a meridiem rather than silently picking one.
      fetchImpl: fakeFetchReturning({ kind: "plan", summary: "move", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 480 } }] }),
    });
    expect(result.outcome.status).toBe("clarify");
    expect(result.message.toLowerCase()).toContain("am/pm");
    expect(result.env.document.calendar.events).toEqual(env.document.calendar.events);
  });

  it("never claims success and never mutates when the local model is unavailable", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Move dinner to eight",
      normalizedTranscript: "Move dinner to eight",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    expect(result.recognized).toBe(false);
    expect(result.declineReason).toBe("model-unavailable");
    expect(result.outcome.status).toBe("error");
    expect(result.env.document).toBe(env.document);
  });

  it("respects an already-cancelled signal and never calls the model", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const result = await runConversationTurn({
      rawTranscript: "Move dinner to eight",
      normalizedTranscript: "Move dinner to eight",
      env,
      session,
      recentTurns: [],
      referents: [],
      signal: controller.signal,
      fetchImpl: async () => {
        called = true;
        throw new Error("should not be called");
      },
    });
    expect(called).toBe(false);
    expect(result.declineReason).toBe("cancelled");
  });

  it("performs a bounded read-only lookup before answering, and never executes a mutating lookup", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "What's on my calendar today?",
      normalizedTranscript: "What's on my calendar today?",
      env,
      session,
      recentTurns: [],
      referents: [],
      fetchImpl: fakeFetchSequence([
        { kind: "lookup", capabilityId: "calendar.query", args: {} },
        { kind: "answer", text: "You have Dinner at 7pm and Drinks at 8pm.", sources: [] },
      ]),
    });
    expect(result.outcome.status).toBe("executed");
    expect(result.message).toContain("Dinner");
  });

  it("holds the deadline and reports a timing decline rather than hanging", async () => {
    const env = testEnvironment(journeyDocument(), fixedClock());
    const session = createSession();
    const result = await runConversationTurn({
      rawTranscript: "Move dinner to eight",
      normalizedTranscript: "Move dinner to eight",
      env,
      session,
      recentTurns: [],
      referents: [],
      budget: { maxRounds: 3, maxPlanSteps: 8, turnDeadlineMs: 0, roundDeadlineMs: 1000, verifierRoundDeadlineMs: 1000, minVerifierBudgetMs: 2000 },
      fetchImpl: fakeFetchReturning({ kind: "answer", text: "too slow" }),
    });
    expect(result.declineReason).toBe("deadline");
  });

  describe("complex-path verifier (see verifier.ts)", () => {
    function fakeFetchCounting(payloads: unknown[]) {
      let call = 0;
      const fetchImpl = (async () => {
        const content = payloads[Math.min(call, payloads.length - 1)];
        call += 1;
        return { ok: true, json: async () => ({ content: JSON.stringify(content), model: "qwen3-vl:2b-instruct-q4_K_M", totalDurationMs: 10, loadDurationMs: 1, evalCount: 5 }) } as Response;
      }) as typeof fetch;
      return { fetchImpl, callCount: () => call };
    }

    it("does NOT invoke the verifier for a plain single-clause plan (fast path)", async () => {
      const env = testEnvironment(journeyDocument(), fixedClock());
      const session = createSession();
      const { fetchImpl, callCount } = fakeFetchCounting([{ kind: "plan", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 1080 } }], summary: "move dinner", conditions: [] }]);
      const result = await runConversationTurn({ rawTranscript: "Move dinner to six tonight", normalizedTranscript: "Move dinner to six tonight", env, session, recentTurns: [], referents: [], fetchImpl });
      expect(result.outcome.status).toBe("executed");
      expect(callCount()).toBe(1); // interpreter only — no second (verifier) call
    });

    it("invokes the verifier for a condition/exclusion clause and proceeds unchanged on 'accept'", async () => {
      const env = testEnvironment(journeyDocument(), fixedClock());
      const session = createSession();
      const { fetchImpl, callCount } = fakeFetchCounting([
        { kind: "plan", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 1080 } }], summary: "move dinner", conditions: ["unless that clashes with drinks"] },
        { verdict: "accept" },
      ]);
      const result = await runConversationTurn({ rawTranscript: "Move dinner to six, unless that clashes with drinks", normalizedTranscript: "Move dinner to six, unless that clashes with drinks", env, session, recentTurns: [], referents: [], fetchImpl });
      expect(callCount()).toBe(2); // interpreter + verifier
      expect(result.outcome.status).toBe("executed");
      expect(result.primaryCapabilityId).toBe("calendar.move");
    });

    it("turns a verifier 'clarify' verdict into a clarification, with zero mutation", async () => {
      const env = testEnvironment(journeyDocument(), fixedClock());
      const session = createSession();
      const { fetchImpl } = fakeFetchCounting([
        { kind: "plan", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 1200 } }], summary: "move dinner", conditions: ["unless that clashes with drinks"] },
        { verdict: "clarify", clarifyQuestion: "Moving dinner to 8 overlaps Drinks at 8 — move Drinks too, or pick a different time for dinner?" },
      ]);
      const result = await runConversationTurn({ rawTranscript: "Move dinner to eight, unless that clashes with drinks", normalizedTranscript: "Move dinner to eight, unless that clashes with drinks", env, session, recentTurns: [], referents: [], fetchImpl });
      expect(result.outcome.status).toBe("clarify");
      expect(result.conversationalClarification?.question).toContain("overlaps");
      expect(result.env.document).toBe(env.document); // untouched
    });

    it("executes the verifier's REPAIRED plan (re-validated), not the interpreter's original, on 'repair'", async () => {
      const env = testEnvironment(journeyDocument(), fixedClock());
      const session = createSession();
      const { fetchImpl } = fakeFetchCounting([
        // Interpreter wrongly proposes moving dinner...
        { kind: "plan", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 1080 } }], summary: "move dinner", conditions: ["leave dinner alone"] },
        // ...verifier catches the contradiction (its own condition says leave dinner alone) and repairs to moving drinks instead.
        { verdict: "repair", repairedFrame: { kind: "plan", steps: [{ capabilityId: "calendar.move", args: { eventId: "drinks", startMinutes: 1000 } }], summary: "move drinks instead", conditions: [] } },
      ]);
      const result = await runConversationTurn({ rawTranscript: "Move the evening thing later, leave dinner alone", normalizedTranscript: "Move the evening thing later, leave dinner alone", env, session, recentTurns: [], referents: [], fetchImpl });
      expect(result.outcome.status).toBe("executed");
      const drinks = result.env.document.calendar.events.find((e) => e.id === "drinks");
      const dinner = result.env.document.calendar.events.find((e) => e.id === "dinner");
      expect(drinks?.start).toBe(1000);
      expect(dinner?.start).toBe(1140); // untouched, exactly as the (repaired) condition required
    });

    it("fails open to the interpreter's own result when the verifier itself is unavailable", async () => {
      const env = testEnvironment(journeyDocument(), fixedClock());
      const session = createSession();
      let call = 0;
      const fetchImpl = (async () => {
        call += 1;
        if (call === 1) {
          return { ok: true, json: async () => ({ content: JSON.stringify({ kind: "plan", steps: [{ capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 1080 } }], summary: "move dinner", conditions: ["unless that clashes with drinks"] }), model: "x", totalDurationMs: 1, loadDurationMs: 1, evalCount: 1 }) } as Response;
        }
        return { ok: false, status: 503, json: async () => ({ error: "Local model is unavailable." }) } as Response;
      }) as typeof fetch;
      const result = await runConversationTurn({ rawTranscript: "Move dinner to six, unless that clashes with drinks", normalizedTranscript: "Move dinner to six, unless that clashes with drinks", env, session, recentTurns: [], referents: [], fetchImpl });
      // Verifier failed — the interpreter's already-valid plan still executes rather than declining the whole turn.
      expect(result.outcome.status).toBe("executed");
      expect(result.primaryCapabilityId).toBe("calendar.move");
    });

    it("also verifies a BATCH plan (more than one step), even with plain phrasing", async () => {
      const env = testEnvironment(journeyDocument(), fixedClock());
      const session = createSession();
      const { fetchImpl, callCount } = fakeFetchCounting([
        {
          kind: "plan",
          conditions: [],
          summary: "move both",
          steps: [
            { capabilityId: "calendar.move", args: { eventId: "dinner", startMinutes: 1080 } },
            { capabilityId: "calendar.move", args: { eventId: "drinks", startMinutes: 1000 } },
          ],
        },
        { verdict: "accept" },
      ]);
      const result = await runConversationTurn({ rawTranscript: "Move dinner and drinks both later", normalizedTranscript: "Move dinner and drinks both later", env, session, recentTurns: [], referents: [], fetchImpl });
      expect(callCount()).toBe(2); // batch (2-step) plan still gets verified even without high-stakes phrasing
      expect(result.outcome.status).toBe("executed");
    });
  });
});
