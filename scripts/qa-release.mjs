import { spawn } from "node:child_process";
import {
  cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { physicalMicrophoneStatus, removeStaleVoiceBrowserResults } from "./qa-release-evidence.mjs";
import { CANONICAL_MOTION_EVIDENCE_DIR, resetCanonicalMotionEvidence } from "./motion-evidence-scope.mjs";

const projectRoot = process.cwd();
const evidenceDir = resolve(projectRoot, "artifacts/release-qa");
const tideEvidenceDir = resolve(projectRoot, "artifacts/tide-release");
const livingEvidenceDir = resolve(projectRoot, "artifacts/living-environment-release");
const alwaysOnEvidenceDir = resolve(projectRoot, "artifacts/always-on-voice-release");
const appleEvidenceDir = resolve(projectRoot, "artifacts/apple-grade-release");
const eliteEvidenceDir = resolve(projectRoot, "artifacts/elite-release");
const eliteProductRescueEvidenceDir = resolve(projectRoot, "artifacts/elite-product-rescue");
const visualRewardEvidenceDir = resolve(projectRoot, CANONICAL_MOTION_EVIDENCE_DIR);
const routeEntryEvidenceDir = resolve(projectRoot, "artifacts/route-entry-motion");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const expectedScreenshots = [
  "01-initial-breathing-day.png",
  "02-important-red-event.png",
  "03-breathing-room.png",
  "04-tide-reflow.png",
  "05-split-events.png",
  "06-what-if.png",
  "07-undo.png",
  "08-mobile.png",
  "09-reduced-motion.png",
];
const expectedLivingScreenshots = [
  "01-home.png", "02-calendar.png", "03-command-preview.png", "04-tide-recovery.png", "05-what-if.png",
  "06-inbox-source-focus.png", "07-inbox-to-plan-transfer.png", "08-plan-detail.png", "09-people.png", "10-now.png",
  "11-mobile.png", "12-reduced-motion.png",
];
const expectedAlwaysOnScreenshots = [
  "01-contextual-calendar.png", "02-explicit-inbox-capture.png", "03-passport-plan.png",
  "04-now-from-shared-model.png", "05-mobile-reduced-motion.png", "06-acquisition-failure.png",
  "07-acquisition-retry-success.png", "08-cross-tab-owner.png", "09-cross-tab-reclaimed.png",
  "10-dev-strictmode-listening.png", "11-stale-client-reclaimed.png",
];
const expectedAppleScreenshots = [
  "01-home-meaningful.png", "02-today-now-embedded.png", "03-capture-unresolved-and-routed.png",
  "04-outcome-scheduled-step.png", "05-commitments-three-lenses.png", "06-global-navigation-command.png",
  "07-contextual-follow-up.png", "08-tide-recovery-preview.png", "09-mobile-home.png",
  "10-mobile-today.png", "11-reduced-motion.png",
];
const expectedAppleMotionFrames = ["desktop", "tablet", "mobile"].flatMap((viewport) =>
  ["event-movement", "capture-to-outcome", "outcome-step-to-today", "completion-reclaim", "tide-recovery"].flatMap((operation) =>
    [0, 25, 50, 75, 100].map((percentage) => `motion-${viewport}-${operation}-${String(percentage).padStart(3, "0")}.png`)));
const expectedEliteScreenshots = [
  "01-elite-home-1672x941.png", "02-elite-tomorrow.png", "03-elite-focus-proposal.png",
  "04-elite-focus-active.png", "05-elite-exact-undo.png", "06-elite-final-voice.png",
  "07-elite-tablet.png", "08-elite-mobile.png", "09-elite-reduced-motion.png",
  "10-elite-week.png",
];
const eliteProductRescueViewports = ["reference-1672x941", "desktop-1440", "laptop-1280", "tablet-834", "mobile-390"];
const eliteProductRescueStates = [
  "home-today", "home-tomorrow", "today-populated", "today-open-day", "focus-available", "focus-active",
  "weather-outfit", "people-default", "people-commitments", "good-to-know", "capture-unresolved", "capture-populated",
  "outcomes-empty", "outcomes-populated", "time-travel-transition", "navigation-transition", "command-listening",
  "command-clarification", "reduced-motion",
];
const expectedEliteProductRescueScreenshots = eliteProductRescueViewports.flatMap((viewport) =>
  eliteProductRescueStates.map((state) => `${viewport}--${state}.png`));

function stripAnsi(value) {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function runCommand(label, args, extraEnvironment = {}) {
  return new Promise((done) => {
    const child = spawn(npmCommand, args, {
      cwd: projectRoot,
      env: { ...process.env, ...extraEnvironment },
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    const collect = (chunk, destination) => {
      const text = chunk.toString();
      output += text;
      destination.write(text);
    };
    child.stdout.on("data", (chunk) => collect(chunk, process.stdout));
    child.stderr.on("data", (chunk) => collect(chunk, process.stderr));
    child.on("error", (error) => {
      output += `\n${error.stack ?? error.message}\n`;
    });
    child.on("close", (exitCode) => {
      const cleanOutput = stripAnsi(output);
      writeFileSync(resolve(evidenceDir, `${label}.log`), cleanOutput);
      done({ exitCode: exitCode ?? 1, output: cleanOutput });
    });
  });
}

function semanticCorpusSize() {
  const decodeLiteral = (literal) => literal.startsWith('"')
    ? JSON.parse(literal)
    : literal.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  const stringLiteral = `(?:"(?:\\\\.|[^"\\\\])*"|'(?:\\\\.|[^'\\\\])*')`;
  const utterances = (file, declaration) => {
    const source = readFileSync(resolve(projectRoot, file), "utf8");
    const declarationStart = source.indexOf(`const ${declaration}:`);
    const arrayStart = source.indexOf("= [", declarationStart);
    const arrayEnd = source.indexOf("\n];", arrayStart);
    if (declarationStart < 0 || arrayStart < 0 || arrayEnd < 0) return [];
    const pattern = new RegExp(`\\butterance:\\s*(${stringLiteral})`, "g");
    return [...source.slice(arrayStart, arrayEnd).matchAll(pattern)].map((match) => decodeLiteral(match[1]));
  };
  const parserSource = readFileSync(resolve(projectRoot, "src/features/day-planner/parser.test.ts"), "utf8");
  const legacyCorpusRows = utterances("src/features/day-planner/parser.test.ts", "corpus");
  const sourceTimeRows = utterances("src/features/day-planner/parser.test.ts", "changeVariants");
  const boundaryNounRows = utterances("src/features/day-planner/parser.test.ts", "boundaryNounVariants");
  const standalonePattern = new RegExp(`interpretTranscript\\(\\s*(${stringLiteral})`, "g");
  const standaloneRows = [...parserSource.matchAll(standalonePattern)].map((match) => decodeLiteral(match[1]));
  const legacyRows = new Set([...legacyCorpusRows, ...sourceTimeRows, ...boundaryNounRows]);
  const duplicateStandaloneParserOutcomes = standaloneRows.filter((utterance) => legacyRows.has(utterance)).length;
  standaloneRows.forEach((utterance) => legacyRows.add(utterance));
  const tideRows = utterances("src/features/day-planner/tideLanguage.test.ts", "tideCorpus");
  const livingSource = readFileSync(resolve(projectRoot, "src/shared/command/globalInterpreter.test.ts"), "utf8");
  const livingPattern = new RegExp(`^\\s*\\[\\s*(${stringLiteral})\\s*,\\s*(?:"home"|"calendar"|"inbox"|"plans")\\s*,`, "gm");
  const livingObjectPattern = new RegExp(`\\butterance:\\s*(${stringLiteral})`, "g");
  const livingRows = [
    ...[...livingSource.matchAll(livingPattern)].map((match) => decodeLiteral(match[1])),
    ...[...livingSource.matchAll(livingObjectPattern)].map((match) => decodeLiteral(match[1])),
  ];
  const appleSource = readFileSync(resolve(projectRoot, "src/shared/command/appleSemanticCorpus.test.ts"), "utf8");
  const appleTuplePattern = new RegExp(`\\[\\s*(${stringLiteral})\\s*,\\s*${stringLiteral}\\s*\\]`, "g");
  const appleObjectPattern = new RegExp(`^\\s*\\{\\s*utterance:\\s*(${stringLiteral})`, "gm");
  const appleSeeds = [
    ...[...appleSource.matchAll(appleTuplePattern)].map((match) => decodeLiteral(match[1])),
    ...[...appleSource.matchAll(appleObjectPattern)].map((match) => decodeLiteral(match[1])),
  ];
  const lowerFirst = (value) => value.replace(/^./, (letter) => letter.toLowerCase());
  const appleRows = appleSeeds.flatMap((value) => [
    value,
    `Please, ${lowerFirst(value)}.`,
    `Actually, ${lowerFirst(value)}?`,
    `Can you ${lowerFirst(value)}?`,
  ]);
  const eliteSource = readFileSync(resolve(projectRoot, "src/shared/command/eliteSemanticCorpus.test.ts"), "utf8");
  const eliteTuplePattern = new RegExp(`^\\s*\\[\\s*(${stringLiteral})\\s*,`, "gm");
  const eliteRows = [...eliteSource.matchAll(eliteTuplePattern)].map((match) => decodeLiteral(match[1]));
  const generatedNavigationSource = readFileSync(resolve(projectRoot, "src/features/voice-navigation/generatedNavigationCorpus.ts"), "utf8");
  const navigationPositive = Number(generatedNavigationSource.match(/NAVIGATION_POSITIVE_VARIANT_COUNT\s*=\s*([\d_]+)/)?.[1].replaceAll("_", "") ?? 0);
  const navigationCollisionNegatives = Number(generatedNavigationSource.match(/NAVIGATION_COLLISION_NEGATIVE_COUNT\s*=\s*([\d_]+)/)?.[1].replaceAll("_", "") ?? 0);
  const uniqueTideRows = new Set(tideRows);
  const duplicateCrossSuiteOutcomes = [...uniqueTideRows].filter((utterance) => legacyRows.has(utterance)).length;
  const allRows = new Set([...legacyRows, ...tideRows, ...livingRows, ...appleRows, ...eliteRows]);
  const legacy = legacyRows.size;
  const tide = uniqueTideRows.size;
  return {
    legacy,
    legacyCorpus: legacyCorpusRows.length,
    sourceTimeVariants: sourceTimeRows.length,
    boundaryNounVariants: boundaryNounRows.length,
    standaloneParserAssertions: standaloneRows.length,
    standaloneParserOutcomes: standaloneRows.length - duplicateStandaloneParserOutcomes,
    duplicateStandaloneParserOutcomes,
    tide,
    duplicateTideOutcomes: tideRows.length - tide,
    duplicateCrossSuiteOutcomes,
    tideAdditionalOutcomes: tide - duplicateCrossSuiteOutcomes,
    living: new Set(livingRows).size,
    appleSupported: new Set(appleRows).size,
    eliteManual: new Set(eliteRows).size,
    navigationPositive,
    navigationCollisionNegatives,
    total: allRows.size + navigationPositive + navigationCollisionNegatives,
  };
}

if (process.argv.includes("--semantic-count-only")) {
  console.log(JSON.stringify(semanticCorpusSize(), null, 2));
  process.exit(0);
}

// Only a real release run invalidates old browser evidence. Read-only corpus
// accounting must never erase screenshots, reports, or failure traces.
rmSync(evidenceDir, { recursive: true, force: true });
rmSync(tideEvidenceDir, { recursive: true, force: true });
rmSync(livingEvidenceDir, { recursive: true, force: true });
rmSync(alwaysOnEvidenceDir, { recursive: true, force: true });
rmSync(appleEvidenceDir, { recursive: true, force: true });
rmSync(eliteEvidenceDir, { recursive: true, force: true });
rmSync(eliteProductRescueEvidenceDir, { recursive: true, force: true });
resetCanonicalMotionEvidence(projectRoot);
rmSync(routeEntryEvidenceDir, { recursive: true, force: true });
removeStaleVoiceBrowserResults(projectRoot);
mkdirSync(evidenceDir, { recursive: true });
mkdirSync(tideEvidenceDir, { recursive: true });
mkdirSync(livingEvidenceDir, { recursive: true });
mkdirSync(alwaysOnEvidenceDir, { recursive: true });
mkdirSync(appleEvidenceDir, { recursive: true });
mkdirSync(eliteEvidenceDir, { recursive: true });
mkdirSync(eliteProductRescueEvidenceDir, { recursive: true });

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function vitestCount(output, label) {
  const summaries = [...output.matchAll(new RegExp(`^\\s*${label}\\s+(.+)$`, "gm"))];
  const summary = summaries.at(-1)?.[1]?.trim() ?? "";
  const count = (status) => Number(summary.match(new RegExp(`(\\d+) ${status}`))?.[1] ?? 0);
  const explicitTotal = Number(summary.match(/\((\d+)\)\s*$/)?.[1] ?? 0);
  const passed = count("passed");
  const failed = count("failed");
  const skipped = count("skipped");
  return { total: explicitTotal || passed + failed + skipped, passed, failed, skipped };
}

function testCounts(output) {
  const files = vitestCount(output, "Test Files");
  const tests = vitestCount(output, "Tests");
  return { files: files.total, tests: tests.total, passedFiles: files.passed, passedTests: tests.passed };
}

function testSummary(output) {
  const counts = testCounts(output);
  return counts.files && counts.tests
    ? `PASS — ${counts.files} files, ${counts.tests} tests`
    : "PASS — Vitest completed successfully";
}

function failedTestSummary(output, exitCode) {
  const counts = testCounts(output);
  return counts.files && counts.tests
    ? `FAIL — exit ${exitCode}; ${counts.passedFiles}/${counts.files} files and ${counts.passedTests}/${counts.tests} tests passed`
    : `FAIL — exit ${exitCode}`;
}

const commands = {};
let proceed = true;

const lint = await runCommand("lint", ["run", "lint"]);
commands.lint = { command: "npm run lint", exitCode: lint.exitCode, log: "artifacts/release-qa/lint.log" };
proceed = lint.exitCode === 0;

const tests = proceed ? await runCommand("tests", ["run", "test:run"]) : { exitCode: -1, output: "" };
commands.tests = { command: "npm run test:run", exitCode: tests.exitCode, log: "artifacts/release-qa/tests.log" };
proceed = proceed && tests.exitCode === 0;

const build = proceed ? await runCommand("build", ["run", "build"]) : { exitCode: -1, output: "" };
commands.build = { command: "npm run build", exitCode: build.exitCode, log: "artifacts/release-qa/build.log" };
proceed = proceed && build.exitCode === 0;

const designMigration = proceed ? await runCommand("design-migration", ["run", "qa:design-migration"]) : { exitCode: -1, output: "" };
commands.designMigration = { command: "npm run qa:design-migration", exitCode: designMigration.exitCode, log: "artifacts/release-qa/design-migration.log" };
proceed = proceed && designMigration.exitCode === 0;

const motionQa = proceed ? await runCommand("motion", ["run", "qa:motion"]) : { exitCode: -1, output: "" };
commands.motion = { command: "npm run qa:motion", exitCode: motionQa.exitCode, log: "artifacts/release-qa/motion.log" };
proceed = proceed && motionQa.exitCode === 0;

const e2e = proceed
  ? await runCommand("e2e", ["run", "test:e2e"], { FLOW_RELEASE_QA: "1" })
  : { exitCode: -1, output: "" };
commands.e2e = { command: "FLOW_RELEASE_QA=1 npm run test:e2e", exitCode: e2e.exitCode, log: "artifacts/release-qa/e2e.log" };
const devE2e = e2e.exitCode === 0
  ? await runCommand("e2e-dev", ["run", "test:e2e:dev"], {
      FLOW_MOTION_EVIDENCE_OWNER: "qa:release",
      FLOW_MOTION_EVIDENCE_DIR: CANONICAL_MOTION_EVIDENCE_DIR,
    })
  : { exitCode: -1, output: "" };
commands.devE2e = { command: "npm run test:e2e:dev", exitCode: devE2e.exitCode, log: "artifacts/release-qa/e2e-dev.log" };

for (const name of ["playwright-report", "playwright-results", "playwright-results.json"]) {
  const source = resolve(evidenceDir, name);
  if (existsSync(source)) cpSync(source, resolve(tideEvidenceDir, name), { recursive: true });
}

const browserEvidencePath = resolve(tideEvidenceDir, "browser-evidence.json");
const tideBrowserEvidencePath = resolve(tideEvidenceDir, "tide-browser-evidence.json");
const livingBrowserEvidencePath = resolve(livingEvidenceDir, "browser-evidence.json");
const alwaysOnBrowserEvidencePath = resolve(alwaysOnEvidenceDir, "browser-evidence.json");
const devBrowserEvidencePath = resolve(alwaysOnEvidenceDir, "dev-browser-evidence.json");
const appleBrowserEvidencePath = resolve(appleEvidenceDir, "browser-evidence.json");
const eliteBrowserEvidencePath = resolve(eliteEvidenceDir, "browser-evidence.json");
const eliteProductRescueJourneyPath = resolve(eliteProductRescueEvidenceDir, "single-session-evidence.json");
const eliteProductRescueMatrixPath = resolve(eliteProductRescueEvidenceDir, "visual-matrix/matrix.json");
const baseBrowserEvidence = readJson(browserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [], screenshots: [],
});
const tideBrowserEvidence = readJson(tideBrowserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [],
});
const livingBrowserEvidence = readJson(livingBrowserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [],
});
const alwaysOnBrowserEvidence = readJson(alwaysOnBrowserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [], syntheticVoice: "MISSING", acquisitionRecovery: "MISSING", crossTabAcquisition: "MISSING", crossTabDocumentIntegrity: "MISSING", crossTabDelayedRelease: "MISSING", staleClientReclaim: "MISSING",
});
const devBrowserEvidence = readJson(devBrowserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [], strictModeAcquisition: "MISSING",
});
const appleBrowserEvidence = readJson(appleBrowserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [], utilityJourney: "MISSING", motionResidue: "MISSING",
});
const eliteBrowserEvidence = readJson(eliteBrowserEvidencePath, {
  browserConsoleErrors: [], pageErrors: [], failedRequests: [], northStar: "MISSING", syntheticVoice: "MISSING", responsive: "MISSING", accessibleActions: "MISSING", weekProjection: "MISSING", instinctDeduplication: "MISSING",
});
const eliteProductRescueJourney = readJson(eliteProductRescueJourneyPath, {
  verdict: "MISSING", steps: 0, transcripts: [], browserConsoleErrors: [], pageErrors: [], failedRequests: [],
});
const eliteProductRescueMatrix = readJson(eliteProductRescueMatrixPath, {
  verdict: "MISSING", expected: expectedEliteProductRescueScreenshots.length, screenshots: [], browserConsoleErrors: [], pageErrors: [], failedRequests: [],
});
const visualRewardResultsPath = resolve(visualRewardEvidenceDir, "results.json");
const visualRewardResults = readJson(visualRewardResultsPath, { verdict: "MISSING", visualFrames: { actual: 0, inspected: 0 }, browser: { consoleErrors: ["MISSING"], pageErrors: [], failedRequests: [] } });
const devSignatureEvidencePath = resolve(visualRewardEvidenceDir, "development-signatures.json");
const devSignatureEvidence = readJson(devSignatureEvidencePath, { verdict: "MISSING", results: [], browserConsoleErrors: ["MISSING"], pageErrors: [], failedRequests: [] });
const requiredDevSignatures = ["tide-recovery", "focus-completion", "outcome-completion", "commitment-kept", "time-travel", "capture-to-outcome"];
const devSignaturesPassed = devSignatureEvidence.verdict === "PASS" && devSignatureEvidence.results.length === 12
  && requiredDevSignatures.every((signature) => ["full", "reduced"].every((mode) => devSignatureEvidence.results.filter((row) => row.signature === signature && row.mode === mode && row.verdict === "PASS"
    && row.runtimeAfter?.bundleType === 1 && row.runtimeAfter?.strictEffectsMode && row.runtimeAfter?.strictProbes > row.runtimeBefore?.strictProbes
    && row.interruption?.active && row.interruption?.controlFound && row.settled?.animations === 0 && row.settled?.residue === 0).length === 1))
  && !devSignatureEvidence.browserConsoleErrors.length && !devSignatureEvidence.pageErrors.length && !devSignatureEvidence.failedRequests.length;
const routeEntryEvidence = readJson(resolve(routeEntryEvidenceDir, "native-route-entry.json"), { verdict: "MISSING", states: [], frames: [] });
const routeEntryPassed = routeEntryEvidence.verdict === "PASS" && routeEntryEvidence.states.length > 5 && routeEntryEvidence.frames.length === 5
  && new Set(routeEntryEvidence.frames.map(({ timestamp }) => timestamp)).size === 5
  && ["before.png", "settled.png", ...[0, 1, 2, 3, 4].map((index) => `native-${index}.png`)].every((file) => existsSync(resolve(routeEntryEvidenceDir, file)));
const browserEvidence = {
  browserConsoleErrors: [...baseBrowserEvidence.browserConsoleErrors, ...tideBrowserEvidence.browserConsoleErrors, ...livingBrowserEvidence.browserConsoleErrors, ...alwaysOnBrowserEvidence.browserConsoleErrors, ...devBrowserEvidence.browserConsoleErrors, ...appleBrowserEvidence.browserConsoleErrors, ...eliteBrowserEvidence.browserConsoleErrors, ...eliteProductRescueJourney.browserConsoleErrors, ...eliteProductRescueMatrix.browserConsoleErrors],
  pageErrors: [...baseBrowserEvidence.pageErrors, ...tideBrowserEvidence.pageErrors, ...livingBrowserEvidence.pageErrors, ...alwaysOnBrowserEvidence.pageErrors, ...devBrowserEvidence.pageErrors, ...appleBrowserEvidence.pageErrors, ...eliteBrowserEvidence.pageErrors, ...eliteProductRescueJourney.pageErrors, ...eliteProductRescueMatrix.pageErrors],
  failedRequests: [...baseBrowserEvidence.failedRequests, ...tideBrowserEvidence.failedRequests, ...livingBrowserEvidence.failedRequests, ...alwaysOnBrowserEvidence.failedRequests, ...devBrowserEvidence.failedRequests, ...appleBrowserEvidence.failedRequests, ...eliteBrowserEvidence.failedRequests, ...eliteProductRescueJourney.failedRequests, ...eliteProductRescueMatrix.failedRequests],
  screenshots: expectedScreenshots.map((filename) => `artifacts/tide-release/${filename}`),
};
const playwrightResultsPath = resolve(evidenceDir, "playwright-results.json");
const playwrightResults = readJson(playwrightResultsPath, {});
const playwrightStats = playwrightResults.stats ?? {};
const devPlaywrightResultsPath = resolve(evidenceDir, "playwright-dev-results.json");
const devPlaywrightResults = readJson(devPlaywrightResultsPath, {});
const devPlaywrightStats = devPlaywrightResults.stats ?? {};
const screenshotPaths = expectedScreenshots
  .map((filename) => `artifacts/tide-release/${filename}`)
  .filter((path) => existsSync(resolve(projectRoot, path)));
const livingScreenshotPaths = expectedLivingScreenshots
  .map((filename) => `artifacts/living-environment-release/${filename}`)
  .filter((path) => existsSync(resolve(projectRoot, path)));
const alwaysOnScreenshotPaths = expectedAlwaysOnScreenshots
  .map((filename) => `artifacts/always-on-voice-release/${filename}`)
  .filter((path) => existsSync(resolve(projectRoot, path)));
const appleScreenshotPaths = expectedAppleScreenshots.map((filename) => `artifacts/apple-grade-release/${filename}`).filter((path) => existsSync(resolve(projectRoot, path)));
const appleMotionFramePaths = expectedAppleMotionFrames.map((filename) => `artifacts/apple-grade-release/${filename}`).filter((path) => existsSync(resolve(projectRoot, path)));
const eliteScreenshotPaths = expectedEliteScreenshots.map((filename) => `artifacts/elite-release/${filename}`).filter((path) => existsSync(resolve(projectRoot, path)));
const eliteProductRescueScreenshotPaths = expectedEliteProductRescueScreenshots.map((filename) => `artifacts/elite-product-rescue/visual-matrix/${filename}`).filter((path) => existsSync(resolve(projectRoot, path)));
const browserEvidencePresent = existsSync(browserEvidencePath) && existsSync(tideBrowserEvidencePath) && existsSync(livingBrowserEvidencePath) && existsSync(alwaysOnBrowserEvidencePath) && existsSync(devBrowserEvidencePath) && existsSync(appleBrowserEvidencePath) && existsSync(eliteBrowserEvidencePath) && existsSync(eliteProductRescueJourneyPath) && existsSync(eliteProductRescueMatrixPath);
const allScreenshotsPresent = screenshotPaths.length === expectedScreenshots.length;
const allLivingScreenshotsPresent = livingScreenshotPaths.length === expectedLivingScreenshots.length;
const allAlwaysOnScreenshotsPresent = alwaysOnScreenshotPaths.length === expectedAlwaysOnScreenshots.length;
const allAppleScreenshotsPresent = appleScreenshotPaths.length === expectedAppleScreenshots.length;
const allAppleMotionFramesPresent = appleMotionFramePaths.length === expectedAppleMotionFrames.length;
const allEliteScreenshotsPresent = eliteScreenshotPaths.length === expectedEliteScreenshots.length;
const allEliteProductRescueScreenshotsPresent = eliteProductRescueScreenshotPaths.length === expectedEliteProductRescueScreenshots.length;
const eliteProductRescueJourneyPassed = eliteProductRescueJourney.verdict === "PASS"
  && eliteProductRescueJourney.steps === 24
  && eliteProductRescueJourney.transcripts?.length === 24;
const eliteProductRescueMatrixPassed = eliteProductRescueMatrix.verdict === "PASS"
  && eliteProductRescueMatrix.expected === expectedEliteProductRescueScreenshots.length
  && eliteProductRescueMatrix.screenshots?.length === expectedEliteProductRescueScreenshots.length
  && allEliteProductRescueScreenshotsPresent;
const browserClean = browserEvidencePresent
  && browserEvidence.browserConsoleErrors.length === 0
  && browserEvidence.pageErrors.length === 0
  && browserEvidence.failedRequests.length === 0;
const motionStressPath = resolve(livingEvidenceDir, "motion-stress.json");
const motionStress = readJson(motionStressPath, null);
const motionThresholds = { maxClones: 1, minCompletedTransitions: 20, maxMedianDurationMs: 1250, maxLongestMainThreadTaskMs: 50, maxDroppedFrames: 20 };
const motionStressPassed = Boolean(motionStress
  && motionStress.activeClones === 0
  && motionStress.activeFrameLoops === 0
  && motionStress.peakClones <= motionThresholds.maxClones
  && motionStress.completedTransitions >= motionThresholds.minCompletedTransitions
  && motionStress.medianDurationMs <= motionThresholds.maxMedianDurationMs
  && motionStress.longestMainThreadTaskMs <= motionThresholds.maxLongestMainThreadTaskMs
  && motionStress.droppedFrameEstimate <= motionThresholds.maxDroppedFrames);
if (browserEvidencePresent) writeFileSync(browserEvidencePath, `${JSON.stringify(browserEvidence, null, 2)}\n`);
const e2ePassed = e2e.exitCode === 0 && devE2e.exitCode === 0;
const automatedVoiceVerified = e2ePassed
  && alwaysOnBrowserEvidence.syntheticVoice === "PASS"
  && alwaysOnBrowserEvidence.acquisitionRecovery === "PASS";
const chromiumTestCount = Number(playwrightStats.expected ?? 0) + Number(devPlaywrightStats.expected ?? 0);
const releasePassed = lint.exitCode === 0
  && tests.exitCode === 0
  && build.exitCode === 0
  && designMigration.exitCode === 0
  && motionQa.exitCode === 0
  && visualRewardResults.verdict === "PASS"
  && e2ePassed
  && browserClean
  && allScreenshotsPresent
  && allLivingScreenshotsPresent
  && allAlwaysOnScreenshotsPresent
  && allAppleScreenshotsPresent
  && allAppleMotionFramesPresent
  && allEliteScreenshotsPresent
  && eliteProductRescueJourneyPassed
  && eliteProductRescueMatrixPassed
  && alwaysOnBrowserEvidence.syntheticVoice === "PASS"
  && alwaysOnBrowserEvidence.appleJourney === "PASS"
  && alwaysOnBrowserEvidence.acquisitionRecovery === "PASS"
  && alwaysOnBrowserEvidence.crossTabAcquisition === "PASS"
  && alwaysOnBrowserEvidence.crossTabDocumentIntegrity === "PASS"
  && alwaysOnBrowserEvidence.crossTabDelayedRelease === "PASS"
  && alwaysOnBrowserEvidence.staleClientReclaim === "PASS"
  && devBrowserEvidence.strictModeAcquisition === "PASS"
  && devSignaturesPassed
  && routeEntryPassed
  && appleBrowserEvidence.utilityJourney === "PASS"
  && appleBrowserEvidence.motionResidue === "PASS"
  && eliteBrowserEvidence.northStar === "PASS"
  && eliteBrowserEvidence.syntheticVoice === "PASS"
  && eliteBrowserEvidence.responsive === "PASS"
  && eliteBrowserEvidence.accessibleActions === "PASS"
  && eliteBrowserEvidence.weekProjection === "PASS"
  && eliteBrowserEvidence.instinctDeduplication === "PASS"
  && motionStressPassed;

const semanticCorpus = semanticCorpusSize();
const results = {
  lint: lint.exitCode === 0 ? "PASS — ESLint completed with zero errors" : `FAIL — exit ${lint.exitCode}`,
  tests: tests.exitCode === 0 ? testSummary(tests.output) : tests.exitCode === -1 ? "NOT RUN" : failedTestSummary(tests.output, tests.exitCode),
  testCounts: { unitFiles: testCounts(tests.output).files, unitTests: testCounts(tests.output).tests, chromiumTests: chromiumTestCount },
  semanticUtterances: semanticCorpus.total,
  semanticBreakdown: semanticCorpus,
  build: build.exitCode === 0 ? "PASS — strict TypeScript and Vite production build completed" : build.exitCode === -1 ? "NOT RUN" : `FAIL — exit ${build.exitCode}`,
  designMigration: designMigration.exitCode === 0 ? "PASS — reachable production graph contains no legacy dark-shell or permanent-navigation residue" : designMigration.exitCode === -1 ? "NOT RUN" : `FAIL — exit ${designMigration.exitCode}`,
  visualRewardMotion: visualRewardResults.verdict === "PASS" ? `PASS — ${visualRewardResults.visualFrames.actual} signature frames inspected, performance audit green, and portfolio recording captured` : motionQa.exitCode === -1 ? "NOT RUN" : `FAIL — inspect artifacts/visual-reward-qa/results.json`,
  visualRewardEvidence: existsSync(visualRewardResultsPath) ? "artifacts/visual-reward-qa/results.json" : "MISSING",
  e2e: e2ePassed
    ? `PASS — ${chromiumTestCount} Playwright tests passed (${playwrightStats.expected ?? 0} production-preview + ${devPlaywrightStats.expected ?? 0} development StrictMode)`
    : e2e.exitCode === -1 ? "NOT RUN" : `FAIL — production exit ${e2e.exitCode}; development exit ${devE2e.exitCode}`,
  browserConsoleErrors: browserEvidence.browserConsoleErrors,
  pageErrors: browserEvidence.pageErrors,
  failedRequests: browserEvidence.failedRequests,
  browserEvidence: browserEvidencePresent ? "PRESENT" : "MISSING",
  screenshots: screenshotPaths,
  livingScreenshots: livingScreenshotPaths,
  alwaysOnVoiceScreenshots: alwaysOnScreenshotPaths,
  appleGradeScreenshots: appleScreenshotPaths,
  appleGradeMotionFrames: appleMotionFramePaths,
  eliteScreenshots: eliteScreenshotPaths,
  eliteProductRescueScreenshots: eliteProductRescueScreenshotPaths,
  expectedScreenshots: expectedScreenshots.map((filename) => `artifacts/tide-release/${filename}`),
  expectedLivingScreenshots: expectedLivingScreenshots.map((filename) => `artifacts/living-environment-release/${filename}`),
  expectedAlwaysOnVoiceScreenshots: expectedAlwaysOnScreenshots.map((filename) => `artifacts/always-on-voice-release/${filename}`),
  expectedAppleGradeScreenshots: expectedAppleScreenshots.map((filename) => `artifacts/apple-grade-release/${filename}`),
  expectedAppleGradeMotionFrames: expectedAppleMotionFrames.map((filename) => `artifacts/apple-grade-release/${filename}`),
  expectedEliteScreenshots: expectedEliteScreenshots.map((filename) => `artifacts/elite-release/${filename}`),
  expectedEliteProductRescueScreenshots: expectedEliteProductRescueScreenshots.map((filename) => `artifacts/elite-product-rescue/visual-matrix/${filename}`),
  livingBrowserEvidence: "artifacts/living-environment-release/browser-evidence.json",
  motionStress: { status: motionStressPassed ? "PASS" : "FAIL", path: existsSync(motionStressPath) ? "artifacts/living-environment-release/motion-stress.json" : "MISSING", thresholds: motionThresholds, metrics: motionStress },
  alwaysOnVoiceEvidence: existsSync(alwaysOnBrowserEvidencePath) ? "artifacts/always-on-voice-release/browser-evidence.json" : "MISSING",
  devStrictModeEvidence: existsSync(devBrowserEvidencePath) ? "artifacts/always-on-voice-release/dev-browser-evidence.json" : "MISSING",
  developmentSignatureCoverage: { verdict: devSignaturesPassed ? "PASS" : "FAIL", path: "artifacts/visual-reward-qa/development-signatures.json", signatures: requiredDevSignatures, modes: ["full", "reduced"], expected: 12 },
  nativeRouteEntry: { verdict: routeEntryPassed ? "PASS" : "FAIL", path: "artifacts/route-entry-motion/native-route-entry.json" },
  syntheticVoice: e2ePassed && alwaysOnBrowserEvidence.syntheticVoice === "PASS" && alwaysOnBrowserEvidence.appleJourney === "PASS" && eliteProductRescueJourneyPassed ? "PASS — exact 14-command Apple contract and exact 24-step product-rescue journey each used one persistent activation through the production adapter pipeline" : "NOT VERIFIED",
  appleGradeUtility: e2ePassed && appleBrowserEvidence.utilityJourney === "PASS" ? "PASS — five canonical spaces, embedded Now, contextual edits, routed Capture, three commitment lenses, mobile, and reduced motion" : "NOT VERIFIED",
  appleGradeMotion: e2ePassed && appleBrowserEvidence.motionResidue === "PASS" && allAppleMotionFramesPresent ? `PASS — ${appleMotionFramePaths.length} Tide/Anchor/Bloom frames across three viewport sizes with zero final clone/frame-loop residue` : "NOT VERIFIED",
  eliteNorthStar: e2ePassed && eliteBrowserEvidence.northStar === "PASS" ? "PASS — temporal scene, outfit query, frozen focus proposal, exact acceptance, undo, and reload" : "NOT VERIFIED",
  eliteSyntheticVoice: e2ePassed && eliteBrowserEvidence.syntheticVoice === "PASS" ? "PASS — one final recognition transcript used the shared global transaction pipeline" : "NOT VERIFIED",
  eliteResponsive: e2ePassed && eliteBrowserEvidence.responsive === "PASS" && allEliteScreenshotsPresent ? "PASS — locked desktop, tablet, mobile, and reduced-motion scenes verified" : "NOT VERIFIED",
  eliteAccessibility: e2ePassed && eliteBrowserEvidence.accessibleActions === "PASS" ? "PASS — proposal and clarification controls meet AA contrast, reveal keyboard focus, and Home helpers cannot receive invisible focus" : "NOT VERIFIED",
  eliteWeekProjection: e2ePassed && eliteBrowserEvidence.weekProjection === "PASS" ? "PASS — Today, Focus, Weather, People, and Good to know consume the complete selected week range" : "NOT VERIFIED",
  eliteInstinctNovelty: e2ePassed && eliteBrowserEvidence.instinctDeduplication === "PASS" ? "PASS — Good to know suppresses visible weather telemetry and exposure recency participates in deterministic ranking" : "NOT VERIFIED",
  eliteProductRescue: e2ePassed && eliteProductRescueJourneyPassed ? "PASS — exact 24-step acceptance sequence used one persistent recognition adapter and six durable transactions" : "NOT VERIFIED",
  eliteProductRescueVisualMatrix: e2ePassed && eliteProductRescueMatrixPassed ? `PASS — ${eliteProductRescueScreenshotPaths.length} screenshots cover nineteen world and interaction states at five required viewports` : "NOT VERIFIED",
  eliteProductRescueEvidence: existsSync(eliteProductRescueJourneyPath) ? "artifacts/elite-product-rescue/single-session-evidence.json" : "MISSING",
  eliteProductRescueVisualEvidence: existsSync(eliteProductRescueMatrixPath) ? "artifacts/elite-product-rescue/visual-matrix/matrix.json" : "MISSING",
  acquisitionRecovery: e2ePassed && alwaysOnBrowserEvidence.acquisitionRecovery === "PASS" ? "PASS — acquisition failure exposed Retry; a fresh native recognizer then committed one final exactly once" : "NOT VERIFIED",
  crossTabAcquisition: e2ePassed && alwaysOnBrowserEvidence.crossTabAcquisition === "PASS" ? "PASS — newest explicit Start preempted the prior same-origin tab and the released tab reclaimed after owner close" : "NOT VERIFIED",
  crossTabDocumentIntegrity: e2ePassed && alwaysOnBrowserEvidence.crossTabDocumentIntegrity === "PASS" ? "PASS — reclaimed owner adopted the latest revision, preserved both captures, restored exact two-entry undo/redo history, and retained it after reload" : "NOT VERIFIED",
  crossTabDelayedRelease: e2ePassed && alwaysOnBrowserEvidence.crossTabDelayedRelease === "PASS" ? "PASS — claimant waited for the prior tab's delayed native end signal before constructing its recognizer" : "NOT VERIFIED",
  staleClientReclaim: e2ePassed && alwaysOnBrowserEvidence.staleClientReclaim === "PASS" ? "PASS — an explicit Start automatically reloaded an uncooperative stale same-origin Flow client and acquired voice without manual tab cleanup" : "NOT VERIFIED",
  devStrictModeAcquisition: e2ePassed && devBrowserEvidence.strictModeAcquisition === "PASS" ? "PASS — Vite development runtime survived React StrictMode's effect probe and acquired one recognizer on the first explicit Start" : "NOT VERIFIED",
  physicalMicrophone: physicalMicrophoneStatus({
    e2eExecuted: e2e.exitCode !== -1,
    automatedVoiceVerified,
  }),
  repositoryRevision: existsSync(resolve(projectRoot, ".git")) ? "AVAILABLE IN GIT METADATA" : "UNAVAILABLE — source directory has no .git metadata",
  playwrightHtmlReport: "artifacts/release-qa/playwright-report/index.html",
  playwrightResults: "artifacts/release-qa/playwright-results.json",
  playwrightTraces: "artifacts/release-qa/playwright-results/",
  playwrightDevHtmlReport: "artifacts/release-qa/playwright-dev-report/index.html",
  playwrightDevResults: "artifacts/release-qa/playwright-dev-results.json",
  commands,
  releaseVerdict: releasePassed ? "PASS" : "FAIL",
  timestamp: new Date().toISOString(),
};

const serializedResults = `${JSON.stringify(results, null, 2)}\n`;
writeFileSync(resolve(evidenceDir, "results.json"), serializedResults);
writeFileSync(resolve(tideEvidenceDir, "results.json"), serializedResults);
writeFileSync(resolve(livingEvidenceDir, "results.json"), serializedResults);
writeFileSync(resolve(alwaysOnEvidenceDir, "results.json"), serializedResults);
writeFileSync(resolve(appleEvidenceDir, "results.json"), serializedResults);
writeFileSync(resolve(eliteEvidenceDir, "results.json"), serializedResults);
writeFileSync(resolve(eliteProductRescueEvidenceDir, "results.json"), serializedResults);

if (releasePassed) {
  process.stdout.write("\nFLOW PRODUCT RESCUE RELEASE QA: PASS\nEvidence: artifacts/release-qa/results.json\n");
  process.exit(0);
}

const missing = expectedScreenshots.filter((filename) => !screenshotPaths.includes(`artifacts/tide-release/${filename}`));
const missingLiving = expectedLivingScreenshots.filter((filename) => !livingScreenshotPaths.includes(`artifacts/living-environment-release/${filename}`));
const missingAlwaysOn = expectedAlwaysOnScreenshots.filter((filename) => !alwaysOnScreenshotPaths.includes(`artifacts/always-on-voice-release/${filename}`));
const missingApple = expectedAppleScreenshots.filter((filename) => !appleScreenshotPaths.includes(`artifacts/apple-grade-release/${filename}`));
const missingAppleMotion = expectedAppleMotionFrames.filter((filename) => !appleMotionFramePaths.includes(`artifacts/apple-grade-release/${filename}`));
const missingElite = expectedEliteScreenshots.filter((filename) => !eliteScreenshotPaths.includes(`artifacts/elite-release/${filename}`));
const missingEliteProductRescue = expectedEliteProductRescueScreenshots.filter((filename) => !eliteProductRescueScreenshotPaths.includes(`artifacts/elite-product-rescue/visual-matrix/${filename}`));
process.stderr.write("\nFLOW PRODUCT RESCUE RELEASE QA: FAIL\n");
if (!browserEvidencePresent) process.stderr.write("- Browser evidence file was not produced.\n");
if (!browserClean && browserEvidencePresent) process.stderr.write("- Browser console, page, or request failures were captured.\n");
if (missing.length) process.stderr.write(`- Missing screenshots: ${missing.join(", ")}\n`);
if (missingLiving.length) process.stderr.write(`- Missing living screenshots: ${missingLiving.join(", ")}\n`);
if (missingAlwaysOn.length) process.stderr.write(`- Missing always-on voice screenshots: ${missingAlwaysOn.join(", ")}\n`);
if (missingApple.length) process.stderr.write(`- Missing Apple-grade screenshots: ${missingApple.join(", ")}\n`);
if (missingAppleMotion.length) process.stderr.write(`- Missing Apple motion frames: ${missingAppleMotion.join(", ")}\n`);
if (missingElite.length) process.stderr.write(`- Missing Elite screenshots: ${missingElite.join(", ")}\n`);
if (missingEliteProductRescue.length) process.stderr.write(`- Missing product-rescue screenshots: ${missingEliteProductRescue.join(", ")}\n`);
if (!eliteProductRescueJourneyPassed) process.stderr.write("- Exact 24-step single-session product-rescue journey did not pass.\n");
if (!eliteProductRescueMatrixPassed) process.stderr.write("- Five-viewport product-rescue visual matrix did not pass.\n");
if (alwaysOnBrowserEvidence.syntheticVoice !== "PASS") process.stderr.write("- Dedicated always-on synthetic voice evidence did not pass.\n");
if (alwaysOnBrowserEvidence.appleJourney !== "PASS") process.stderr.write("- Exact one-session Apple voice journey did not pass.\n");
if (appleBrowserEvidence.utilityJourney !== "PASS") process.stderr.write("- Apple-grade canonical space utility journey did not pass.\n");
if (appleBrowserEvidence.motionResidue !== "PASS") process.stderr.write("- Apple-grade motion residue gate did not pass.\n");
if (eliteBrowserEvidence.northStar !== "PASS") process.stderr.write("- Elite north-star journey did not pass.\n");
if (eliteBrowserEvidence.syntheticVoice !== "PASS") process.stderr.write("- Elite final-recognition pipeline did not pass.\n");
if (eliteBrowserEvidence.responsive !== "PASS") process.stderr.write("- Elite responsive/reduced-motion gate did not pass.\n");
if (eliteBrowserEvidence.accessibleActions !== "PASS") process.stderr.write("- Elite action contrast and keyboard-focus gate did not pass.\n");
if (eliteBrowserEvidence.weekProjection !== "PASS") process.stderr.write("- Elite complete-week projection gate did not pass.\n");
if (eliteBrowserEvidence.instinctDeduplication !== "PASS") process.stderr.write("- Elite instinct deduplication/novelty gate did not pass.\n");
if (alwaysOnBrowserEvidence.acquisitionRecovery !== "PASS") process.stderr.write("- Dedicated microphone acquisition recovery evidence did not pass.\n");
if (alwaysOnBrowserEvidence.crossTabAcquisition !== "PASS") process.stderr.write("- Dedicated cross-tab Flow Live acquisition evidence did not pass.\n");
if (alwaysOnBrowserEvidence.crossTabDocumentIntegrity !== "PASS") process.stderr.write("- Dedicated cross-tab document/history integrity evidence did not pass.\n");
if (alwaysOnBrowserEvidence.crossTabDelayedRelease !== "PASS") process.stderr.write("- Dedicated delayed native-release ownership evidence did not pass.\n");
if (alwaysOnBrowserEvidence.staleClientReclaim !== "PASS") process.stderr.write("- Dedicated uncooperative stale-client reclamation evidence did not pass.\n");
if (devBrowserEvidence.strictModeAcquisition !== "PASS") process.stderr.write("- Dedicated development StrictMode acquisition evidence did not pass.\n");
if (!devSignaturesPassed) process.stderr.write("- All six actual development StrictMode signatures must pass full/reduced interruption and cleanup.\n");
if (!routeEntryPassed) process.stderr.write("- Native Home to Today intermediate text/geometry evidence did not pass.\n");
if (!motionStressPassed) process.stderr.write("- Motion stress evidence is missing or exceeds a release threshold.\n");
if (visualRewardResults.verdict !== "PASS") process.stderr.write("- Visual reward motion QA, 144-frame inspection, performance audit, or portfolio recording did not pass.\n");
process.stderr.write("Inspect artifacts/release-qa/results.json and the Playwright report.\n");
process.exit(1);
