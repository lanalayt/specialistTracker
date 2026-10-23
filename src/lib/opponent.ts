// Game opponents are stored as a single string with the home/away marker
// baked in: "vs Mesa" (home) or "@ Mesa" (away). Older sessions saved the bare
// team name, which reads as a home game.

export function parseOpponent(value: string | undefined | null): { away: boolean; name: string } {
  const v = (value ?? "").trim();
  if (v.startsWith("@")) return { away: true, name: v.slice(1).trim() };
  const m = v.match(/^vs\.?\s+(.*)$/i);
  if (m) return { away: false, name: m[1].trim() };
  return { away: false, name: v };
}

export function buildOpponent(away: boolean, name: string): string {
  const n = name.trim();
  if (!n) return "";
  return away ? `@ ${n}` : `vs ${n}`;
}

// Display form: "@ Mesa" or "vs Mesa" (legacy bare names get "vs").
export function formatOpponent(value: string | undefined | null): string {
  const { away, name } = parseOpponent(value);
  return buildOpponent(away, name);
}
