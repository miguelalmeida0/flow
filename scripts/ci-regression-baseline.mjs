import { spawn } from "node:child_process";

const mode = process.argv[2];

const BASELINE = {
  tests: {
    maxFailedFiles: 23,
    maxFailedTests: 463,
    minTotalFiles: 120,
    minTotalTests: 4988,
  },
  audit: {
    critical: 0,
    high: 1,
    moderate: 2,
    low: 0,
  },
};

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const value = chunk.toString();
      stdout += value;
      process.stdout.write(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = chunk.toString();
      stderr += value;
      process.stderr.write(value);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function parseVitestSummary(output) {
  const clean = stripAnsi(output);
  const fileMatch = clean.match(/Test Files\s+(?:(\d+) failed\s*\|\s*)?(?:(\d+) passed\s*)?(?:\|\s*)?.*?\((\d+)\)/);
  const testMatch = clean.match(/Tests\s+(?:(\d+) failed\s*\|\s*)?(?:(\d+) passed\s*)?(?:\|\s*)?.*?\((\d+)\)/);
  if (!fileMatch || !testMatch) throw new Error("Could not parse Vitest summary.");
  return {
    failedFiles: Number(fileMatch[1] ?? 0),
    passedFiles: Number(fileMatch[2] ?? 0),
    totalFiles: Number(fileMatch[3]),
    failedTests: Number(testMatch[1] ?? 0),
    passedTests: Number(testMatch[2] ?? 0),
    totalTests: Number(testMatch[3]),
  };
}

async function checkTests() {
  const result = await run("npm", ["run", "test:run"]);
  const summary = parseVitestSummary(result.stdout + "\n" + result.stderr);
  const b = BASELINE.tests;
  console.log("\nFlow regression baseline:", summary);
  const problems = [];
  if (summary.failedFiles > b.maxFailedFiles) problems.push(`failed files increased: ${summary.failedFiles} > ${b.maxFailedFiles}`);
  if (summary.failedTests > b.maxFailedTests) problems.push(`failed tests increased: ${summary.failedTests} > ${b.maxFailedTests}`);
  if (summary.totalFiles < b.minTotalFiles) problems.push(`test files disappeared: ${summary.totalFiles} < ${b.minTotalFiles}`);
  if (summary.totalTests < b.minTotalTests) problems.push(`tests disappeared: ${summary.totalTests} < ${b.minTotalTests}`);
  if (problems.length) {
    console.error("\nRegression gate FAILED:");
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(1);
  }
  if (summary.failedFiles || summary.failedTests) {
    console.log(`\nRegression gate PASSED at inherited baseline: ${summary.failedFiles} failing files / ${summary.failedTests} failing tests.`);
    console.log("Any increase fails CI; reductions are accepted automatically.");
  } else {
    console.log("\nRegression gate PASSED with a clean suite.");
  }
}

async function checkAudit() {
  const result = await run("npm", ["audit", "--json"]);
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error("Could not parse npm audit JSON.");
  }
  const found = report.metadata?.vulnerabilities ?? {};
  const b = BASELINE.audit;
  const problems = [];
  for (const severity of ["critical", "high", "moderate", "low"]) {
    const count = Number(found[severity] ?? 0);
    if (count > b[severity]) problems.push(`${severity} vulnerabilities increased: ${count} > ${b[severity]}`);
  }
  console.log("\nDependency vulnerability baseline:", found);
  if (problems.length) {
    console.error("\nDependency regression gate FAILED:");
    problems.forEach((problem) => console.error(`- ${problem}`));
    process.exit(1);
  }
  console.log("\nDependency regression gate PASSED. Existing debt is capped and cannot increase.");
}

if (mode === "tests") await checkTests();
else if (mode === "audit") await checkAudit();
else {
  console.error("Usage: node scripts/ci-regression-baseline.mjs <tests|audit>");
  process.exit(2);
}
