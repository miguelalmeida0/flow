import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

// Evidence inventory only. This never changes a result, retries a test, or
// substitutes an older screenshot for missing current-run evidence.
const root = "artifacts/locked-voice-home";
const read = (file) => readFileSync(file, "utf8");
const hash = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const files = (directory) => readdirSync(directory).sort().flatMap((name) => {
  const file = path.join(directory, name);
  return statSync(file).isDirectory() ? files(file) : [file];
});
const report = JSON.parse(read(`${root}/playwright-results.json`));
const cases = [];
function visit(suite, output = cases) {
  for (const spec of suite.specs ?? []) for (const test of spec.tests) output.push({
    title: spec.title,
    expectedStatus: test.expectedStatus,
    status: test.status,
    results: test.results.map((result) => ({
      status: result.status, durationMs: result.duration,
      errors: (result.errors ?? []).map((error) => error.message),
    })),
  });
  for (const child of suite.suites ?? []) visit(child, output);
}
visit(report);
const browserLog = read("artifacts/locked-home-frozen-browser.log");
const records = (prefix, log = browserLog) => log.split("\n").flatMap((line) => {
  const start = line.indexOf(`${prefix} `);
  if (start < 0) return [];
  try { return [JSON.parse(line.slice(start + prefix.length + 1))]; } catch { return []; }
});
const names = [
  "01-wake-armed.png", "02-wake-reward.png", "02-preparing-overlap.png", "02-active-home.png",
  "03-journal-atmosphere-compound.png", "04-calendar-morph.png", "04-calendar-return-continuity.png",
  "04-target-pulse-intermediate.png", "04-calendar-continuity-intermediate.png", "05-calendar-voice-undo.png",
  "06-atmosphere-reference-followup.png", "07-reduced-motion-calendar.png",
];
const screenshots = names.map((name) => {
  const file = `${root}/${name}`;
  if (!existsSync(file)) return { file, missing: true };
  const bytes = readFileSync(file);
  return { file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: hash(file), modifiedAt: statSync(file).mtime.toISOString() };
});
const supplementRoot = "artifacts/locked-home-observer-supplement";
const supplementReport = existsSync(`${supplementRoot}/playwright-results.json`)
  ? JSON.parse(read(`${supplementRoot}/playwright-results.json`)) : undefined;
const supplementLog = read("artifacts/locked-home-observer-supplement.log");
const supplementImages = names.flatMap((name) => {
  const file = `${supplementRoot}/${name}`;
  if (!existsSync(file)) return [];
  const bytes = readFileSync(file);
  return [{ file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: hash(file), modifiedAt: statSync(file).mtime.toISOString() }];
});
const repairRoot = "artifacts/locked-home-independent-repair";
const repairReport = existsSync(`${repairRoot}/playwright-results.json`) ? JSON.parse(read(`${repairRoot}/playwright-results.json`)) : undefined;
const repairLog = existsSync("artifacts/locked-home-independent-repair.log") ? read("artifacts/locked-home-independent-repair.log") : "";
const repairCases = [];
if (repairReport) visit(repairReport, repairCases);
const repairImages = ["03-journal-atmosphere-compound.png", "08-near-term-home.png", "09-narrow-home-reload.png"].flatMap((name) => {
  const file = `${repairRoot}/${name}`;
  if (!existsSync(file)) return [];
  const bytes = readFileSync(file);
  return [{ file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: hash(file), modifiedAt: statSync(file).mtime.toISOString() }];
});
const typedRoot = "artifacts/locked-home-independent-typed-proof";
const typedReport = existsSync(`${typedRoot}/playwright-results.json`) ? JSON.parse(read(`${typedRoot}/playwright-results.json`)) : undefined;
const typedLog = existsSync("artifacts/locked-home-independent-typed-proof.log") ? read("artifacts/locked-home-independent-typed-proof.log") : "";
const typedCases = [];
if (typedReport) visit(typedReport, typedCases);
const typedImages = ["08-near-term-home.png", "09-narrow-home-reload.png"].flatMap((name) => {
  const file = `${typedRoot}/${name}`;
  if (!existsSync(file)) return [];
  const bytes = readFileSync(file);
  return [{ file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: hash(file), modifiedAt: statSync(file).mtime.toISOString() }];
});
const responsiveRoot = "artifacts/locked-home-responsive-proof";
const responsiveReport = existsSync(`${responsiveRoot}/playwright-results.json`) ? JSON.parse(read(`${responsiveRoot}/playwright-results.json`)) : undefined;
const responsiveLog = existsSync("artifacts/locked-home-responsive-proof.log") ? read("artifacts/locked-home-responsive-proof.log") : "";
const responsiveCases = [];
if (responsiveReport) visit(responsiveReport, responsiveCases);
const responsiveImages = ["08-near-term-home.png", "09-narrow-home-reload.png"].flatMap((name) => {
  const file = `${responsiveRoot}/${name}`;
  if (!existsSync(file)) return [];
  const bytes = readFileSync(file);
  return [{ file, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), sha256: hash(file), modifiedAt: statSync(file).mtime.toISOString() }];
});
const errors = records("LOCKED_BROWSER_RESULT");
const targetTiming = records("LOCKED_TARGET_TIMING");
const targetRaw = records("LOCKED_TARGET_RAW_TIMELINE");
const endToEndTiming = targetTiming.map((timing, index) => {
  // Prior to semantic publication, this native sampler defines elapsed from
  // transcript emit. Do not infer delivery time from a post-publication frame.
  const frame = targetRaw[index]?.firstSamples.find((sample) => sample.at < timing.targetAcknowledgedAt);
  if (!frame) return { unavailable: "No pre-publication native frame; do not substitute publication time for transcript delivery" };
  const deliveredAt = frame.at - frame.elapsed;
  return {
    transcriptDeliveredAt: deliveredAt,
    provenance: "native browser sampler: pre-publication frame at minus its emission-relative elapsed",
    transcriptToSemanticPublicationMs: timing.targetAcknowledgedAt - deliveredAt,
    publicationToPaintMs: timing.targetPaintedAt - timing.targetAcknowledgedAt,
    transcriptToPaintMs: timing.targetPaintedAt - deliveredAt,
    transcriptToExecutionMs: timing.executionStartedAt - deliveredAt,
    transcriptToFirstObservedCardMovementMs: timing.targetAcknowledgedAt + targetRaw[index].worldStartedAt - deliveredAt,
  };
});
const screenshotsComplete = screenshots.every((image) => !image.missing && image.width === 1440 && image.height === 1000);
const browserPassed = cases.length === 7 && cases.every((test) => test.status === "expected" && test.results.every((result) => result.status === "passed"));
const errorsEmpty = errors.length === 7 && errors.every((test) => Object.values(test.errors).every((list) => list.length === 0));
const manifest = {
  generatedAt: new Date().toISOString(),
  verdict: browserPassed && errorsEmpty && screenshotsComplete ? "AWAITING INDEPENDENT QA" : "FAIL",
  sourceGate: {
    command: "npm run check", exitCode: 2, log: "artifacts/locked-home-final-source-check.log", sha256: hash("artifacts/locked-home-final-source-check.log"),
    result: "Lint and 48/48 files, 1139/1139 tests passed; TypeScript stopped on a test-only unchecked-index annotation, subsequently corrected",
    supplement: { result: "Touched-file ESLint,13/13 focused tests, strict TypeScript and production build passed after the test annotation and phase-based surface initialization correction", testLog: "artifacts/locked-home-final-presentation-supplement.log", buildLog: "artifacts/locked-home-final-build.log", testLogSha256: hash("artifacts/locked-home-final-presentation-supplement.log"), buildLogSha256: hash("artifacts/locked-home-final-build.log") },
    finalObserverSupplement: { result: "Touched-file ESLint, 17/17 tests in 3 files, strict TypeScript and production build passed after the observed late-pulse fix", testLog: "artifacts/locked-home-late-pulse-fixed.log", buildLog: "artifacts/locked-home-late-pulse-build.log", testLogSha256: hash("artifacts/locked-home-late-pulse-fixed.log"), buildLogSha256: hash("artifacts/locked-home-late-pulse-build.log"), reproductionLog: "artifacts/locked-home-late-pulse-reproduction.log", reproductionResult: "RED: 1 failed, 4 passed before the production correction" },
  },
  browser: { command: "matched Playwright 1.62.1 Docker production-preview, Chromium, one worker, seven scenarios, no retries", report: `${root}/playwright-results.json`, stats: report.stats, cases, errors },
  sourceAttribution: "The seven-scenario report predates the late-pulse DOM observer correction. The observer supplement predates the independent preview/compound projection fixes. The independent-repair voice compound and corrected typed-proof runs share those projection fixes; only the latter used the corrected Ctrl+K helper. Their production build predates the compact Home perch correction. Current production/build hashes match the responsive-proof run. Earlier failures remain separate, not retroactively passed, and no supplement replaces the full performance gate.",
  observerBrowserSupplement: {
    report: `${supplementRoot}/playwright-results.json`, reportSha256: hash(`${supplementRoot}/playwright-results.json`),
    stats: supplementReport?.stats, errors: records("LOCKED_BROWSER_RESULT", supplementLog),
    wakeTiming: records("LOCKED_WAKE_TIMING", supplementLog), wakeChoreography: records("LOCKED_WAKE_CHOREOGRAPHY", supplementLog),
    screenshots: supplementImages, replacesFullGate: false,
    result: "Calendar move/Undo passed; wake failed its original <100 ms and six-independent-interval requirements. All five supplemental screenshots captured. No retries.",
  },
  independentRepairSupplement: {
    sourceGate: { result: "Touched-file ESLint, 41/41 tests in four files, strict TypeScript and production build passed", redLog: "artifacts/locked-home-independent-findings-red.log", redResult: "2 failed, 11 passed before the projection corrections", greenLog: "artifacts/locked-home-independent-findings-final-tests.log", buildLog: "artifacts/locked-home-independent-findings-build.log", greenLogSha256: hash("artifacts/locked-home-independent-findings-final-tests.log"), buildLogSha256: hash("artifacts/locked-home-independent-findings-build.log") },
    report: `${repairRoot}/playwright-results.json`, reportSha256: repairReport ? hash(`${repairRoot}/playwright-results.json`) : undefined, log: "artifacts/locked-home-independent-repair.log", logSha256: hash("artifacts/locked-home-independent-repair.log"),
    stats: repairReport?.stats, cases: repairCases, errors: records("LOCKED_BROWSER_RESULT", repairLog),
    compoundAcknowledgement: records("LOCKED_COMPOUND_ACK", repairLog), typedReload: records("LOCKED_TYPED_RELOAD", repairLog),
    screenshots: repairImages, replacesFullGate: false,
    clock: "Date-only domain fixtures; native timers, rAF, performance.now and WAAPI unmodified",
  },
  correctedTypedSupplement: {
    report: `${typedRoot}/playwright-results.json`, reportSha256: typedReport ? hash(`${typedRoot}/playwright-results.json`) : undefined, log: "artifacts/locked-home-independent-typed-proof.log", logSha256: hash("artifacts/locked-home-independent-typed-proof.log"),
    stats: typedReport?.stats, cases: typedCases, errors: records("LOCKED_BROWSER_RESULT", typedLog), typedReload: records("LOCKED_TYPED_RELOAD", typedLog), screenshots: typedImages,
    correction: "Test-only focus/open correction: actual Control+K keyboard shortcut before fill/Enter prevents the unfocused auto-recede visibility-probe race. No production source changed; touched-file ESLint and strict TypeScript passed after the helper correction.",
    replacesFullGate: false,
  },
  responsiveSupplement: {
    sourceGate: { result: "Touched-file ESLint, 10/10 tests in two files, strict TypeScript and build PASS; 678 modules in 3.37 s", testLog: "artifacts/locked-home-responsive-tests.log", buildLog: "artifacts/locked-home-responsive-build.log", testLogSha256: hash("artifacts/locked-home-responsive-tests.log"), buildLogSha256: hash("artifacts/locked-home-responsive-build.log") },
    report: `${responsiveRoot}/playwright-results.json`, reportSha256: responsiveReport ? hash(`${responsiveRoot}/playwright-results.json`) : undefined, log: "artifacts/locked-home-responsive-proof.log", logSha256: hash("artifacts/locked-home-responsive-proof.log"),
    stats: responsiveReport?.stats, cases: responsiveCases, errors: records("LOCKED_BROWSER_RESULT", responsiveLog), typedReload: records("LOCKED_TYPED_RELOAD", responsiveLog), geometry: records("LOCKED_HOME_READABILITY", responsiveLog), screenshots: responsiveImages,
    correction: "The prior 390px screenshot showed mascot/heading/transcript overlap despite no horizontal overflow. A compact breakpoint moves the same Motion-owned character to a reserved centered perch; desktop placement is unchanged. Current assertions check every pair of mascot, heading, transcript and dock rectangles at 1440×1000 and 390×844.",
    replacesFullGate: false,
  },
  performanceAssertions: "Original ceilings retained as soft failures: wake <100 ms; target response ≤140 ms; target dwell ≤320 ms. Any failure still fails the test and release.",
  wakeTiming: records("LOCKED_WAKE_TIMING"),
  wakeChoreography: records("LOCKED_WAKE_CHOREOGRAPHY"),
  targetTiming, endToEndTiming,
  targetStaging: records("LOCKED_TARGET_STAGING"),
  screenshotsComplete, screenshots,
  visualReview: { result: "See current assessment in docs/quality/design-qa.md; no portfolio-ready motion PASS", directlyReviewedOriginalRunPngs: 7, directlyReviewedSupplementPngs: 5, directlyReviewedIndependentRepairPngs: 2, directlyReviewedTypedProofPngs: 2, directlyReviewedResponsivePngs: 2, uniqueNamedStatesAcrossOriginalAndObserverRuns: 12, note: "The original twelve PNGs across separate runs were directly reviewed at 1440×1000. The two intermediate names captured settled frames; motion proof comes only from native geometry. Nine unmodified wake JPEGs were additionally reviewed for contrast. The typed-proof narrow PNG revealed overlap, preserved as a visual failure rather than inferred green from overflow assertions. Responsive narrow PNG now has unobstructed mascot/heading/transcript/dock; responsive desktop PNG caught a phase-heading opacity fade and is not represented as settled readability proof." },
  hostObservation: "At 16:10 local, host load was 42.22/38.85/37.89 and several unrelated containers consumed substantial CPU. This is a measured confounder, not proof that it solely caused performance failures. No unrelated workloads were stopped.",
  physicalMicrophone: "NOT RUN", audibleAutoplay: "NOT RUN", independentQa: "FAIL on prior candidate; corrected candidate awaiting independent reassessment",
  preservedFailures: ["artifacts/locked-voice-home-final-attempt-1", "artifacts/locked-home-liveness-results.json", "artifacts/locked-voice-home-before-sampler-correction", "artifacts/locked-voice-home-before-contrast-and-callback"],
  sourceHashes: Object.fromEntries([...files("src"), ...files("e2e"), "package.json", "package-lock.json", "playwright.config.ts"].filter(existsSync).map((file) => [file, hash(file)])),
  builtAssetHashes: Object.fromEntries(files("dist").map((file) => [file, hash(file)])),
};
writeFileSync(`${root}/verification.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ verdict: manifest.verdict, cases: cases.length, stats: report.stats, screenshotsComplete, errorsEmpty }, null, 2));
