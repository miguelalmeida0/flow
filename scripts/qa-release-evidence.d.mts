export function voiceBrowserResultsPath(projectRoot: string): string;
export function removeStaleVoiceBrowserResults(projectRoot: string): boolean;
export function physicalMicrophoneStatus(input: {
  e2eExecuted: boolean;
  automatedVoiceVerified: boolean;
}): string;
