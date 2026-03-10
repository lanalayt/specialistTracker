"use client";

import { useEffect, useRef } from "react";
import { teamGetWithTimestamp } from "@/lib/teamData";
import { getTeamId } from "@/lib/teamData";

const POLL_INTERVAL = 5000; // 5 seconds

/**
 * Polls team_data for draft changes and calls `onUpdate` when remote data
 * has been updated by another device or account.
 */
export function useTeamDraftSync<T>(
  dataKey: string,
  onUpdate: (data: T) => void,
  enabled = true
) {
  const lastTimestamp = useRef<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    const teamId = getTeamId();
    if (!teamId || teamId === "local-dev") return;

    let active = true;

    // Initialize timestamp
    teamGetWithTimestamp<T>(teamId, dataKey).then((result) => {
      if (result && active) {
        lastTimestamp.current = result.updatedAt;
      }
    });

    const interval = setInterval(async () => {
      if (!active) return;
      const tid = getTeamId();
      if (!tid || tid === "local-dev") return;

      const result = await teamGetWithTimestamp<T>(tid, dataKey);
      if (!result || !active) return;

      if (lastTimestamp.current && result.updatedAt !== lastTimestamp.current) {
        lastTimestamp.current = result.updatedAt;
        onUpdateRef.current(result.data);
      } else if (!lastTimestamp.current) {
        lastTimestamp.current = result.updatedAt;
      }
    }, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [dataKey, enabled]);
}
