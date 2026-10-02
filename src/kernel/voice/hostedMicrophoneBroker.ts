export interface HostedMicrophoneLease {
  stream: MediaStream;
  release(): void;
}

/** Hosted voice and explicit local recording share one physical capture.
 * Ordinary release affects one owner. Terminal hosted Stop revokes every owner,
 * asking native recorders to flush before the shared tracks are stopped.
 */
export class HostedMicrophoneBroker {
  private generation = 0;
  private stream: MediaStream | undefined;
  private pending: Promise<MediaStream> | undefined;
  private owners = new Map<symbol, (() => void) | undefined>();
  constructor(private readonly getStream: () => Promise<MediaStream> = () => navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false,
  })) {}

  async acquire(onRevoke?: () => void): Promise<HostedMicrophoneLease> {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") throw new Error("Open this page before starting the microphone.");
    const generation = this.generation;
    if (!this.stream && !this.pending) {
      const pending = this.getStream().then(stream => {
        if (generation !== this.generation) {
          for (const track of stream.getTracks()) track.stop();
          throw new Error("Microphone request was stopped. Start again when ready.");
        }
        this.stream = stream;
        return stream;
      });
      this.pending = pending;
      void pending.finally(() => { if (this.pending === pending) this.pending = undefined; }).catch(() => undefined);
    }
    const stream = this.stream ?? await this.pending!;
    if (generation !== this.generation) throw new Error("Microphone request was superseded.");
    const owner = Symbol("microphone owner");
    this.owners.set(owner, onRevoke);
    return { stream, release: () => {
      if (!this.owners.delete(owner)) return;
      if (!this.owners.size) this.stopTracks();
    } };
  }

  private stopTracks(): void {
    const stream = this.stream; this.stream = undefined;
    for (const track of stream?.getTracks() ?? []) track.stop();
  }

  revokeAll(): void {
    this.generation += 1; this.pending = undefined;
    const owners = [...this.owners.values()]; this.owners.clear();
    // Clear ownership before callbacks; recorder.closeStream may release its
    // lease synchronously while flushing and must not stop the stream twice.
    for (const revoke of owners) { try { revoke?.(); } catch { /* Other owners still must stop. */ } }
    this.stopTracks();
  }
}

export const hostedMicrophoneBroker = new HostedMicrophoneBroker();
