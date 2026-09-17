import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const playwright = resolve(root, "node_modules/.bin/playwright");
const blobDirectory = resolve(root, "artifacts/release-qa/blob-reports");

function run(arguments_, environment = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(playwright, arguments_, {
      cwd: root,
      env: { ...process.env, ...environment },
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    const relay = (chunk, destination) => {
      const value = chunk.toString();
      output += value;
      destination.write(value);
    };
    child.stdout.on("data", (chunk) => relay(chunk, process.stdout));
    child.stderr.on("data", (chunk) => relay(chunk, process.stderr));
    child.on("error", rejectRun);
    child.on("close", (code) => resolveRun({ code: code ?? 1, output }));
  });
}

async function runWithCrashRecovery(arguments_, environment = {}, cleanup) {
  let result = await run(arguments_, environment);
  if (result.code !== 0 && /Target crashed|browser has been closed/i.test(result.output)) {
    cleanup?.();
    result = await run(arguments_, environment);
  }
  return result.code;
}

async function runSlice(project, reportName) {
  const outputFile = resolve(blobDirectory, `${reportName}.zip`);
  const arguments_ = ["test", `--project=${project}`, "--reporter=blob"];
  const result = await runWithCrashRecovery(
    arguments_,
    { PLAYWRIGHT_BLOB_OUTPUT_FILE: outputFile },
    () => rmSync(outputFile, { force: true }),
  );
  return result;
}

// Native Chromium can be reclaimed once after an infrastructure crash.
// Assertion, timeout, performance, and application failures are never retried.
if (process.argv.includes("--dev")) {
  process.exit(await runWithCrashRecovery(["test", "--config=playwright.dev.config.ts"]));
}

if (process.env.FLOW_RELEASE_QA !== "1") {
  process.exit((await run(["test"])).code);
}

// Chromium is deliberately reacquired between the motion profile and the
// functional matrix. Besides keeping the motion measurements cold, this
// prevents a crashed/performance-stressed target from contaminating all
// subsequent evidence. Blob reports preserve one merged, auditable result.
rmSync(blobDirectory, { recursive: true, force: true });
mkdirSync(blobDirectory, { recursive: true });

const motion = await runSlice("chromium-motion", "motion");
if (motion !== 0) process.exit(motion);

const functional = await runSlice("chromium", "functional");
if (functional !== 0) process.exit(functional);

process.exit((await run(["merge-reports", "--config=playwright.config.ts", blobDirectory])).code);
