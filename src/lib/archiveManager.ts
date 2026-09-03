"use client";

import type { Session, AthleteStats, PuntAthleteStats, KickoffAthleteStats, StatScope } from "@/types";
import { getTeamId } from "@/lib/teamData";
import { insertArchive, loadArchives as loadFromStore, deleteArchive as deleteFromStore, type StoredArchive } from "@/lib/archiveStore";

/**
 * An archive is a point-in-time snapshot of stats and history across FG, punt,
 * and kickoff phases. It is stored with a user-supplied name so coaches can
 * roll over stats at the end of a season/period and still view the historical
 * data later.
 *
 * An archive covers one scope: practice sessions, game sessions, or both, so a
 * coach can roll practice over between camps without losing the game log (or
 * the other way round).
 */

export interface ArchivedPhaseData<S> {
  athletes: string[];
  stats: Record<string, S>;
  history: Session[];
  /**
   * The archive's scope, repeated on each phase. The archives table has no
   * scope column, so it rides along inside the phase JSON instead — all three
   * carry the same value, and an archive saved before scopes existed has none
   * and reads back as "all".
   */
  scope?: StatScope;
}

export interface StatArchive {
  id: string;
  name: string;
  createdAt: string; // ISO
  scope: StatScope;
  fg: ArchivedPhaseData<AthleteStats>;
  punt: ArchivedPhaseData<PuntAthleteStats>;
  kickoff: ArchivedPhaseData<KickoffAthleteStats>;
}

export const SCOPE_LABELS: Record<StatScope, string> = {
  all: "All stats",
  practice: "Practice stats",
  game: "Game stats",
};

function genArchiveId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadArchives(): Promise<StatArchive[]> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return [];
  {
    const stored = await loadFromStore(tid);
    return stored.map((s) => {
      const fg = (s.fg as unknown as ArchivedPhaseData<AthleteStats>) ?? { athletes: [], stats: {}, history: [] };
      const punt = (s.punt as unknown as ArchivedPhaseData<PuntAthleteStats>) ?? { athletes: [], stats: {}, history: [] };
      const kickoff = (s.kickoff as unknown as ArchivedPhaseData<KickoffAthleteStats>) ?? { athletes: [], stats: {}, history: [] };
      return {
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        // Archives saved before scopes existed cover everything.
        scope: fg.scope ?? punt.scope ?? kickoff.scope ?? "all",
        fg,
        punt,
        kickoff,
      };
    });
  }
}

export async function createArchive(
  name: string,
  scope: StatScope,
  fg: ArchivedPhaseData<AthleteStats>,
  punt: ArchivedPhaseData<PuntAthleteStats>,
  kickoff: ArchivedPhaseData<KickoffAthleteStats>
): Promise<StatArchive> {
  const archive: StatArchive = {
    id: genArchiveId(),
    name: name.trim() || `Archive ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    scope,
    fg: { ...fg, scope },
    punt: { ...punt, scope },
    kickoff: { ...kickoff, scope },
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
  }

  return archive;
}

export async function deleteArchive(id: string): Promise<void> {
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    await deleteFromStore(tid, id);
  }
}
