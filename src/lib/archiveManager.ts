"use client";

import type { Session, AthleteStats, PuntAthleteStats, KickoffAthleteStats } from "@/types";
import { teamGet, teamSetImmediate, getTeamId } from "@/lib/teamData";

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

const LOCAL_KEY = "statArchives";
const TEAM_KEY = "stat_archives";

function genArchiveId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal(): StatArchive[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(archives: StatArchive[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(archives));
  } catch {}
}

export async function loadArchives(): Promise<StatArchive[]> {
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    const remote = await teamGet<StatArchive[]>(tid, TEAM_KEY);
    if (remote && Array.isArray(remote)) {
      writeLocal(remote);
      return remote;
    }
  }
  return readLocal();
}

export async function saveArchives(archives: StatArchive[]): Promise<void> {
  writeLocal(archives);
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    await teamSetImmediate(tid, TEAM_KEY, archives);
  }
}

export async function createArchive(
  name: string,
  fg: ArchivedPhaseData<AthleteStats>,
  punt: ArchivedPhaseData<PuntAthleteStats>,
  kickoff: ArchivedPhaseData<KickoffAthleteStats>
): Promise<StatArchive> {
  const existing = await loadArchives();
  const archive: StatArchive = {
    id: genArchiveId(),
    name: name.trim() || `Archive ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    fg,
    punt,
    kickoff,
  };
  const next = [...existing, archive];
  await saveArchives(next);
  return archive;
}

export async function deleteArchive(id: string): Promise<void> {
  const existing = await loadArchives();
  const next = existing.filter((a) => a.id !== id);
  await saveArchives(next);
}
