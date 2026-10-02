import { readFileSync } from "node:fs";

const [basePath, headPath] = process.argv.slice(2);

if (!basePath || !headPath) {
  throw new Error("Usage: compare-playwright-ratchet.mjs <base-report> <head-report>");
}

const base = JSON.parse(readFileSync(basePath, "utf8"));
const head = JSON.parse(readFileSync(headPath, "utf8"));

const unexpectedIds = (report) =>
  new Set((report.tests ?? []).filter((test) => test.outcome === "unexpected").map((test) => test.id));

const baseFailures = unexpectedIds(base);
const headFailures = unexpectedIds(head);

const introduced = [...headFailures].filter((id) => !baseFailures.has(id)).sort();
const resolved = [...baseFailures].filter((id) => !headFailures.has(id)).sort();

console.log(JSON.stringify({
  base: {
    total: base.total ?? null,
    unexpected: baseFailures.size,
    flaky: base.flaky ?? null,
    skipped: base.skipped ?? null,
  },
  head: {
    total: head.total ?? null,
    unexpected: headFailures.size,
    flaky: head.flaky ?? null,
    skipped: head.skipped ?? null,
  },
  introducedFailures: introduced.length,
  resolvedFailures: resolved.length,
}, null, 2));

if (resolved.length) {
  console.log("\nResolved baseline browser failures:");
  for (const id of resolved.slice(0, 50)) console.log(`- ${id}`);
  if (resolved.length > 50) console.log(`- ... and ${resolved.length - 50} more`);
}

if (introduced.length) {
  console.error("\nNew browser failures not present on the base commit:");
  for (const id of introduced.slice(0, 100)) console.error(`- ${id}`);
  if (introduced.length > 100) console.error(`- ... and ${introduced.length - 100} more`);
  process.exit(1);
}

console.log("\nPASS: candidate introduces no new unexpected Playwright outcomes relative to its base commit.");
