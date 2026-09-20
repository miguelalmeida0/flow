import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VoiceCompanionClient, type VoiceCompanionEvent } from "./voiceCompanionClient";

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "blob";
  url: string;
  sent: (string | ArrayBuffer)[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: "client closed" });
  }
  // Test helpers, not part of the real WebSocket interface.
  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  simulateMessage(data: string | ArrayBuffer) {
    this.onmessage?.({ data });
  }
  simulateServerClose(code = 1006, reason = "abnormal") {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

function makeClient(token: string | null = "test-token") {
  FakeWebSocket.instances = [];
  return new VoiceCompanionClient({
    webSocketImpl: FakeWebSocket as unknown as typeof WebSocket,
    baseUrl: "ws://127.0.0.1:8766",
    token: token ?? undefined,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("VoiceCompanionClient", () => {
  it("queues only the live acquisition after StrictMode connect-disconnect-connect", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
    const request = vi.fn(() => new Promise(() => undefined));
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request } });
    const client = makeClient();
    try {
      client.connect(); client.disconnect(); client.connect();
      await Promise.resolve();
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0]).toEqual(["flow.local-voice", { signal: expect.any(AbortSignal) }, expect.any(Function)]);
      expect(FakeWebSocket.instances).toHaveLength(0);
    } finally {
      client.disconnect();
      if (descriptor) Object.defineProperty(navigator, "locks", descriptor);
      else Reflect.deleteProperty(navigator, "locks");
    }
  });
  it("connects with the token in the query string and reports connectionError with no token", () => {
    const events: VoiceCompanionEvent[] = [];
    const client = makeClient(null);
    client.on((e) => events.push(e));
    client.connect();
    expect(events).toEqual([{ type: "connectionError" }]);
    expect(FakeWebSocket.instances.length).toBe(0);
  });

  it("parses the ready event and exposes sttReady/ttsReady", () => {
    const events: VoiceCompanionEvent[] = [];
    const client = makeClient();
    client.on((e) => events.push(e));
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("ws://127.0.0.1:8766/voice?token=test-token");
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({ type: "ready", sttReady: true, ttsReady: false, version: "0.1.0" }));
    expect(client.sttReady).toBe(true);
    expect(client.ttsReady).toBe(false);
    expect(events).toContainEqual({ type: "ready", sttReady: true, ttsReady: false, version: "0.1.0" });
  });

  it("routes binary messages as tts.audio and text messages as their typed event", () => {
    const events: VoiceCompanionEvent[] = [];
    const client = makeClient();
    client.on((e) => events.push(e));
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    const buf = new ArrayBuffer(4);
    ws.simulateMessage(buf);
    ws.simulateMessage(JSON.stringify({ type: "transcript.partial", text: "hello" }));
    ws.simulateMessage(JSON.stringify({ type: "transcript.final", text: "hello world" }));
    expect(events).toContainEqual({ type: "tts.audio", data: buf });
    expect(events).toContainEqual({ type: "transcript.partial", text: "hello" });
    expect(events).toContainEqual({ type: "transcript.final", text: "hello world" });
  });

  it("sends session.start/stop, tts.speak, and tts.cancel as the exact wire protocol", () => {
    const client = makeClient();
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    client.startSession();
    client.stopSession();
    client.speak("hello there");
    client.cancelSpeak();
    expect(ws.sent).toEqual([
      JSON.stringify({ type: "session.start" }),
      JSON.stringify({ type: "session.stop" }),
      JSON.stringify({ type: "tts.speak", text: "hello there" }),
      JSON.stringify({ type: "tts.cancel" }),
    ]);
  });

  it("drops sendAudio silently when not connected instead of throwing", () => {
    const client = makeClient();
    expect(() => client.sendAudio(new ArrayBuffer(8))).not.toThrow();
  });

  it("reconnects with exponential backoff after an unexpected close, but never after an explicit disconnect", () => {
    const client = makeClient();
    client.connect();
    let ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateServerClose();
    expect(FakeWebSocket.instances.length).toBe(1);
    vi.advanceTimersByTime(500); // first backoff delay
    expect(FakeWebSocket.instances.length).toBe(2);

    ws = FakeWebSocket.instances[1]!;
    ws.simulateOpen();
    ws.simulateServerClose();
    vi.advanceTimersByTime(499);
    expect(FakeWebSocket.instances.length).toBe(2); // not yet — backoff doubled to 1000ms
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances.length).toBe(3);

    // Explicit disconnect after this must not schedule another reconnect.
    client.disconnect();
    vi.advanceTimersByTime(20_000);
    expect(FakeWebSocket.instances.length).toBe(3);
  });

  it("does NOT reconnect after being evicted by another tab (code 4409) — exclusive voice ownership", () => {
    const client = makeClient();
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateServerClose(4409, "superseded by a newer tab");
    vi.advanceTimersByTime(20_000);
    expect(FakeWebSocket.instances.length).toBe(1); // no reconnect attempt at all.
  });

  it("resets sttReady/ttsReady to false on disconnect", () => {
    const client = makeClient();
    client.connect();
    const ws = FakeWebSocket.instances[0]!;
    ws.simulateOpen();
    ws.simulateMessage(JSON.stringify({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));
    expect(client.sttReady).toBe(true);
    ws.simulateServerClose();
    expect(client.sttReady).toBe(false);
    expect(client.ttsReady).toBe(false);
  });

  it("ignores a stale socket close after a reconnect installs a newer socket", () => {
    const events: VoiceCompanionEvent[] = [];
    const client = makeClient();
    client.on((event) => events.push(event));
    client.connect();
    const first = FakeWebSocket.instances[0]!;
    first.simulateOpen();
    first.simulateServerClose();
    vi.advanceTimersByTime(500);
    const second = FakeWebSocket.instances[1]!;
    second.simulateOpen();
    second.simulateMessage(JSON.stringify({ type: "ready", sttReady: true, ttsReady: true, version: "0.1.0" }));

    // The old socket may finish closing after the replacement is live.
    first.onclose?.({ code: 4409, reason: "superseded by a newer tab" });
    expect(client.isConnected).toBe(true);
    expect(client.sttReady).toBe(true);
    expect(events).not.toContainEqual({ type: "connectionClosed", code: 4409, reason: "superseded by a newer tab" });
  });

  it("preserves endpoint and drain correlation and safely surfaces future messages", () => {
    const client = makeClient();
    const events: VoiceCompanionEvent[] = [];
    client.on(event => events.push(event)); client.connect();
    const ws = FakeWebSocket.instances[0]!; ws.simulateOpen();
    for (const type of ["speech.start", "endpoint.detected", "stt.flushStart", "stt.flushComplete", "transcript.final", "stt.reset"]) {
      ws.simulateMessage(JSON.stringify({ type, sessionId: "session", utteranceId: "utterance", atMs: 123, audioMs: 456, text: "Confirm" }));
      expect(events.at(-1)).toMatchObject({ type, sessionId: "session", utteranceId: "utterance", atMs: 123, audioMs: 456 });
    }
    ws.simulateMessage(JSON.stringify({ type: "future.lifecycle" }));
    expect(events.at(-1)).toMatchObject({ type: "protocol.unknown", messageType: "future.lifecycle" });
    expect(client.isConnected).toBe(true);
  });
});
