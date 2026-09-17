import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioPlayback } from "./useStudioPlayback";
import { requestStudioPlayback } from "./studioPlayback";
import { PromptSpeechCoordinator } from "../voice/promptSpeech";

function Playback({ activate }: { activate: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  useStudioPlayback(audio, "voice-note-playback", "shared-a", 0, 30_000, { url: "blob:test", state: "persisted" }, activate);
  return <audio ref={audio} aria-label="Test recording" controls src="blob:test" />;
}
afterEach(() => vi.restoreAllMocks());
it("keeps a programmatic play event inside its request authority and retains echo protection", async () => {
  let epoch = 1;
  const activate = vi.fn(() => { epoch += 1; });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async function (this: HTMLMediaElement) { this.dispatchEvent(new Event("play")); });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event("pause")); });
  render(<Playback activate={activate} />);
  await act(async () => requestStudioPlayback({ target: "voice-note-playback", entryId: "shared-a", mode: "play" }, () => epoch === 1));
  expect(activate).not.toHaveBeenCalled(); expect(epoch).toBe(1);
  const prompt = new PromptSpeechCoordinator({ supported: true, speak: async () => undefined, cancel: () => undefined });
  expect(prompt.assess("yes")).toBe("reask");
  fireEvent.keyDown(screen.getByLabelText("Test recording"), { key: "ArrowRight" });
  expect(activate).toHaveBeenCalledTimes(1); expect(epoch).toBe(2);
});
it("releases its programmatic guard after native failure and uses the latest callback without pausing on rerender", async () => {
  const first = vi.fn(), latest = vi.fn(), pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("blocked"));
  const view = render(<Playback activate={first} />);
  await act(async () => { await expect(requestStudioPlayback({ target: "voice-note-playback", entryId: "shared-a", mode: "play" })).rejects.toThrow("Playback could not start"); });
  view.rerender(<Playback activate={latest} />); expect(pause).not.toHaveBeenCalled();
  fireEvent.play(screen.getByLabelText("Test recording"));
  expect(first).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1);
});
