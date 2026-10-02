import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

export default class FlowPlaywrightRatchetReporter {
  constructor() {
    this.tests = new Map();
  }

  onTestEnd(test) {
    const project = test.parent?.project?.()?.name ?? "default";
    const titlePath = test.titlePath().filter(Boolean).join(" > ");
    const id = `${project} :: ${test.location.file} :: ${titlePath}`;
    this.tests.set(id, test);
  }

  onEnd(result) {
    const output = process.env.FLOW_PLAYWRIGHT_RATCHET_FILE;
    if (!output) throw new Error("FLOW_PLAYWRIGHT_RATCHET_FILE is required");

    const tests = [...this.tests.entries()]
      .map(([id, test]) => ({
        id,
        outcome: test.outcome(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const summary = {
      status: result.status,
      total: tests.length,
      unexpected: tests.filter((test) => test.outcome === "unexpected").length,
      expected: tests.filter((test) => test.outcome === "expected").length,
      skipped: tests.filter((test) => test.outcome === "skipped").length,
      flaky: tests.filter((test) => test.outcome === "flaky").length,
      tests,
    };

    const target = resolve(output);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(summary, null, 2) + "\n");
  }

  printsToStdio() {
    return false;
  }
}
