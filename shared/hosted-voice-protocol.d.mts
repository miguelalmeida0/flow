export const VOICE_VERSION: number;
export const FRAME_HEADER_BYTES: number;
export const PCM_WINDOW_BYTES: number;
export const PCM_FRAME_BYTES: number;
export const UUID_PATTERN: RegExp;
export interface VoiceFrame { kind: number; epoch: string; generation: number; sequence: number; data: ArrayBuffer }
export function encodeVoiceFrame(frame: VoiceFrame): ArrayBuffer;
export function decodeVoiceFrame(data: ArrayBuffer | Uint8Array): VoiceFrame;
