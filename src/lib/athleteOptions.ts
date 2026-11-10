// Roster names for an athlete dropdown, plus the row's current athlete if they
// are no longer on this phase's roster — so taking someone off a phase never
// blanks out entries that already have their name.
export function withCurrent(names: string[], current: string | undefined | null): string[] {
  return current && !names.includes(current) ? [...names, current] : names;
}
