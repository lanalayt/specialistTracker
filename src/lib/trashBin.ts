import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import type { Session } from "@/types";

const TRASH_KEY = "deleted_sessions";
const MAX_TRASH = 50; // Keep last 50 deleted sessions

export interface TrashedSession extends Session {
  sport: "KICKING" | "PUNTING" | "KICKOFF" | "LONGSNAP";
  deletedAt: string;
}

export async function trashSession(session: Session, sport: TrashedSession["sport"]): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;
  const existing = await teamGet<TrashedSession[]>(tid, TRASH_KEY) ?? [];
  const entry: TrashedSession = { ...session, sport, deletedAt: new Date().toISOString() };
  const updated = [entry, ...existing].slice(0, MAX_TRASH);
  teamSet(tid, TRASH_KEY, updated);
}

const EXPIRY_DAYS = 7;

export async function getTrash(): Promise<TrashedSession[]> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return [];
  const all = await teamGet<TrashedSession[]>(tid, TRASH_KEY) ?? [];
  // Auto-purge sessions older than 7 days
  const cutoff = Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  const valid = all.filter((s) => new Date(s.deletedAt).getTime() > cutoff);
  if (valid.length < all.length) {
    teamSet(tid, TRASH_KEY, valid);
  }
  return valid;
}

export async function removeFromTrash(sessionId: string): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;
  const existing = await teamGet<TrashedSession[]>(tid, TRASH_KEY) ?? [];
  teamSet(tid, TRASH_KEY, existing.filter((s) => s.id !== sessionId));
}

export async function clearTrash(): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;
  teamSet(tid, TRASH_KEY, []);
}
