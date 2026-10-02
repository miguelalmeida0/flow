import { spawn } from "node:child_process";

const BASELINE = {
  maxFailed: 50,
  minTotal: 123,
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
    let output = "";
    const collect = (chunk, destination) => {
      const value = chunk.toString();
      output += value;
      destination.write(value);
    };
    child.stdout.on("data", (chunk) => collect(chunk, process.stdout));
    child.stderr.on("data", (chunk) => collect(chunk, process.stderr));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

function lastCount(output, label) {
  const clean = stripAnsi(output);
  const pattern = new RegExp(`^\\s*(\\d+)\\s+${label}(?:\\s+\\([^)]+\\))?\\s*$`, "gm");
  const matches = [...clean.matchAll(pattern)];
  return Number(matches.at(-1)?.[1] ?? 0);
}

const result = await run("npm", ["run", "test:e2e"]);
const failed = lastCount(result.output, "failed");
const passed = lastCount(result.output, "passed");
const total = failed + passed;

if (!total) {
  console.error("Could not parse Playwright summary.");
  process.exit(1);
}

console.log("\nFlow browser regression baseline:", { failed, passed, total });

const problems = [];
if (failed > BASELINE.maxFailed) problems.push(`browser failures increased: ${failed} > ${BASELINE.maxFailed}`);
if (total < BASELINE.minTotal) problems.push(`browser tests disappeared: ${total} < ${BASELINE.minTotal}`);

if (problems.length) {
  console.error("\nBrowser regression gate FAILED:");
  problems.forEach((problem) => console.error(`- ${problem}`));
  process.exit(1);
}

if (failed) {
  console.log(`\nBrowser regression gate PASSED at inherited baseline: ${failed} failing / ${passed} passing.`);
  console.log("Any increase fails CI; reductions are accepted automatically.");
} else {
  console.log("\nBrowser regression gate PASSED with a clean Playwright suite.");
}
