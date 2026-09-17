import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

export const CANONICAL_MOTION_EVIDENCE_DIR = "artifacts/visual-reward-qa";
export const DEBUG_MOTION_EVIDENCE_ROOT = "artifacts/visual-reward-debug";
export const CANONICAL_DEVELOPMENT_REPORT_DIR = "artifacts/release-qa/playwright-dev-report";
export const CANONICAL_DEVELOPMENT_RESULTS_FILE = "artifacts/release-qa/playwright-dev-results.json";
export const CANONICAL_DEVELOPMENT_OUTPUT_DIR = "artifacts/release-qa/playwright-dev-test-results";
export const CANONICAL_DEVELOPMENT_BROWSER_EVIDENCE_DIR = "artifacts/always-on-voice-release";
const canonicalOwners = new Set(["qa:motion", "qa:release"]);

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !path.startsWith("/"));
}

/** Resolve one run's evidence destination. The canonical directory is a
 * release-run capability, not a default. Direct Playwright invocations always
 * receive an isolated debug directory. */
export function selectMotionEvidenceDirectory({
  projectRoot = process.cwd(),
  environment = process.env,
  now = Date.now(),
  processId = process.pid,
} = {}) {
  const canonicalAbsolute = resolve(projectRoot, CANONICAL_MOTION_EVIDENCE_DIR);
  const requested = environment.FLOW_MOTION_EVIDENCE_DIR;
  const owner = environment.FLOW_MOTION_EVIDENCE_OWNER;
  if (owner !== undefined) {
    if (!canonicalOwners.has(owner)) throw new Error(`Unknown canonical motion evidence owner: ${owner}`);
    if (requested && resolve(projectRoot, requested) !== canonicalAbsolute) {
      throw new Error(`${owner} must write motion evidence to ${CANONICAL_MOTION_EVIDENCE_DIR}`);
    }
    return { relativePath: CANONICAL_MOTION_EVIDENCE_DIR, absolutePath: canonicalAbsolute, canonical: true, owner };
  }

  if (requested && resolve(projectRoot, requested) === canonicalAbsolute) {
    throw new Error(`${CANONICAL_MOTION_EVIDENCE_DIR} is reserved for npm run qa:motion and npm run qa:release`);
  }
  const relativePath = requested ?? `${DEBUG_MOTION_EVIDENCE_ROOT}/run-${now}-${processId}`;
  const absolutePath = resolve(projectRoot, relativePath);
  const debugAbsolute = resolve(projectRoot, DEBUG_MOTION_EVIDENCE_ROOT);
  if (!isInside(debugAbsolute, absolutePath)) {
    throw new Error(`Focused motion evidence must stay under ${DEBUG_MOTION_EVIDENCE_ROOT}`);
  }
  return { relativePath, absolutePath, canonical: false, owner: "focused/debug" };
}

/** Derive every development-browser artifact from the run capability selected
 * above. Only the enclosing release runner owns the historical canonical
 * locations. Direct and focused Playwright commands remain inside their unique
 * debug run root, including reporters that execute during `--list`. */
export function selectDevelopmentEvidenceLocations(motionEvidence) {
  if (motionEvidence.canonical) {
    if (motionEvidence.owner !== "qa:release") {
      throw new Error("Only qa:release may write canonical development-browser evidence");
    }
    return {
      reportDirectory: CANONICAL_DEVELOPMENT_REPORT_DIR,
      resultsFile: CANONICAL_DEVELOPMENT_RESULTS_FILE,
      outputDirectory: CANONICAL_DEVELOPMENT_OUTPUT_DIR,
      browserEvidenceDirectory: CANONICAL_DEVELOPMENT_BROWSER_EVIDENCE_DIR,
      canonical: true,
      owner: motionEvidence.owner,
    };
  }

  const developmentRoot = `${motionEvidence.relativePath}/development`;
  return {
    reportDirectory: `${developmentRoot}/playwright-report`,
    resultsFile: `${developmentRoot}/playwright-results.json`,
    outputDirectory: `${developmentRoot}/playwright-test-results`,
    browserEvidenceDirectory: `${developmentRoot}/browser-evidence`,
    canonical: false,
    owner: motionEvidence.owner,
  };
}

/** Replace any prior canonical tree with an empty directory using same-volume
 * renames. If the clean-tree rename fails, the previous tree is restored. */
export function resetCanonicalMotionEvidence(projectRoot = process.cwd(), {
  now = Date.now(), processId = process.pid,
} = {}) {
  const target = resolve(projectRoot, CANONICAL_MOTION_EVIDENCE_DIR);
  const parent = dirname(target);
  const clean = resolve(parent, `.visual-reward-qa-clean-${now}-${processId}`);
  const retired = resolve(parent, `.visual-reward-qa-retired-${now}-${processId}`);
  mkdirSync(parent, { recursive: true });
  rmSync(clean, { recursive: true, force: true });
  rmSync(retired, { recursive: true, force: true });
  mkdirSync(clean, { recursive: true });
  const hadPrior = existsSync(target);
  if (hadPrior) renameSync(target, retired);
  try {
    renameSync(clean, target);
  } catch (error) {
    if (hadPrior && existsSync(retired) && !existsSync(target)) renameSync(retired, target);
    throw error;
  }
  rmSync(retired, { recursive: true, force: true });
  return target;
}
