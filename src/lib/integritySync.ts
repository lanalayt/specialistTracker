import { getTeamId } from "@/lib/teamData";
import { localGet } from "@/lib/amplify";
import { insertSession, loadSessions } from "@/lib/sessionStore";
import type { Session } from "@/types";

interface SportData {
  athletes: string[];
  stats: Record<string, unknown>;
  history: Session[];
  snapshot?: unknown;
}

const SPORT_KEYS = [
  { local: "FG" as const, cloud: "fg_data", sport: "KICKING" },
  { local: "PUNT" as const, cloud: "punt_data", sport: "PUNTING" },
  { local: "KICKOFF" as const, cloud: "kickoff_data", sport: "KICKOFF" },
  { local: "LONGSNAP" as const, cloud: "longsnap_data", sport: "LONGSNAP" },
];

/**
 * Compare localStorage sessions with the sessions table.
 * If localStorage has sessions that the table doesn't, insert them.
 * This is a safety net that catches any writes that failed to reach Supabase.
 */
export async function runIntegritySync(): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;

  for (const { local, sport } of SPORT_KEYS) {
    try {
      const localData = localGet<SportData>(local);
      if (!localData?.history?.length) continue;

      const dbSessions = await loadSessions(tid, sport);
      const dbIds = new Set(dbSessions.map((s) => s.id));

      const missingFromDb = localData.history.filter((s) => !dbIds.has(s.id));

      if (missingFromDb.length > 0) {
        console.warn(
          `[IntegritySync] ${sport}: ${missingFromDb.length} session(s) missing from DB. Inserting now.`
        );
        for (const s of missingFromDb) {
          await insertSession(tid, { ...s, sport: sport as Session["sport"], teamId: tid });
        }
      }
    } catch (err) {
      console.warn(`[IntegritySync] Failed for ${sport}:`, err);
    }
  }
}

/**
 * Verify a single session was written to the DB.
 * Call this after committing a session as a safety check.
 */
export async function verifyCloudWrite(
  sport: string,
  expectedSessionId: string,
  session: Session
): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;

  // Wait a moment for the write to propagate
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const dbSessions = await loadSessions(tid, sport);
    if (!dbSessions.some((s) => s.id === expectedSessionId)) {
      console.warn(
        `[IntegritySync] Session ${expectedSessionId} NOT found in DB after commit. Re-inserting.`
      );
      await insertSession(tid, { ...session, sport: sport as Session["sport"], teamId: tid });
    }
  } catch (err) {
    console.warn(`[IntegritySync] Verify failed for ${sport}:`, err);
  }
}
