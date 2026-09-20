/**
 * Thin client for Flow's local voice companion (voice-companion/server.py)
 * — mirrors desktopBridgeClient.ts's localStorage token/base-URL pattern
 * exactly (same key-naming convention, same "read once, no UI to set it
 * yet" honesty note) rather than inventing a second configuration
 * mechanism. See voice-companion/docs/VOICE_COMPANION.md for the wire
 * protocol this speaks.
 *
 * Testable: the WebSocket constructor is injectable (defaults to the
 * global `WebSocket`), exactly like every other network primitive in this
 * codebase takes an injectable `fetchImpl`.
 */

export const VOICE_COMPANION_TOKEN_KEY = "flow.voiceCompanion.token";
export const VOICE_COMPANION_BASE_URL_KEY = "flow.voiceCompanion.baseUrl";
export const DEFAULT_VOICE_COMPANION_BASE_URL = "ws://127.0.0.1:8766";
export const DEFAULT_VOICE_COMPANION_HTTP_URL = "http://127.0.0.1:8766";

function readLocalStorage(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getVoiceCompanionBaseUrl(): string {
  const stored = readLocalStorage(VOICE_COMPANION_BASE_URL_KEY);
  return stored && stored.length > 0 ? stored : DEFAULT_VOICE_COMPANION_BASE_URL;
}

export function getVoiceCompanionToken(): string | null {
  const stored = readLocalStorage(VOICE_COMPANION_TOKEN_KEY);
  return stored && stored.length > 0 ? stored : null;
}

export interface VoiceCorrelation {
  sessionId?: string;
  utteranceId?: string;
  atMs?: number;
  audioMs?: number;
}
export type VoiceCompanionEvent = (
  | { type: "endpoint.detected" | "stt.flushStart" | "stt.flushRetry" | "stt.flushComplete" | "stt.reset" | "audio.silenceStart" | "audio.frame" | "audio.rms"; atMs?: number; audioMs?: number; utteranceId?: string; durationMs?: number }
  | { type: "protocol.unknown"; messageType: string }
  | { type: "ready"; sttReady: boolean; ttsReady: boolean; version: string }
  | { type: "speech.start" }
  | { type: "transcript.partial"; text: string }
  | { type: "transcript.final"; text: string }
  | { type: "speech.end" }
  | { type: "stt.error"; message: string }
  | { type: "tts.start" }
  | { type: "tts.audio"; data: ArrayBuffer }
  | { type: "tts.done" }
  | { type: "tts.cancelled" }
  | { type: "tts.error"; message: string }
  | { type: "connectionClosed"; code: number; reason: string }
  | { type: "connectionError" }) & VoiceCorrelation;

export type VoiceCompanionListener = (event: VoiceCompanionEvent) => void;

export interface VoiceCompanionClientOptions {
  /** Injectable for tests; defaults to the global WebSocket constructor. */
  webSocketImpl?: typeof WebSocket;
  baseUrl?: string;
  token?: string;
}

const MAX_RECONNECT_DELAY_MS = 10_000;
/** Matches voice-companion/server.py's handle_connection close code for
 * "a newer tab took exclusive ownership" (see FINAL REPORT's physical-test
 * repair B, exclusive voice ownership across tabs). */
export const EVICTED_BY_ANOTHER_TAB_CODE = 4409;
const BASE_RECONNECT_DELAY_MS = 500;

/**
 * Owns exactly one WebSocket connection to the voice companion, with
 * bounded exponential-backoff reconnect (Rule: reconnect support). Never
 * auto-reconnects after an explicit `disconnect()` — only after an
 * unexpected close/error.
 */
export class VoiceCompanionClient {
  private ws: WebSocket | null = null;
  private readonly webSocketImpl: typeof WebSocket;
  private readonly baseUrl: string;
  private readonly token: string | null;
  private listeners = new Set<VoiceCompanionListener>();
  private explicitlyDisconnected = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _sttReady = false;
  private _ttsReady = false;
  private ownershipAbort: AbortController | null = null;
  private releaseOwnership: (() => void) | null = null;

  constructor(options: VoiceCompanionClientOptions = {}) {
    this.webSocketImpl = options.webSocketImpl ?? (typeof WebSocket !== "undefined" ? WebSocket : (undefined as unknown as typeof WebSocket));
    this.baseUrl = options.baseUrl ?? getVoiceCompanionBaseUrl();
    this.token = options.token ?? getVoiceCompanionToken();
  }

  get sttReady(): boolean {
    return this._sttReady;
  }
  get ttsReady(): boolean {
    return this._ttsReady;
  }
  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === this.webSocketImpl.OPEN;
  }

  on(listener: VoiceCompanionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: VoiceCompanionEvent) {
    for (const listener of this.listeners) listener(event);
  }

  connect(): void {
    if (!this.token) {
      this.emit({ type: "connectionError" });
      return;
    }
    this.explicitlyDisconnected = false;
    if (typeof navigator !== "undefined" && navigator.locks) {
      // A queued browser lock transfers automatically when the owner closes.
      // Waiting tabs never open a socket or acquire a microphone.
      this.ownershipAbort?.abort();
      const abort = new AbortController();
      this.ownershipAbort = abort;
      // StrictMode may dispose and reconnect in the same task. Do not send
      // its already-obsolete acquisition to the browser's asynchronous queue.
      void Promise.resolve().then(() => {
        if (abort.signal.aborted) return;
        return navigator.locks.request("flow.local-voice", { signal: abort.signal }, async () => {
          if (abort.signal.aborted) return;
          await new Promise<void>((resolve) => {
            this.releaseOwnership = resolve;
            this.openSocket();
          });
        });
      }).catch(() => { /* Cancelled while waiting for ownership. */ });
    } else this.openSocket();
  }

  private openSocket(): void {
    const url = `${this.baseUrl}/voice?token=${encodeURIComponent(this.token!)}`;
    const ws = new this.webSocketImpl(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectAttempt = 0;
    };
    ws.onmessage = (event: MessageEvent) => {
      if (this.ws !== ws) return;
      if (typeof event.data === "string") {
        this.handleTextMessage(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        this.emit({ type: "tts.audio", data: event.data });
      }
    };
    ws.onclose = (event: CloseEvent) => {
      // React StrictMode and reconnects can leave an older socket closing
      // after a newer socket has already been installed.  A stale close
      // must never tear down the current connection or change ownership
      // state for the live socket.
      const isCurrent = this.ws === ws;
      if (!isCurrent) return;
      this.ws = null;
      this._sttReady = false;
      this._ttsReady = false;
      this.emit({ type: "connectionClosed", code: event.code, reason: event.reason });
      // 4409: this tab was explicitly superseded by a newer tab taking
      // exclusive ownership of the shared STT/TTS worker pair (see
      // server.py's handle_connection) — reconnecting would just fight the
      // new tab for the same connection slot over and over. This tab stays
      // disconnected until the user explicitly wakes it again, at which
      // point `connect()` is called fresh.
      if (event.code === EVICTED_BY_ANOTHER_TAB_CODE) {
        this.explicitlyDisconnected = true;
        return;
      }
      if (!this.explicitlyDisconnected) this.scheduleReconnect();
    };
    ws.onerror = () => {
      if (this.ws !== ws) return;
      this.emit({ type: "connectionError" });
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempt, MAX_RECONNECT_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.explicitlyDisconnected) this.openSocket();
    }, delay);
  }

  private handleTextMessage(raw: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const type = parsed.type;
    if (type === "endpoint.detected" || type === "stt.flushStart" || type === "stt.flushRetry" || type === "stt.flushComplete" || type === "stt.reset" || type === "audio.silenceStart" || type === "audio.frame" || type === "audio.rms") {
      this.emit({ ...parsed, type });
    } else if (type === "ready") {
      this._sttReady = Boolean(parsed.sttReady);
      this._ttsReady = Boolean(parsed.ttsReady);
      this.emit({ type: "ready", sttReady: this._sttReady, ttsReady: this._ttsReady, version: String(parsed.version ?? "") });
    } else if (type === "transcript.partial" || type === "transcript.final") {
      this.emit({ ...parsed, type, text: String(parsed.text ?? "") });
    } else if (type === "stt.error" || type === "tts.error") {
      this.emit({ type, message: String(parsed.message ?? "") });
    } else if (
      type === "speech.start" ||
      type === "speech.end" ||
      type === "tts.start" ||
      type === "tts.done" ||
      type === "tts.cancelled"
    ) {
      this.emit({ ...parsed, type });
    } else {
      this.emit({ type: "protocol.unknown", messageType: String(type) });
    }
  }

  disconnect(): void {
    this.explicitlyDisconnected = true;
    this.ownershipAbort?.abort();
    this.ownershipAbort = null;
    this.releaseOwnership?.();
    this.releaseOwnership = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  /** Raw PCM16LE mono 24kHz microphone audio. Silently dropped if not
   * connected — the caller (the React hook) is expected to gate capture on
   * `isMicActive` from the state machine, not on connection state, so a
   * brief reconnect window just drops audio rather than crashing. */
  sendAudio(pcm: ArrayBuffer): void {
    if (this.isConnected) this.ws!.send(pcm);
  }

  startSession(): void {
    this.sendJson({ type: "session.start" });
  }

  stopSession(): void {
    this.sendJson({ type: "session.stop" });
  }

  speak(text: string): void {
    this.sendJson({ type: "tts.speak", text });
  }

  cancelSpeak(): void {
    this.sendJson({ type: "tts.cancel" });
  }

  private sendJson(payload: Record<string, unknown>): void {
    if (this.isConnected) this.ws!.send(JSON.stringify(payload));
  }
}
