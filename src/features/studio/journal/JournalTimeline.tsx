import type { JournalEntry } from "../../../domain/studio-model";

function percent(value: number, total: number) { return Math.max(0, Math.min(100, total ? value / total * 100 : 0)); }

export function JournalTimeline({ entry, positionMs, onSeek, onSelectBookmark }: { entry: JournalEntry; positionMs: number; onSeek: (milliseconds: number) => void; onSelectBookmark?: (bookmarkId: string) => void }) {
  const total = Math.max(entry.recordingDurationMs, positionMs, ...entry.bookmarks.map(({ timestampMs }) => timestampMs), 1);
  return <div aria-label="Journal recording timeline" className="relative rounded-[22px] border border-[#D8D0C8] bg-[#171B18] px-4 pb-7 pt-5 text-[#F4EFE5]" data-testid="journal-timeline">
    <button data-action-id="journal.playback-seek" aria-label="Seek journal recording" className="relative flex h-20 w-full items-center gap-[3px] overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7EA7A4]" data-flow-action="Seek journal recording" onClick={(event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      onSeek((event.clientX - bounds.left) / bounds.width * total);
    }} type="button">
      <span aria-hidden className="h-px w-full bg-[#A9B89D]/65" />
      <span aria-hidden className="absolute bottom-0 top-0 w-px bg-[#F4EFE5]" style={{ left: `${percent(positionMs, total)}%` }} />
    </button>
    {entry.bookmarks.map((bookmark, index) => <button data-action-id="journal.bookmark-play" aria-label={`Select and play bookmark ${index + 1}${bookmark.transcriptAnchor ? `: ${bookmark.transcriptAnchor}` : ""}`} className="absolute bottom-2 grid size-5 -translate-x-1/2 place-items-center rounded-full border border-[#D4A65D] bg-[#171B18] text-[9px] text-[#D4A65D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A65D]" data-flow-action="Select bookmark" key={bookmark.id} onClick={() => { if (onSelectBookmark) onSelectBookmark(bookmark.id); else onSeek(bookmark.timestampMs); }} style={{ left: `${percent(bookmark.timestampMs, total)}%` }} type="button">{index + 1}</button>)}
    <div className="mt-2 flex justify-between text-[10px] uppercase tracking-[0.12em] text-[#A7AAA4]"><span>Original audio timeline</span><span>{Math.round(total / 1000)} sec</span></div>
  </div>;
}
