"use client";

import type { Session, AthleteStats, PuntAthleteStats, KickoffAthleteStats } from "@/types";
import { getTeamId } from "@/lib/teamData";
import { insertArchive, loadArchives as loadFromStore, deleteArchive as deleteFromStore, type StoredArchive } from "@/lib/archiveStore";

/**
 * An archive is a point-in-time snapshot of all stats and history across
 * FG, punt, and kickoff phases. It is stored with a user-supplied name so
 * coaches can roll over stats at the end of a season/period and still view
 * the historical data later.
 */

export interface ArchivedPhaseData<S> {
  athletes: string[];
  stats: Record<string, S>;
  history: Session[];
}

export interface StatArchive {
  id: string;
  name: string;
  createdAt: string; // ISO
  fg: ArchivedPhaseData<AthleteStats>;
  punt: ArchivedPhaseData<PuntAthleteStats>;
  kickoff: ArchivedPhaseData<KickoffAthleteStats>;
}

function genArchiveId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadArchives(): Promise<StatArchive[]> {
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    const stored = await loadFromStore(tid);
    return stored.map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      fg: (s.fg as unknown as ArchivedPhaseData<AthleteStats>) ?? { athletes: [], stats: {}, history: [] },
      punt: (s.punt as unknown as ArchivedPhaseData<PuntAthleteStats>) ?? { athletes: [], stats: {}, history: [] },
      kickoff: (s.kickoff as unknown as ArchivedPhaseData<KickoffAthleteStats>) ?? { athletes: [], stats: {}, history: [] },
    }));
  }
  // Fallback to localStorage
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("statArchives");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function createArchive(
  name: string,
  fg: ArchivedPhaseData<AthleteStats>,
  punt: ArchivedPhaseData<PuntAthleteStats>,
  kickoff: ArchivedPhaseData<KickoffAthleteStats>
): Promise<StatArchive> {
  const archive: StatArchive = {
    id: genArchiveId(),
    name: name.trim() || `Archive ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    fg,
    punt,
    kickoff,
  };

  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    await insertArchive(tid, {
      id: archive.id,
      name: archive.name,
      createdAt: archive.createdAt,
      fg: archive.fg as unknown as Record<string, unknown>,
      punt: archive.punt as unknown as Record<string, unknown>,
      kickoff: archive.kickoff as unknown as Record<string, unknown>,
    });
  } else {
    // Fallback localStorage
    const existing = await loadArchives();
    const next = [...existing, archive];
    try { localStorage.setItem("statArchives", JSON.stringify(next)); } catch {}
  }

  return archive;
}

export async function deleteArchive(id: string): Promise<void> {
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    await deleteFromStore(tid, id);
  } else {
    const existing = await loadArchives();
    const next = existing.filter((a) => a.id !== id);
    try { localStorage.setItem("statArchives", JSON.stringify(next)); } catch {}
  }
}
