const cardinal: Record<string, number> = {
  zero: 0, one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

export function parseNumberWords(value: string): number | null {
  const cleaned = value.toLowerCase().replace(/-/g, " ").trim();
  if (/^\d+$/.test(cleaned)) return Number(cleaned);
  const rawParts = cleaned.split(/\s+/).filter((part) => part !== "and");
  const parts = rawParts.length > 1 && (rawParts[0] === "a" || rawParts[0] === "an") ? rawParts.slice(1) : rawParts;
  if (!parts.length || parts.some((part) => cardinal[part] === undefined)) return null;
  return parts.reduce((total, part) => total + (cardinal[part] ?? 0), 0);
}

export const numberToken = "(?:\\d+|(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?)";
