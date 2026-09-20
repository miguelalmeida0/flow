import { describe, expect, it } from "vitest";
import { classifyReply } from "../proposals";
import { createBridgeSession, runKernelTurn } from "../productionBridge";
import { AT, emptyDocument } from "./fixtures";

describe("closed reply punctuation", () => {
  it.each(["undo that", "undo that.", "undo that!", "undo that,", "undo that?"])("delegates %s to application Undo", reply => {
    expect(classifyReply(reply)).toBe("undo");
    const document = emptyDocument();
    const result = runKernelTurn(reply, document, [], createBridgeSession(), () => new Date(AT));
    expect(result.recognized).toBe(true);
    expect(result.delegateToApp).toBe("undo");
    expect(result.env.document).toEqual(document);
  });

  it.each([
    ["undo", "undo"], ["redo", "redo"], ["confirm", "approve"],
    ["no", "reject"], ["wait", "cancel"], ["never mind", "cancel"],
  ])("preserves the closed contract for %s", (reply, intent) => {
    for (const punctuation of ["", ".", "!", ",", "?"]) {
      expect(classifyReply(reply + punctuation)).toBe(intent);
    }
  });

  it.each([
    '"undo that,"', "undo, that", "undo that, then delete it", "confirm, unless it conflicts",
    "Write undo that, in my journal", "Message Anita: undo that,", "Anita,",
  ])("does not reinterpret freeform content: %s", reply => {
    expect(classifyReply(reply)).toBe("unknown");
  });
});
