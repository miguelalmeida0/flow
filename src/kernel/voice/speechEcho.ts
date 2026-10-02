// Only used after a same-session, contiguous assistant echo was established.
// Never classify an independent user turn or a closed reply with this matcher.
export function echoPrefixLength(observed: string, remaining: string): number {
  const heard = observed.split(" "), expected = remaining.split(" ");
  if (heard.length < 3 || heard.length > expected.length) return 0;
  if (heard.every((word, i) => word === expected[i])) return heard.join(" ").length;
  if (heard.length < 5) return 0;
  const changed = heard.flatMap((word, i) => word === expected[i] ? [] : [i]);
  if (changed.length !== 1) return 0;
  const index = changed[0]!, a = heard[index]!, b = expected[index]!;
  if (Math.abs(a.length - b.length) > 2 || Math.max(a.length, b.length) > 64) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next.push(Math.min(next[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + Number(a[i - 1] !== b[j - 1])));
    previous = next;
  }
  return previous[b.length]! <= 2 ? expected.slice(0, heard.length).join(" ").length : 0;
}
