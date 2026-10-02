import type { VoiceCompanionEvent } from "./voiceCompanionClient";

/** Shared PCM/event seam. Provider authentication and reconnect rules stay
 * inside their transports; utterance authority and dispatch stay in the hook.
 */
export type VoiceTransportEvent = VoiceCompanionEvent;
export type VoiceTransportListener = (event: VoiceTransportEvent) => void;

export interface VoiceTransport {
  readonly sttReady: boolean;
  readonly ttsReady: boolean;
  readonly isConnected: boolean;
  on(listener: VoiceTransportListener): () => void;
  connect(): void;
  disconnect(): void;
  sendAudio(pcm: ArrayBuffer): void;
  startSession(): void;
  setInputMode(inputMode: "command" | "dictation"): void;
  stopSession(): void;
  speak(text: string): void;
  cancelSpeak(): void;
  acknowledgePlayback?(generation: number, sequence: number): void;
}

/** Typed-only mode does not even read local companion credentials. */
export function createInactiveVoiceTransport(): VoiceTransport {
  const noop = () => undefined;
  return { sttReady: false, ttsReady: false, isConnected: false, on: () => noop,
    connect: noop, disconnect: noop, sendAudio: noop, startSession: noop,
    setInputMode: noop, stopSession: noop, speak: noop, cancelSpeak: noop };
}
