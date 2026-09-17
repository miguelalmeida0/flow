export const CANONICAL_MOTION_EVIDENCE_DIR: "artifacts/visual-reward-qa";
export const DEBUG_MOTION_EVIDENCE_ROOT: "artifacts/visual-reward-debug";
export const CANONICAL_DEVELOPMENT_REPORT_DIR: "artifacts/release-qa/playwright-dev-report";
export const CANONICAL_DEVELOPMENT_RESULTS_FILE: "artifacts/release-qa/playwright-dev-results.json";
export const CANONICAL_DEVELOPMENT_OUTPUT_DIR: "artifacts/release-qa/playwright-dev-test-results";
export const CANONICAL_DEVELOPMENT_BROWSER_EVIDENCE_DIR: "artifacts/always-on-voice-release";
export type MotionEvidenceSelection = {
  relativePath: string;
  absolutePath: string;
  canonical: boolean;
  owner: string;
};
export function selectMotionEvidenceDirectory(input?: {
  projectRoot?: string;
  environment?: Record<string, string | undefined>;
  now?: number;
  processId?: number;
}): MotionEvidenceSelection;
export function selectDevelopmentEvidenceLocations(motionEvidence: MotionEvidenceSelection): {
  reportDirectory: string;
  resultsFile: string;
  outputDirectory: string;
  browserEvidenceDirectory: string;
  canonical: boolean;
  owner: string;
};
export function resetCanonicalMotionEvidence(projectRoot?: string, input?: {
  now?: number;
  processId?: number;
}): string;
