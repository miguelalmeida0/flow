import { StrictMode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalDrawingPad } from "./JournalDrawingPad";
import type { JournalDrawingStroke } from "../../../domain/studio-model";

beforeEach(() => vi.stubGlobal("PointerEvent", MouseEvent));
afterEach(() => vi.unstubAllGlobals());

function pointerSurface() {
  const svg = screen.getByRole("img", { name: "Freehand journal annotation" });
  Object.assign(svg, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn(), hasPointerCapture: () => true });
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) });
  return svg;
}

describe("Journal drawing ownership", () => {
  it("commits one pointer stroke once under StrictMode", () => {
    const onChange = vi.fn(); const strokes: JournalDrawingStroke[] = [];
    render(<StrictMode><JournalDrawingPad strokes={strokes} onChange={onChange}/></StrictMode>);
    const svg = pointerSurface();
    fireEvent.pointerDown(svg, { clientX: 10, clientY: 20 });
    fireEvent.pointerMove(svg, { clientX: 30, clientY: 40 });
    fireEvent.pointerUp(svg);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toEqual([{ id: expect.any(String), color: "ink", points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }]);
  });
  it("does not commit an in-flight stroke over a newer external drawing", () => {
    const onChange = vi.fn(); const old: JournalDrawingStroke[] = [];
    const view = render(<JournalDrawingPad strokes={old} onChange={onChange}/>);
    const svg = pointerSurface(); fireEvent.pointerDown(svg, { clientX: 10, clientY: 20 });
    const restored: JournalDrawingStroke[] = [{ id: "restored", color: "ink", points: [{ x: 40, y: 50 }] }];
    view.rerender(<JournalDrawingPad strokes={restored} onChange={onChange}/>);
    fireEvent.pointerUp(svg);
    expect(onChange).not.toHaveBeenCalled();
    expect(svg.querySelector("polyline")).toHaveAttribute("points", "40,50");
  });
});
