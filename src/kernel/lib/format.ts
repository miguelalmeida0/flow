/** Formats a minutes-since-midnight value as a speakable 12-hour clock time, e.g. 510 -> "8:30 AM". */
export function formatMinutes(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0 ? `${hour12} ${period}` : `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}
