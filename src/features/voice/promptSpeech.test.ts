import { describe, expect, it } from "vitest";
import { PromptSpeechCoordinator, setVoicePlaybackActive, type PromptSpeechAdapter } from "./promptSpeech";

class Speech implements PromptSpeechAdapter {
  supported = true;
  spoken: string[] = [];
  finish?: () => void;
  cancellations = 0;
  speak(text: string) { this.spoken.push(text); return new Promise<void>((resolve) => { this.finish = resolve; }); }
  cancel() { this.cancellations += 1; this.finish?.(); }
}
describe("single spoken-prompt authority", () => {
  it.each(["No", "Never mind", "Cancel"])("accepts safe refusal %s during a question", async (answer) => {
    const speech = new Speech(), coordinator = new PromptSpeechCoordinator(speech);
    const prompt = coordinator.speak("Should I remove the Saturday appointment?", "en-US");
    expect(coordinator.assess(answer)).toBe("allow"); await prompt;
  });
  it("does not interrupt its own interim question prefix, while still allowing a later choice", async () => {
    const speech = new Speech(), coordinator = new PromptSpeechCoordinator(speech);
    const prompt = coordinator.speak("Which Saturday appointment do you mean?", "en-US");
    const cancellations = speech.cancellations;
    for (const prefix of ["Which", "Which Saturday", "Which Saturday appointment do you mean"]) expect(coordinator.interim(prefix)).toBe("echo");
    expect(speech.cancellations).toBe(cancellations);
    speech.finish?.(); await prompt;
    expect(coordinator.interim("The Saturday appointment")).toBe("allow");
    expect(coordinator.assess("The Saturday appointment")).toBe("allow");
  });
  it("blocks authorizers acquired during speech even when final arrives after speech stops", async () => {
    const speech = new Speech(); const coordinator = new PromptSpeechCoordinator(speech);
    const prompt = coordinator.speak("Message to Sarah. I'll arrive at six. Review or send this draft.", "en-GB");
    coordinator.beginUtterance(); speech.finish?.(); await prompt;
    expect(coordinator.assess("yes send it")).toBe("reask");
    coordinator.beginUtterance(); expect(coordinator.assess("yes send it")).toBe("allow");
  });
  it("allows a meaningful refinement to barge in without waiting for a wake or click", async () => {
    const speech = new Speech(); const coordinator = new PromptSpeechCoordinator(speech);
    const prompt = coordinator.speak("Thursday is occupied. Which day should I use?", "en-US");
    coordinator.interim("Actually Friday");
    expect(speech.cancellations).toBeGreaterThan(1); expect(coordinator.assess("Actually Friday")).toBe("allow"); await prompt;
  });
  it("rejects its own literal playback as prose or command", async () => {
    const speech = new Speech(); const coordinator = new PromptSpeechCoordinator(speech);
    const prompt = coordinator.speak("Message to Sarah. Cancel lunch and go home.", "en-US");
    coordinator.interim("Cancel lunch and go home");
    expect(coordinator.assess("Cancel lunch and go home")).toBe("echo"); await prompt;
  });
  it("does not authorize during incoming original-audio playback", () => {
    const coordinator = new PromptSpeechCoordinator(new Speech());
    setVoicePlaybackActive("incoming-note", true); coordinator.beginUtterance();
    setVoicePlaybackActive("incoming-note", false);
    expect(coordinator.assess("delete it")).toBe("reask");
  });
  it.each(["Sarah Miller", "the voice clip"])("accepts the spoken choice %s after the prompt finishes", async (choice) => {
    const speech = new Speech(); const coordinator = new PromptSpeechCoordinator(speech);
    const prompt = coordinator.speak(`Choose ${choice} or the other option.`, "en-US");
    speech.finish?.(); await prompt; coordinator.beginUtterance();
    expect(coordinator.assess(choice)).toBe("allow");
  });
});
