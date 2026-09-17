import { expect, it } from "vitest";
import { encodeAudioRange } from "./audioClip";
it("exports only selected samples into standalone bytes, never private prefix or suffix", () => {
  const original = new Float32Array([0.9, 0.8, 0.1, 0.2, -0.1, -0.2, -0.8, -0.9]);
  const result = encodeAudioRange([original], 1000, 2, 6);
  const wav = new DataView(result.buffer);
  expect(result.buffer.byteLength).toBe(52); expect(wav.getUint32(40, true)).toBe(8); expect(result.durationMs).toBe(4);
  expect([0, 1, 2, 3].map((index) => wav.getInt16(44 + index * 2, true))).toEqual([3277, 6553, -3277, -6554]);
  expect([...original]).toHaveLength(8);
});
it("rejects empty, reversed, or out-of-recording range instead of exporting everything", () => {
  for (const [start, end] of [[0, 0], [-1, 4], [3, 2], [1, 9]]) expect(() => encodeAudioRange([new Float32Array(8)], 1000, start!, end!)).toThrow();
});
