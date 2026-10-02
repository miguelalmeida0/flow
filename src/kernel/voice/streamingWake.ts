/** Per-utterance lexical state. Partial observations never authorize a command. */
export type StreamingWakeState = "NO_CANDIDATE" | "PREFIX_CANDIDATE" | "WAKE_CONFIRMED" | "WAKE_REJECTED";

const prefixes = ["flow", "hey flow"];
const boundary = /[\s,.:;!?—–]/u;

export class StreamingWake {
  state: StreamingWakeState = "NO_CANDIDATE";
  private previous = "";
  private candidates = [...prefixes];
  private offset = 0;

  reset() {
    this.state = "NO_CANDIDATE";
    this.previous = "";
    this.candidates = [...prefixes];
    this.offset = 0;
  }

  observe(partial: string, final = false): StreamingWakeState {
    const text = partial.trimStart().toLowerCase().replace(/\s+/gu, " ");
    // A revised hypothesis is a new lexical path. Appended tokens advance the
    // existing path; repeating the bare word cannot turn it into a boundary.
    if (!text.startsWith(this.previous)) this.reset();
    this.previous = text;
    while (this.offset < text.length && this.state !== "WAKE_CONFIRMED" && this.state !== "WAKE_REJECTED") {
      const char = text.charAt(this.offset);
      if (this.candidates.some(candidate => candidate.length === this.offset && boundary.test(char))) {
        this.state = "WAKE_CONFIRMED";
        break;
      }
      this.candidates = this.candidates.filter(candidate => candidate[this.offset] === char);
      this.offset++;
      this.state = this.candidates.length ? "PREFIX_CANDIDATE" : "WAKE_REJECTED";
    }
    if (final && this.candidates.some(candidate => candidate === text.trimEnd())) this.state = "WAKE_CONFIRMED";
    return this.state;
  }
}
