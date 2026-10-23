// Session entries are saved in the order they were logged, which drifts from
// the kick order when reps are logged out of order or inserted mid-session.
// Sort by kickNum (first kick → last); entries without one keep their slot.
export function sortByKickNum<T extends { kickNum?: number }>(entries: T[]): T[] {
  return entries
    .map((e, i) => ({ e, n: e.kickNum ?? i + 1, i }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map(({ e }) => e);
}
