import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { CANONICAL_MOTION_EVIDENCE_DIR, resetCanonicalMotionEvidence } from "./motion-evidence-scope.mjs";

const root = process.cwd();
const evidence = resolve(root, CANONICAL_MOTION_EVIDENCE_DIR);
const playwright = resolve(root, "node_modules/.bin/playwright");

function run() {
  return new Promise((done) => {
    const child = spawn(playwright, ["test", "--config=playwright.motion.config.ts"], {
      cwd: root,
      env: {
        ...process.env,
        FLOW_MOTION_QA: "1",
        FLOW_MOTION_EVIDENCE_OWNER: "qa:motion",
        FLOW_MOTION_EVIDENCE_DIR: CANONICAL_MOTION_EVIDENCE_DIR,
        TMPDIR: resolve(root, "node_modules/.tmp"),
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(root, "node_modules/.cache/ms-playwright"),
      },
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";
    const collect = (chunk, stream) => { const text = chunk.toString(); output += text; stream.write(text); };
    child.stdout.on("data", (chunk) => collect(chunk, process.stdout));
    child.stderr.on("data", (chunk) => collect(chunk, process.stderr));
    child.on("close", (code) => done({ code: code ?? 1, output: output.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "") }));
  });
}

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const target = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  });
}

resetCanonicalMotionEvidence(root);
const execution = await run();
writeFileSync(resolve(evidence, "qa-motion.log"), execution.output);

const manifest = readJson(resolve(evidence, "frame-manifest.json"), { frames: [], inspected: [] });
const timing = readJson(resolve(evidence, "frame-timing.json"), { samples: [] });
const compositor = readJson(resolve(evidence, "compositor-provenance.json"), { sequences: [] });
const metrics = readJson(resolve(evidence, "motion-metrics.json"), { verdict: "MISSING" });
const signatureStress = readJson(resolve(evidence, "signature-stress.json"), { verdict: "MISSING" });
const browser = readJson(resolve(evidence, "browser-evidence.json"), { consoleErrors: ["MISSING"], pageErrors: [], failedRequests: [] });
const playwrightResults = readJson(resolve(evidence, "playwright-results.json"), {});
const framesPresent = Array.isArray(manifest.frames) && manifest.frames.length === 144
  && manifest.frames.every((path) => existsSync(resolve(root, path)));
const framesInspected = Array.isArray(manifest.inspected) && manifest.inspected.length === 144
  && manifest.inspected.every((path) => manifest.frames.includes(path));
const frameTimingComplete = Array.isArray(timing.samples) && timing.samples.length === 144
  && timing.samples.every((sample) => manifest.frames.includes(sample.path)
    && (sample.requestedPercentage === 0
      ? sample.phase === "before-trigger" && sample.startedAt === null && sample.animations.length === 0 && sample.nativeAfterMs >= sample.nativeBeforeMs
      : sample.requestedPercentage === 100
        ? sample.phase === "settled" && Number.isFinite(sample.startedAt) && sample.animations.length === 0 && sample.nativeAfterMs >= sample.nativeBeforeMs
        : Number.isFinite(sample.startedAt) && Number.isFinite(sample.captureNativeMs) && Number.isFinite(sample.receivedNativeMs)
          && sample.receivedNativeMs >= sample.captureNativeMs && Number.isFinite(sample.compositorTimestamp)
          && typeof sample.semanticPixelDigest === "string" && sample.semanticPixelDigest.length === 64));
const nativeCoverage = Array.isArray(compositor.sequences) && compositor.sequences.length === 24
  && new Set(compositor.sequences.map(({ sequence, viewport }) => `${sequence}/${viewport}`)).size === 24
  && compositor.sequences.every((sequence) => {
    const samples = timing.samples.filter((sample) => sample.sequence === sequence.sequence && sample.viewport === sequence.viewport && sample.requestedPercentage > 0 && sample.requestedPercentage < 100);
    const tolerance = sequence.durationMs <= 200 ? 25 : 60;
    return samples.length === 4 && [20, 40, 60, 80].every((percentage) => samples.some((sample) => sample.requestedPercentage === percentage))
      && sequence.durationMs === (sequence.sequence === "time-travel" ? 480 : sequence.sequence === "capture-to-outcome" ? 1220 : 1120)
      && new Set(samples.map((sample) => sample.captureNativeMs)).size === 4
      && new Set(samples.map((sample) => sample.semanticPixelDigest)).size === 4
      && sequence.rawFrameCount >= 4
      && Array.isArray(sequence.semanticPixelDigests) && new Set(sequence.semanticPixelDigests).size === 4
      && sequence.toleranceMs === tolerance
      && samples.every((sample) => sample.captureMethod === "CDP Page.screencastFrame metadata-timestamped PNG"
        && sample.timingToleranceMs === tolerance && Number.isFinite(sample.auditNativeMs)
        && Number.isFinite(sample.auditOffsetMs)
        && Number.isFinite(sample.auditCompletedAt) && sample.auditCompletedAt >= sample.auditNativeMs
        && sample.auditCompletedAt - sample.auditNativeMs <= tolerance
        && Math.abs(sample.auditOffsetMs) <= tolerance
        && sample.auditRelationship === "nearest native rAF DOM/WAAPI audit paired with the metadata-timestamped compositor PNG"
        && sample.startedAt === sequence.startedAt && sample.requestedMs === Math.round(sequence.durationMs * sample.requestedPercentage / 100)
        && Math.abs(sample.compositorTimestamp * 1_000 - sample.rendererTimeOriginMs - sample.captureNativeMs) < 0.25
        && Math.abs(sample.actualElapsedCaptureMs - sample.requestedMs) <= tolerance
        && sequence.frames.some((frame) => frame.checkpoint === sample.requestedPercentage && frame.captureNativeMs === sample.captureNativeMs && frame.metadataTimestamp === sample.compositorTimestamp))
      && timing.samples.some((sample) => sample.sequence === sequence.sequence && sample.viewport === sequence.viewport && sample.requestedPercentage === 100 && sample.actualElapsedBeforeMs >= sequence.durationMs);
  });
const browserClean = browser.consoleErrors?.length === 0 && browser.pageErrors?.length === 0 && browser.failedRequests?.length === 0;
const recordingPath = resolve(evidence, "portfolio-demo.webm");
const recording = existsSync(recordingPath) && statSync(recordingPath).size > 0;
const traceFiles = filesUnder(resolve(evidence, "playwright-results")).filter((path) => path.endsWith("trace.zip"));
const report = existsSync(resolve(evidence, "playwright-report/index.html"));
const rawPngFiles = filesUnder(evidence).filter((path) => path.endsWith(".png")).map((path) => path.slice(root.length + 1));
const canonicalFrameSet = new Set(manifest.frames ?? []);
const nonCanonicalPngs = rawPngFiles.filter((path) => !canonicalFrameSet.has(path));
const signaturesComplete = signatureStress.verdict === "PASS"
  && signatureStress.expectedRunsPerSignature === 20
  && Array.isArray(signatureStress.expectedSignatures)
  && signatureStress.expectedSignatures.length === 6
  && signatureStress.expectedSignatures.every((id) => signatureStress.results?.[id]?.runs === 20);
const passed = execution.code === 0 && framesPresent && framesInspected && frameTimingComplete && nativeCoverage && metrics.verdict === "PASS" && signaturesComplete && browserClean && recording && traceFiles.length > 0 && report;

const results = {
  verdict: passed ? "PASS" : "FAIL",
  command: "npm run qa:motion",
  playwrightExitCode: execution.code,
  playwrightTests: Number(playwrightResults.stats?.expected ?? 0),
  visualFrames: { expected: 144, actual: manifest.frames?.length ?? 0, inspected: manifest.inspected?.length ?? 0, canonicalPngs: rawPngFiles.length - nonCanonicalPngs.length, nonCanonicalQaPngs: nonCanonicalPngs.length, status: framesPresent && framesInspected ? "PASS" : "FAIL" },
  frameTiming: frameTimingComplete && nativeCoverage ? "PASS — 96 distinct metadata-timestamped Page.screencastFrame PNGs within fixed ±25/60 ms timing bounds, paired native audits, and product-pixel progression; before-trigger 0% and fully settled 100%" : "FAIL",
  compositorProvenance: nativeCoverage ? "artifacts/visual-reward-qa/compositor-provenance.json" : "FAIL",
  performance: metrics,
  signatureStress: signaturesComplete ? "PASS — six signatures × 20 runs across full/reduced and normal/4× CPU" : "FAIL",
  auditTool: "Flow local PerformanceObserver + Chrome DevTools DOM counters (MotionScore unavailable; no MotionScore output fabricated)",
  browser,
  recording: recording ? "artifacts/visual-reward-qa/portfolio-demo.webm" : "MISSING",
  traces: traceFiles.length ? `artifacts/visual-reward-qa/playwright-results/ (${traceFiles.length} trace archives)` : "MISSING",
  report: report ? "artifacts/visual-reward-qa/playwright-report/index.html" : "MISSING",
  generatedAt: new Date().toISOString(),
};
writeFileSync(resolve(evidence, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
if (!passed) {
  process.stderr.write("\nFLOW VISUAL REWARD MOTION QA: FAIL\nInspect artifacts/visual-reward-qa/results.json\n");
  process.exit(1);
}
process.stdout.write("\nFLOW VISUAL REWARD MOTION QA: PASS\nEvidence: artifacts/visual-reward-qa/results.json\n");
