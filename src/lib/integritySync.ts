import { teamGet, teamSetImmediate, getTeamId } from "@/lib/teamData";
import { localGet } from "@/lib/amplify";
import { mergeHistory } from "@/lib/mergeHistory";
import type { Session } from "@/types";

interface SportData {
  athletes: string[];
  stats: Record<string, unknown>;
  history: Session[];
  snapshot?: unknown;
}

const SPORT_KEYS = [
  { local: "FG" as const, cloud: "fg_data" },
  { local: "PUNT" as const, cloud: "punt_data" },
  { local: "KICKOFF" as const, cloud: "kickoff_data" },
  { local: "LONGSNAP" as const, cloud: "longsnap_data" },
];

/**
 * Compare localStorage with Supabase team_data for each sport.
 * If localStorage has sessions that the cloud doesn't, merge them
 * into the cloud immediately. This is a safety net that catches
 * any writes that failed to reach Supabase.
 */
export async function runIntegritySync(): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;

  for (const { local, cloud } of SPORT_KEYS) {
    try {
      const localData = localGet<SportData>(local);
      if (!localData?.history?.length) continue;

      const remoteData = await teamGet<SportData>(tid, cloud);
      const remoteHistory = remoteData?.history ?? [];

      // Check if local has sessions that remote doesn't
      const remoteIds = new Set(remoteHistory.map((s) => s.id));
      const missingFromCloud = localData.history.filter((s) => !remoteIds.has(s.id));

      if (missingFromCloud.length > 0) {
        console.warn(
          `[IntegritySync] ${cloud}: ${missingFromCloud.length} session(s) missing from cloud. Pushing now.`
        );
        const mergedHistory = mergeHistory(remoteHistory, localData.history);
        const merged: SportData = {
          ...(remoteData ?? localData),
          history: mergedHistory,
          // Merge athlete lists
          athletes: Array.from(
            new Set([
              ...(remoteData?.athletes ?? []),
              ...(localData.athletes ?? []),
            ])
          ),
        };
        await teamSetImmediate(tid, cloud, merged);
      }
    } catch (err) {
      console.warn(`[IntegritySync] Failed for ${cloud}:`, err);
    }
  }
}

/**
 * Verify a single sport's data was written to the cloud.
 * Call this after committing a session as a safety check.
 */
export async function verifyCloudWrite(
  cloudKey: string,
  expectedSessionId: string,
  localData: SportData
): Promise<void> {
  const tid = getTeamId();
  if (!tid || tid === "local-dev") return;

  // Wait a moment for the write to propagate
  await new Promise((r) => setTimeout(r, 2000));

  try {
    const remote = await teamGet<SportData>(tid, cloudKey);
    if (!remote?.history?.some((s) => s.id === expectedSessionId)) {
      console.warn(
        `[IntegritySync] Session ${expectedSessionId} NOT found in cloud after commit. Re-pushing.`
      );
      const mergedHistory = mergeHistory(remote?.history ?? [], localData.history);
      const merged: SportData = {
        ...(remote ?? localData),
        history: mergedHistory,
        athletes: Array.from(
          new Set([...(remote?.athletes ?? []), ...(localData.athletes ?? [])])
        ),
      };
      await teamSetImmediate(tid, cloudKey, merged);
    }
  } catch (err) {
    console.warn(`[IntegritySync] Verify failed for ${cloudKey}:`, err);
  }
}
