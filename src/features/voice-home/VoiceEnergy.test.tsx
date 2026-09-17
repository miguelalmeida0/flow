import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { VoiceWorldSnapshot } from "./voiceWorld";
import { VoiceTargetPulse } from "./VoiceEnergy";

const target: VoiceWorldSnapshot = {
  actionId: "voice-42",
  confidenceTier: "high",
  domain: "today",
  entrance: "active",
  phase: "executing",
  sequence: 2,
  targetMotionStage: "pulse",
};

describe("persistent voice target pulse", () => {
  it("keeps the shell-owned target alive through success and clears with its semantic target", () => {
    const view = render(<VoiceTargetPulse snapshot={target} />);
    expect(screen.getByText("Calendar")).toBeInTheDocument();

    view.rerender(<VoiceTargetPulse snapshot={{ ...target, phase: "success", sequence: 3 }} />);
    expect(screen.getByText("Calendar")).toBeInTheDocument();

    view.rerender(<VoiceTargetPulse snapshot={{ ...target, domain: undefined, phase: "listening", sequence: 4 }} />);
    expect(screen.queryByText("Calendar")).not.toBeInTheDocument();
  });
});
