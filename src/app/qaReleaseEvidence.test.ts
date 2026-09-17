import { spawnSync } from "node:child_process";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cwd, env as parentEnvironment, execPath } from "node:process";
import { afterEach, describe, expect, it } from "vitest";
import {
  physicalMicrophoneStatus,
  removeStaleVoiceBrowserResults,
  voiceBrowserResultsPath,
} from "../../scripts/qa-release-evidence.mjs";
import {
  CANONICAL_DEVELOPMENT_BROWSER_EVIDENCE_DIR,
  CANONICAL_DEVELOPMENT_OUTPUT_DIR,
  CANONICAL_DEVELOPMENT_REPORT_DIR,
  CANONICAL_DEVELOPMENT_RESULTS_FILE,
  CANONICAL_MOTION_EVIDENCE_DIR,
  resetCanonicalMotionEvidence,
  selectDevelopmentEvidenceLocations,
  selectMotionEvidenceDirectory,
} from "../../scripts/motion-evidence-scope.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("release evidence integrity", () => {
  it("removes stale voice browser results before a new release attempt", () => {
    const root = mkdtempSync(join(tmpdir(), "flow-release-evidence-"));
    temporaryDirectories.push(root);
    const stalePath = voiceBrowserResultsPath(root);
    mkdirSync(join(root, "artifacts/voice-intelligence/browser"), { recursive: true });
    writeFileSync(stalePath, '{"releaseVerdict":"PASS"}\n');

    expect(removeStaleVoiceBrowserResults(root)).toBe(true);
    expect(existsSync(stalePath)).toBe(false);
    expect(removeStaleVoiceBrowserResults(root)).toBe(false);
  });

  it("claims automated voice proof only after its browser gates pass", () => {
    expect(physicalMicrophoneStatus({ e2eExecuted: false, automatedVoiceVerified: false })).toContain("were not run");
    expect(physicalMicrophoneStatus({ e2eExecuted: true, automatedVoiceVerified: false })).toContain("did not pass");
    expect(physicalMicrophoneStatus({ e2eExecuted: true, automatedVoiceVerified: true })).toContain("automated Chromium verified");
  });

  it("isolates focused motion evidence and reserves canonical artifacts for release owners", () => {
    const direct = selectMotionEvidenceDirectory({ projectRoot: "/flow", environment: {}, now: 1234, processId: 17 });
    expect(direct).toMatchObject({
      relativePath: "artifacts/visual-reward-debug/run-1234-17",
      canonical: false,
      owner: "focused/debug",
    });
    expect(() => selectMotionEvidenceDirectory({
      projectRoot: "/flow", environment: { FLOW_MOTION_EVIDENCE_DIR: CANONICAL_MOTION_EVIDENCE_DIR },
    })).toThrow(/reserved for npm run qa:motion and npm run qa:release/);
    expect(selectMotionEvidenceDirectory({
      projectRoot: "/flow",
      environment: { FLOW_MOTION_EVIDENCE_OWNER: "qa:motion", FLOW_MOTION_EVIDENCE_DIR: CANONICAL_MOTION_EVIDENCE_DIR },
    })).toMatchObject({ relativePath: CANONICAL_MOTION_EVIDENCE_DIR, canonical: true, owner: "qa:motion" });
    expect(() => selectMotionEvidenceDirectory({
      projectRoot: "/flow", environment: { FLOW_MOTION_EVIDENCE_DIR: "artifacts/somewhere-else" },
    })).toThrow(/must stay under artifacts\/visual-reward-debug/);
  });

  it("derives every development-browser artifact from the same explicit run owner", () => {
    const directMotion = selectMotionEvidenceDirectory({
      projectRoot: "/flow", environment: {}, now: 1234, processId: 17,
    });
    expect(selectDevelopmentEvidenceLocations(directMotion)).toEqual({
      reportDirectory: "artifacts/visual-reward-debug/run-1234-17/development/playwright-report",
      resultsFile: "artifacts/visual-reward-debug/run-1234-17/development/playwright-results.json",
      outputDirectory: "artifacts/visual-reward-debug/run-1234-17/development/playwright-test-results",
      browserEvidenceDirectory: "artifacts/visual-reward-debug/run-1234-17/development/browser-evidence",
      canonical: false,
      owner: "focused/debug",
    });

    const releaseMotion = selectMotionEvidenceDirectory({
      projectRoot: "/flow",
      environment: {
        FLOW_MOTION_EVIDENCE_OWNER: "qa:release",
        FLOW_MOTION_EVIDENCE_DIR: CANONICAL_MOTION_EVIDENCE_DIR,
      },
    });
    expect(selectDevelopmentEvidenceLocations(releaseMotion)).toEqual({
      reportDirectory: CANONICAL_DEVELOPMENT_REPORT_DIR,
      resultsFile: CANONICAL_DEVELOPMENT_RESULTS_FILE,
      outputDirectory: CANONICAL_DEVELOPMENT_OUTPUT_DIR,
      browserEvidenceDirectory: CANONICAL_DEVELOPMENT_BROWSER_EVIDENCE_DIR,
      canonical: true,
      owner: "qa:release",
    });

    const motionOwner = selectMotionEvidenceDirectory({
      projectRoot: "/flow",
      environment: {
        FLOW_MOTION_EVIDENCE_OWNER: "qa:motion",
        FLOW_MOTION_EVIDENCE_DIR: CANONICAL_MOTION_EVIDENCE_DIR,
      },
    });
    expect(() => selectDevelopmentEvidenceLocations(motionOwner)).toThrow(
      /Only qa:release may write canonical development-browser evidence/,
    );
  });

  it("keeps canonical development reports untouched during a direct Playwright list", { timeout: 20_000 }, () => {
    const projectRoot = cwd();
    const debugRun = `artifacts/visual-reward-debug/dev-list-${Date.now()}`;
    const debugRunAbsolute = resolve(projectRoot, debugRun);
    temporaryDirectories.push(debugRunAbsolute);

    const canonicalPaths = [
      CANONICAL_DEVELOPMENT_RESULTS_FILE,
      `${CANONICAL_DEVELOPMENT_REPORT_DIR}/index.html`,
      `${CANONICAL_DEVELOPMENT_BROWSER_EVIDENCE_DIR}/dev-browser-evidence.json`,
    ].map((path) => resolve(projectRoot, path));
    const snapshot = (path: string) => existsSync(path)
      ? { exists: true as const, contents: readFileSync(path, "utf8"), mtimeMs: statSync(path).mtimeMs }
      : { exists: false as const };
    const before = canonicalPaths.map(snapshot);
    const environment: Record<string, string | undefined> = {
      ...parentEnvironment,
      FLOW_MOTION_EVIDENCE_DIR: debugRun,
    };
    delete environment.FLOW_MOTION_EVIDENCE_OWNER;

    const listed = spawnSync(execPath, [
      resolve(projectRoot, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config=playwright.dev.config.ts",
      "--list",
    ], { cwd: projectRoot, env: environment, encoding: "utf8" });

    expect(listed.error).toBeUndefined();
    expect(listed.status, `${listed.stdout}\n${listed.stderr}`).toBe(0);
    expect(canonicalPaths.map(snapshot)).toEqual(before);
    expect(existsSync(resolve(debugRunAbsolute, "development/playwright-results.json"))).toBe(true);
    expect(existsSync(resolve(debugRunAbsolute, "development/playwright-report/index.html"))).toBe(true);
  });

  it("atomically replaces stale canonical motion evidence with an empty run directory", () => {
    const root = mkdtempSync(join(tmpdir(), "flow-motion-evidence-"));
    temporaryDirectories.push(root);
    const canonical = join(root, CANONICAL_MOTION_EVIDENCE_DIR);
    mkdirSync(canonical, { recursive: true });
    const stale = join(canonical, "results.json");
    writeFileSync(stale, '{"verdict":"PASS"}\n');

    expect(resetCanonicalMotionEvidence(root, { now: 1234, processId: 17 })).toBe(canonical);
    expect(existsSync(canonical)).toBe(true);
    expect(existsSync(stale)).toBe(false);
  });
});
