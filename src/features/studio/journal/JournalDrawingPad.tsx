import { useRef, useState, type PointerEvent } from "react";
import type { JournalDrawingStroke } from "../../../domain/studio-model";

export function JournalDrawingPad({ strokes, onChange, onBegin }: { strokes: JournalDrawingStroke[]; onChange: (strokes: JournalDrawingStroke[]) => void; onBegin?: () => void }) {
  const [gesture, setGesture] = useState<{ base: JournalDrawingStroke[]; draft: JournalDrawingStroke[] }>();
  // Persisted props own the image except during this exact pointer gesture.
  // A remote edit, voice clear or history restore invalidates its draft.
  const draft = gesture?.base === strokes ? gesture.draft : strokes;
  const activeId = useRef<string | undefined>(undefined);
  function point(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / (bounds.width || 1) * 100)), y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / (bounds.height || 1) * 100)) };
  }
  return <div className="rounded-[22px] border border-[#D8D0C8] bg-[#EFE6D6] p-3">
    <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6D6A64]">Margin sketch</span><button data-action-id="journal.drawing-clear" className="min-h-11 rounded-full px-3 text-xs text-[#6D6A64] hover:bg-white/60" data-flow-action="Clear sketch" onClick={() => { setGesture(undefined); activeId.current = undefined; onChange([]); }} type="button">Clear</button></div>
    <svg data-action-id="journal.drawing-input" aria-label="Freehand journal annotation" tabIndex={0} className="h-32 w-full touch-none rounded-xl bg-[#F7F0E4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EA7A4]" data-flow-action="Journal sketch" onPointerDown={(event) => {
      onBegin?.();
      event.currentTarget.setPointerCapture(event.pointerId);
      const id = `stroke-${Date.now().toString(36)}`; activeId.current = id;
      setGesture({ base: strokes, draft: [...strokes, { id, color: "ink", points: [point(event)] }] });
    }} onPointerMove={(event) => {
      if (!activeId.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
      const nextPoint = point(event);
      setGesture((current) => current?.base === strokes ? { ...current, draft: current.draft.map((stroke) => stroke.id === activeId.current ? { ...stroke, points: [...stroke.points, nextPoint] } : stroke) } : undefined);
    }} onPointerUp={(event) => {
      event.currentTarget.releasePointerCapture(event.pointerId); activeId.current = undefined;
      if (gesture?.base === strokes) onChange(gesture.draft);
      setGesture(undefined);
    }} onPointerCancel={() => { activeId.current = undefined; setGesture(undefined); }} role="img" viewBox="0 0 100 100">
      {draft.map((stroke) => <polyline fill="none" key={stroke.id} points={stroke.points.map(({ x, y }) => `${x},${y}`).join(" ")} stroke="#27312C" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />)}
    </svg>
  </div>;
}
