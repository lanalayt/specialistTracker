"use client";

import { useEffect, useRef } from "react";
import { teamGetWithTimestamp, getTeamId, getLastWriteTimestamp } from "@/lib/teamData";

const POLL_INTERVAL = 5000; // 5 seconds
// Ignore remote updates that arrive within this window of a local write
// (to avoid round-tripping our own writes back over fresh local state)
const LOCAL_WRITE_GRACE_MS = 2500;

/**
 * Polls team_data for committed data changes (history, stats, athletes).
 * Calls `onUpdate` when the remote copy has a newer timestamp than our last
 * known sync AND we haven't just written locally.
 */
export function useTeamDataSync<T>(
  dataKey: string,
  onUpdate: (data: T) => void,
  enabled = true
) {
  const lastTimestamp = useRef<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function checkOnce() {
      if (!active) return;
      const tid = getTeamId();
      if (!tid || tid === "local-dev") return;

      // Skip if we just wrote locally — our own write will come back via polling
      // and we'd briefly stomp local state.
      const localWriteAge = Date.now() - getLastWriteTimestamp(tid, dataKey);
      if (localWriteAge < LOCAL_WRITE_GRACE_MS) return;

      const result = await teamGetWithTimestamp<T>(tid, dataKey);
      if (!result || !active) return;

      if (lastTimestamp.current == null) {
        // First poll — just store the timestamp, don't apply (initial load
        // already handled this).
        lastTimestamp.current = result.updatedAt;
        return;
      }
      if (result.updatedAt !== lastTimestamp.current) {
        lastTimestamp.current = result.updatedAt;
        onUpdateRef.current(result.data);
      }
    }

    // Initial timestamp snapshot
    (async () => {
      const tid = getTeamId();
      if (!tid || tid === "local-dev") return;
      const result = await teamGetWithTimestamp<T>(tid, dataKey);
      if (result && active) lastTimestamp.current = result.updatedAt;
    })();

    interval = setInterval(checkOnce, POLL_INTERVAL);

    // Also check when tab becomes visible again
    const onVisibility = () => {
      if (document.visibilityState === "visible") checkOnce();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [dataKey, enabled]);
}
