import { readFileSync } from "node:fs";

const [basePath, headPath] = process.argv.slice(2);

if (!basePath || !headPath) {
  throw new Error("Usage: compare-vitest-ratchet.mjs <base-report> <head-report>");
}

function readReport(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function failureIds(report) {
  const failures = new Set();

  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      if (assertion.status !== "failed") continue;

      const title =
        assertion.fullName ??
        [...(assertion.ancestorTitles ?? []), assertion.title ?? assertion.name ?? "unnamed"].join(" > ");

      failures.add(`${file.name ?? file.testFilePath ?? "unknown-file"} :: ${title}`);
    }
  }

  return failures;
}

const base = readReport(basePath);
const head = readReport(headPath);
const baseFailures = failureIds(base);
const headFailures = failureIds(head);

const introduced = [...headFailures].filter((id) => !baseFailures.has(id)).sort();
const resolved = [...baseFailures].filter((id) => !headFailures.has(id)).sort();

const summary = {
  base: {
    total: base.numTotalTests ?? null,
    passed: base.numPassedTests ?? null,
    failed: base.numFailedTests ?? baseFailures.size,
    failedSuites: base.numFailedTestSuites ?? null,
  },
  head: {
    total: head.numTotalTests ?? null,
    passed: head.numPassedTests ?? null,
    failed: head.numFailedTests ?? headFailures.size,
    failedSuites: head.numFailedTestSuites ?? null,
  },
  introducedFailures: introduced.length,
  resolvedFailures: resolved.length,
};

console.log(JSON.stringify(summary, null, 2));

if (resolved.length) {
  console.log("\nResolved baseline failures:");
  for (const id of resolved.slice(0, 50)) console.log(`- ${id}`);
  if (resolved.length > 50) console.log(`- ... and ${resolved.length - 50} more`);
}

if (introduced.length) {
  console.error("\nNew failures not present on the base commit:");
  for (const id of introduced.slice(0, 100)) console.error(`- ${id}`);
  if (introduced.length > 100) console.error(`- ... and ${introduced.length - 100} more`);
  process.exit(1);
}

console.log("\nPASS: candidate introduces no new failing tests relative to its base commit.");
