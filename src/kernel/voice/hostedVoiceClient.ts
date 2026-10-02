import { getRuntimeMode } from "../../app/runtimeMode";
import { getHostedSession } from "../hostedSessionClient";
import type { VoiceTransport, VoiceTransportListener } from "./voiceTransport";
import type { VoiceCompanionEvent } from "./voiceCompanionClient";
import { decodeVoiceFrame, encodeVoiceFrame, PCM_FRAME_BYTES, PCM_WINDOW_BYTES, FRAME_HEADER_BYTES, VOICE_VERSION } from "../../../shared/hosted-voice-protocol.mjs";

export class HostedVoiceClient implements VoiceTransport {
  private socket: WebSocket | null = null;
  private controller: AbortController | null = null;
  private listeners = new Set<VoiceTransportListener>();
  private epoch: string | null = null;
  private generation = 0;
  private sequence = 0;
  private outputSequence = 0;
  private receiving = false;
  private inputMode: "command" | "dictation" = "command";
  private ready = false;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionId: string | undefined;
  private readonly socketImpl: typeof WebSocket;
  private readonly sessionImpl: typeof getHostedSession;
  constructor(options: {webSocketImpl?: typeof WebSocket; sessionImpl?: typeof getHostedSession} = {}) {
    this.socketImpl = options.webSocketImpl ?? WebSocket;
    this.sessionImpl = options.sessionImpl ?? getHostedSession;
  }
  get sttReady() { return this.ready; }
  get ttsReady() { return this.ready; }
  get isConnected() { return this.socket?.readyState === 1; }
  on(listener: VoiceTransportListener) { this.listeners.add(listener); return () => {this.listeners.delete(listener);}; }
  private emit(event: VoiceCompanionEvent) { for (const listener of this.listeners) listener(event); }
  private send(value: Record<string, unknown>) {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify({...value,captureEpoch:this.epoch}));
  }
  connect() {
    if (getRuntimeMode() !== "hosted" || location.protocol !== "https:") { this.emit({type:"connectionError"}); return; }
    this.disconnect();
    const epoch = crypto.randomUUID();
    const controller = new AbortController();
    this.epoch = epoch; this.controller = controller;
    this.readyTimer = setTimeout(() => this.fail("Voice connection timed out."), 15000);
    void this.sessionImpl({signal:controller.signal}).then(session => {
      if (controller.signal.aborted || this.epoch !== epoch) return;
      if (!session.authenticated || !session.speechEnabled || !session.csrf) throw new Error("Cloud voice access unavailable.");
      const url = new URL("/api/voice", location.origin); url.protocol = "wss:";
      const socket = new this.socketImpl(url.toString());
      this.socket = socket; socket.binaryType = "arraybuffer";
      socket.onopen = () => {
        if (this.socket !== socket || this.epoch !== epoch) return;
        this.send({type:"hello",version:VOICE_VERSION,csrf:session.csrf,inputMode:this.inputMode});
      };
      socket.onmessage = event => {
        if (this.socket !== socket || this.epoch !== epoch || controller.signal.aborted) return;
        try {
          if (event.data instanceof ArrayBuffer) {
            const frame = decodeVoiceFrame(event.data);
            if (frame.epoch !== epoch || frame.kind !== 2) throw new Error("Invalid voice frame.");
            if (frame.generation !== this.generation || !this.receiving) return;
            if (frame.sequence !== this.outputSequence + 1) throw new Error("Out-of-order speech.");
            this.outputSequence = frame.sequence;
            this.emit({type:"tts.audio", data:frame.data, captureEpoch:epoch, requestId:frame.generation, generation:frame.generation, sequence:frame.sequence, sessionId:this.sessionId});
            return;
          }
          if (typeof event.data !== "string" || event.data.length > 12000) throw new Error("Invalid voice message.");
          const message = JSON.parse(event.data);
          if (message.version !== VOICE_VERSION || message.captureEpoch !== epoch || typeof message.sessionId !== "string") throw new Error("Invalid voice authority.");
          if (this.sessionId && message.sessionId !== this.sessionId) throw new Error("Voice session changed.");
          if (message.type === "ready") {
            if (this.ready || message.sttReady !== true || message.ttsReady !== true || !Number.isFinite(message.expiresAt) || message.expiresAt <= Date.now()) throw new Error("Voice provider unavailable.");
            this.sessionId = message.sessionId; this.ready = true;
            clearTimeout(this.readyTimer);
          } else if (!this.ready) throw new Error("Voice provider is not ready.");
          if (typeof message.type !== "string") throw new Error("Invalid voice event.");
          if (message.type.startsWith("tts.")) {
            if (message.generation !== this.generation) return;
            if (message.type === "tts.start") { this.receiving = true; this.outputSequence = 0; }
            if (message.type === "tts.done" || message.type === "tts.error" || message.type === "tts.cancelled") this.receiving = false;
          }
          if (["speech.start","transcript.partial","transcript.final","speech.end"].includes(message.type) && typeof message.utteranceId !== "string") throw new Error("Missing utterance identity.");
          if (["transcript.partial","transcript.final"].includes(message.type) && typeof message.text !== "string") throw new Error("Invalid transcript.");
          this.emit(message as VoiceCompanionEvent);
          if (message.type === "stt.error") this.disconnect();
        } catch { this.fail("Voice protocol failed. Start a new session."); }
      };
      socket.onerror = () => { if (this.socket === socket) this.fail("Voice connection failed."); };
      socket.onclose = event => {
        if (this.socket !== socket) return;
        this.disconnect(); this.emit({type:"connectionClosed",code:event.code,reason:event.reason});
      };
    }).catch(() => {if (!controller.signal.aborted && this.epoch === epoch) this.fail("Cloud voice access unavailable.");});
  }
  private fail(message: string) { this.disconnect(); this.emit({type:"stt.error",message}); }
  disconnect() {
    clearTimeout(this.readyTimer); this.controller?.abort(); this.controller = null;
    const old = this.socket; this.socket = null; this.epoch = null; this.ready = false;
    this.receiving = false; this.sessionId = undefined; this.sequence = 0; this.generation = 0; this.outputSequence = 0;
    if (old && old.readyState < 2) old.close();
  }
  sendAudio(pcm: ArrayBuffer) {
    if (!this.ready || !this.epoch || !this.socket) return;
    const framedBytes = pcm.byteLength + Math.ceil(pcm.byteLength / PCM_FRAME_BYTES) * FRAME_HEADER_BYTES;
    if (!pcm.byteLength || pcm.byteLength % 2 || framedBytes > PCM_WINDOW_BYTES || this.socket.bufferedAmount + framedBytes > PCM_WINDOW_BYTES) { this.fail("Microphone buffer overflow."); return; }
    for (let offset = 0; offset < pcm.byteLength; offset += PCM_FRAME_BYTES) {
      this.socket.send(encodeVoiceFrame({kind:1,epoch:this.epoch,generation:0,sequence:++this.sequence,data:pcm.slice(offset,offset+PCM_FRAME_BYTES)}));
    }
  }
  startSession() { /* The accepted handshake already owns this capture epoch. */ }
  stopSession() { this.send({type:"stop"}); this.disconnect(); }
  setInputMode(inputMode: "command" | "dictation") {
    this.inputMode = inputMode;
    if (this.ready) this.send({type:"input.mode",inputMode});
  }
  speak(text: string) {
    if (!this.ready || !text.trim()) return;
    if (new TextEncoder().encode(text).length > 600) { this.emit({type:"tts.error",message:"This response is too long to speak. Read it on screen."}); return; }
    this.receiving = false;
    this.send({type:"tts.request",generation:++this.generation,text});
  }
  cancelSpeak() {
    this.receiving = false;
    if (this.ready) this.send({type:"tts.cancel",generation:++this.generation});
  }
  acknowledgePlayback(generation: number, sequence: number) {
    if (this.ready && generation === this.generation) this.send({type:"tts.played",generation,sequence});
  }
}
