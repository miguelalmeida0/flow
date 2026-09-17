import { useEffect, useState } from "react";
import { tokens } from "../../shared/design-system/tokens";
import { DAY_END, DAY_START, MINUTE_HEIGHT, formatTime } from "./time";

function minutesInDay(value: Date) {
  return value.getHours() * 60 + value.getMinutes();
}

const systemNow = () => new Date();

export function CurrentTimeMarker({ now = systemNow }: { now?: () => Date }) {
  const [current, setCurrent] = useState(() => minutesInDay(now()));

  useEffect(() => {
    let timeout: number | undefined;
    const schedule = () => {
      window.clearTimeout(timeout);
      if (document.visibilityState === "hidden") return;
      const value = now();
      setCurrent(minutesInDay(value));
      const untilNextMinute = 60_000 - (value.getSeconds() * 1_000 + value.getMilliseconds());
      timeout = window.setTimeout(schedule, Math.max(50, untilNextMinute));
    };
    const visibility = () => schedule();
    schedule();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [now]);

  if (current < DAY_START || current > DAY_END) return null;
  return (
    <div className="pointer-events-none absolute left-0 right-0 z-20 flex items-center" data-current-minute={current} style={{ top: (current - DAY_START) * MINUTE_HEIGHT }}>
      <span className={`-ml-1 size-2 rounded-full ${tokens.timeline.nowDot}`} />
      <span className={`ml-2 h-px flex-1 ${tokens.timeline.nowLine}`} />
      <span className={`ml-2 text-[10px] font-semibold tabular-nums ${tokens.timeline.nowText}`}>Now {formatTime(current)}</span>
    </div>
  );
}
