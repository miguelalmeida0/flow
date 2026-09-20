import { describe, it, expect } from "vitest";
import { parseFriendIntent } from "./friendIntents";
import type { LifeContext } from "../../domain/life-model";

const baseContext: LifeContext = { route: "people" };

describe("parseFriendIntent: add-a-friend name extraction (physical-test repair E)", () => {
  it("recognizes 'called' the same as 'named' — the exact reported bug", () => {
    const intent = parseFriendIntent("add new friend called Anita", baseContext);
    expect(intent).toMatchObject({ type: "friend-person", operation: "create", query: "Anita" });
  });

  it("still recognizes the already-working 'named' form", () => {
    const intent = parseFriendIntent("add a new friend named Anita", baseContext);
    expect(intent).toMatchObject({ type: "friend-person", operation: "create", query: "Anita" });
  });

  it("recognizes 'add Anita as a friend'", () => {
    const intent = parseFriendIntent("add Anita as a friend", baseContext);
    expect(intent).toMatchObject({ type: "friend-person", operation: "create", query: "Anita" });
  });

  it("preserves a multi-word, accented literal name exactly", () => {
    const intent = parseFriendIntent("create a contact called João da Silva", baseContext);
    expect(intent).toMatchObject({ type: "friend-person", operation: "create", query: "João da Silva" });
  });
  it("accepts STT punctuation at the name-introduction boundary", () => {
    expect(parseFriendIntent("create a contact called, João da Silva.", baseContext)).toMatchObject({ query: "João da Silva" });
    expect(parseFriendIntent("add new friend called. Anita.", baseContext)).toMatchObject({ query: "Anita" });
  });

  it("preserves hyphens and apostrophes in a called-name", () => {
    const intent = parseFriendIntent("add a friend called Mary-Jane O'Neil", baseContext);
    expect(intent).toMatchObject({ type: "friend-person", operation: "create", query: "Mary-Jane O'Neil" });
  });

  it("does not strip 'called'/'named' from a name that genuinely starts with those words", () => {
    // Regression guard: the fix must not globally strip "called"/"named"
    // from arbitrary user data — only the specific "friend/contact/person
    // (named|called) <name>" collocation.
    const intent = parseFriendIntent("add friend Callie Jones", baseContext);
    expect(intent).toMatchObject({ type: "friend-person", operation: "create", query: "Callie Jones" });
  });
});
