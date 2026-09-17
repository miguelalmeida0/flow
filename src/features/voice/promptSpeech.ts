export interface PromptSpeechAdapter {
  readonly supported: boolean;
  speak(text: string, language: string): Promise<void>;
  cancel(): void;
}
export class BrowserPromptSpeech implements PromptSpeechAdapter {
  readonly supported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  private settle?: (error?: Error) => void;
  speak(text: string, language: string) {
    this.cancel();
    if (!this.supported) return Promise.reject(new Error("Spoken prompts are unavailable here. Read the question and answer by voice or typing."));
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      let started = false;
      const timer = window.setTimeout(() => { if (!started) { this.settle?.(new Error("The browser blocked spoken prompts. The question is visible; voice listening remains available.")); window.speechSynthesis.cancel(); } }, 2500);
      const finish = (error?: Error) => { window.clearTimeout(timer); if (this.settle === finish) this.settle = undefined; if (error) reject(error); else resolve(); };
      this.settle = finish;
      utterance.onstart = () => { started = true; window.clearTimeout(timer); };
      utterance.onend = () => finish();
      utterance.onerror = (event) => finish(new Error(`Spoken prompt could not finish (${event.error}). The question remains visible.`));
      window.speechSynthesis.speak(utterance);
    });
  }
  cancel() { this.settle?.(); this.settle = undefined; if (this.supported) window.speechSynthesis.cancel(); }
}

const playbackOwners = new Map<string, (() => void) | undefined>();
export const setVoicePlaybackActive = (owner: string, active: boolean, pause?: () => void) => { if (active) playbackOwners.set(owner, pause); else playbackOwners.delete(owner); };
function pauseIncomingPlayback() { for (const pause of playbackOwners.values()) pause?.(); playbackOwners.clear(); }
const key = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' ]/gu, " ").replace(/\s+/g, " ").trim();

/** One output owner. Playback-overlapping authorizers are never trusted as user authority. */
export class PromptSpeechCoordinator {
  private speaking = false;
  private overlapping = false;
  private recent: Array<{ text: string; at: number }> = [];
  private generation = 0;
  constructor(private readonly adapter: PromptSpeechAdapter, private readonly now: () => number = Date.now) {}
  get supported() { return this.adapter.supported; }
  async speak(text: string, language: string) {
    this.cancel();
    if (!this.adapter.supported) return this.adapter.speak(text, language);
    const generation = ++this.generation;
    this.speaking = true;
    this.recent = [...this.recent.filter(({ at }) => this.now() - at < 15_000).slice(-3), { text: key(text), at: this.now() }];
    try { await this.adapter.speak(text, language); }
    finally { if (this.generation === generation) this.speaking = false; }
  }
  beginUtterance() { this.overlapping ||= this.speaking || playbackOwners.size > 0; }
  interim(text: string): "allow" | "echo" {
    const normalized = key(text);
    if (!normalized) return "allow";
    // A recognized prefix of our currently spoken question is not barge-in.
    // Once speech ends, the same words are valid deliberate choice answers.
    if (this.speaking && this.recent.some((item) => this.now() - item.at < 15_000 && (item.text.startsWith(normalized) || (normalized.length > 8 && item.text.includes(normalized))))) return "echo";
    this.beginUtterance(); if (this.speaking) this.cancel(); pauseIncomingPlayback(); return "allow";
  }
  assess(text: string): "allow" | "echo" | "reask" {
    const normalized = key(text);
    const overlapped = this.overlapping || this.speaking || playbackOwners.size > 0;
    this.overlapping = false;
    if (overlapped) { this.cancel(); pauseIncomingPlayback(); }
    if (overlapped && this.recent.some((item) => this.now() - item.at < 15_000 && normalized.length > 8 && (item.text === normalized || item.text.includes(normalized)))) return "echo";
    if (overlapped && /^(?:yes|yeah|yep|okay|ok|sure|confirm|send|delete|remove|go ahead|do it|apply)\b/.test(normalized)) return "reask";
    // Narrative acquired during assistant/incoming playback cannot become private dictation.
    if (overlapped && !/^(?:actually|no\b|change|add |say |make |move |stop|pause|cancel|never ?mind|text |message |open |play |replay |restart |seek |mute |unmute |resume\b|continue playing|listen to |let me hear |start (?:it )?over|set (?:the |my )?(?:journal|audio|recording|shared recording) )/.test(normalized)) return "echo";
    return "allow";
  }
  cancel() { this.generation += 1; this.speaking = false; this.adapter.cancel(); }
}
