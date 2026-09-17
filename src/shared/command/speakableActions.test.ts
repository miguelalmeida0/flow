import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretGlobalCommand } from "./globalInterpreter";
import { uiCapabilities, uiCapability } from "./speakableActions";
import { visibleControlExamples } from "./visibleControlExamples";

function productionTsxFiles(directory = "src"): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return productionTsxFiles(path);
    return entry.name.endsWith(".tsx") && !/\.(?:test|stories)\./.test(entry.name) ? [path] : [];
  });
}

describe("canonical UI capability inventory", () => {
  it.each(visibleControlExamples)("preserves the legacy phrase regression: $label", ({ phrase, context, expectedType }) => {
    expect(interpretGlobalCommand(phrase, { nowMs: Date.parse("2026-09-05T12:00:00Z"), ...context }, "2026-09-05").type).toBe(expectedType);
  });
  it("declares real parameterized handlers and keeps unsupported controls in the denominator", () => {
    expect(new Set(uiCapabilities.map(({ actionId }) => actionId)).size).toBe(uiCapabilities.length);
    for (const item of uiCapabilities) {
      expect(item.actionId).toMatch(/^[a-z][a-z0-9.-]+$/);
      expect(item.domain).toBeTruthy(); expect(item.buttonLabel).toBeTruthy();
      expect(item.implementationHandler).toBeTruthy(); expect(item.component).toContain("src/");
      expect(Array.isArray(item.requiredContext)).toBe(true);
      expect(typeof item.destructive).toBe("boolean"); expect(item.parameterSlots).toBeTypeOf("object");
      if (item.voiceSupported) expect(item.exampleUtterances.length, item.actionId).toBeGreaterThan(0);
      else expect(item.gap, item.actionId).toBeTruthy();
    }
    for (const actionId of ["journal.playback-volume", "journal.playback-rate", "journal.audio-download", "journal.drawing-input", "memory.export", "commitments.search", "capture.edit-cancel", "settings.sound"]) expect(uiCapability(actionId), actionId).toBeDefined();
  });
  it("binds production control declarations to canonical IDs (source coverage, not a rendered-browser count)", () => {
    const missing: string[] = [], unknown: string[] = [];
    for (const path of productionTsxFiles()) {
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/<(?:button|motion\.button|input|textarea|select|audio)\b[^>]*>/g)) {
        if (!match[0].includes("data-action-id=")) missing.push(path + ": " + match[0].slice(0, 140));
      }
      for (const match of source.matchAll(/data-(?:additional-)?action-ids?="([^"]+)"/g)) for (const id of match[1]!.split(/\s+/)) if (!uiCapability(id)) unknown.push(path + ": " + id);
    }
    expect(missing).toEqual([]); expect(unknown).toEqual([]);
  });
  it("requires a voice route for every product capability, including native continuations", () => {
    expect(uiCapabilities.filter(({ voiceSupported, category }) => !voiceSupported && (!category || category === "product-action")).map(({ actionId, gap }) => ({ actionId, gap }))).toEqual([]);
    // Read-only output and developer tooling stay in the denominator with an
    // explicit reason. They must never be disguised as verified voice actions.
    for (const capability of uiCapabilities.filter(({ category }) => category && category !== "product-action")) {
      expect(capability.gap).toBeTruthy(); expect(capability.voiceSupported).toBe(false);
    }
  });
  it("requires verified three-mode evidence, not an alias or source-inspection flag", () => {
    expect(uiCapabilities.filter(({ validation }) => validation !== "verified-three-mode").map(({ actionId }) => actionId)).toEqual([]);
  });
});
