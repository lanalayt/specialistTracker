import type { Session } from "@/types";

/**
 * Merge two session history arrays by taking the union of both, keyed by session ID.
 * If a session exists in both, prefer the version with more entries (or the remote
 * version if entry counts are equal, since it may have edits).
 *
 * This ensures that syncing NEVER loses committed sessions — the history can only
 * grow, never shrink, unless a session is explicitly deleted.
 */
export function mergeHistory(local: Session[], remote: Session[]): Session[] {
  const map = new Map<string, Session>();

  // Start with all local sessions
  for (const s of local) {
    map.set(s.id, s);
  }

  // Merge in remote sessions
  for (const s of remote) {
    const existing = map.get(s.id);
    if (!existing) {
      // New session from remote — add it
      map.set(s.id, s);
    } else {
      // Session exists in both — keep the one with more entries (more complete),
      // or prefer remote if equal (it may contain edits like date/weather changes)
      const localEntries = Array.isArray(existing.entries) ? existing.entries.length : 0;
      const remoteEntries = Array.isArray(s.entries) ? s.entries.length : 0;
      if (remoteEntries >= localEntries) {
        map.set(s.id, s);
      }
    }
  }

  // Sort by date ascending
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
