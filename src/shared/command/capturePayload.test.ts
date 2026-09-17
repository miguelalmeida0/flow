import { describe, expect, it } from "vitest";
import { parseExplicitCapture } from "./capturePayload";

describe("Capture frame and raw payload ownership", () => {
  it.each([
    ["Note that I should buy bread", "buy bread"],
    ['Note "I should buy bread"', "I should buy bread"],
    ["Save for later: Fish and chips", "Fish and chips"],
    ["Remember that address for later", "that address for later"],
    ["Remember that red book", "that red book"],
    ["Remember that painted door", "that painted door"],
    ["Remember that Maya likes tea", "Maya likes tea"],
    ["Remember that the door code changed", "the door code changed"],
    ['Remember "that address changed"', "that address changed"],
    ["I should buy bread", null],
    ["I remember that address", null],
  ])("keeps only the explicitly authorized payload of %s", (source, expected) => expect(parseExplicitCapture(source)).toBe(expected));
});
