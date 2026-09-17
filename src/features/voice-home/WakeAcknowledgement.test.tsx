import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WakeAcknowledgement } from "./WakeAcknowledgement";
import { cancelWakeAcknowledgement, requestWakeAcknowledgement } from "./wakeAcknowledgementEvent";

describe("shell wake acknowledgement", () => {
  it("reveals the same pre-mounted node before Home replaces it", () => {
    const view = render(<WakeAcknowledgement entrance="wake-armed" />);
    const mounted = screen.getByText("", { selector: "[data-shell-wake-acknowledgement]" });
    expect(mounted).toHaveAttribute("aria-hidden", "true");

    act(() => requestWakeAcknowledgement("flow-wake-shell-7"));
    const visible = screen.getByText("Hi there!", { selector: "[data-shell-wake-acknowledgement]" });
    expect(visible).toBe(mounted);
    expect(visible).not.toHaveAttribute("aria-hidden");
    expect(visible).toHaveAttribute("elementtiming", "flow-wake-shell-7");

    view.rerender(<WakeAcknowledgement entrance="wake-reward" />);
    expect(mounted).toHaveAttribute("aria-hidden", "true");
    expect(mounted).toHaveTextContent("");
  });

  it("cancels only the owning wake without erasing a newer response", () => {
    render(<WakeAcknowledgement entrance="wake-armed" />);
    act(() => requestWakeAcknowledgement("wake-new"));
    act(() => cancelWakeAcknowledgement("wake-old"));
    expect(screen.getByText("Hi there!")).not.toHaveAttribute("aria-hidden");
    act(() => cancelWakeAcknowledgement("wake-new"));
    expect(document.querySelector("[data-shell-wake-acknowledgement]")).toHaveAttribute("aria-hidden", "true");
  });
});
