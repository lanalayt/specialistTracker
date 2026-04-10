"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { teamGetWithTimestamp, getTeamId, getLastWriteTimestamp } from "@/lib/teamData";

// Ignore remote updates that arrive within this window of a local write,
// so our own outgoing write doesn't bounce back over fresh local state.
const LOCAL_WRITE_GRACE_MS = 5000;
// Fallback polling interval — runs in parallel with the realtime subscription
// in case the websocket drops (offline, mobile background, etc.).
const FALLBACK_POLL_MS = 15000;

/**
 * Live-subscribes to team_data changes for a specific data_key using
 * Supabase realtime, plus a polling fallback. Calls `onUpdate` whenever
 * the remote row for the current team is inserted or updated.
 *
 * This replaces the previous polling-only implementation so cross-device
 * updates appear within a second of the write instead of depending on a
 * 5–15s interval.
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
    let intervalId: ReturnType<typeof setInterval> | null = null;
    // Give the auth/team id up to ~1s to settle before subscribing
    let retries = 0;
    const maxRetries = 10;

    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;

    function applyIfNewer(nextTs: string, nextData: T) {
      // Don't stomp on a very recent local write bouncing back
      const tid = getTeamId();
      if (tid) {
        const localWriteAge = Date.now() - getLastWriteTimestamp(tid, dataKey);
        if (localWriteAge < LOCAL_WRITE_GRACE_MS) return;
      }
      if (lastTimestamp.current && nextTs === lastTimestamp.current) return;
      lastTimestamp.current = nextTs;
      onUpdateRef.current(nextData);
    }

    async function pullLatest(initial = false) {
      if (!active) return;
      const tid = getTeamId();
      if (!tid || tid === "local-dev") return;
      try {
        const result = await teamGetWithTimestamp<T>(tid, dataKey);
        if (!result || !active) return;
        if (initial) {
          // On first successful fetch, just store the timestamp — context
          // already loaded the data at mount time.
          lastTimestamp.current = result.updatedAt;
          return;
        }
        applyIfNewer(result.updatedAt, result.data);
      } catch {
        /* ignore, fallback poll will retry */
      }
    }

    async function subscribe() {
      if (!active) return;
      const tid = getTeamId();
      if (!tid || tid === "local-dev") {
        if (retries++ < maxRetries) {
          setTimeout(subscribe, 150);
        }
        return;
      }

      // Initial snapshot so we know the current remote timestamp
      await pullLatest(true);

      // Realtime channel — listen to INSERT/UPDATE on the filtered row
      channel = supabase
        .channel(`team_data:${tid}:${dataKey}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "team_data",
            filter: `team_id=eq.${tid}`,
          },
          (payload) => {
            if (!active) return;
            // Only react to this key
            const row = (payload.new ?? payload.old) as {
              data_key?: string;
              data?: T;
              updated_at?: string;
            } | null;
            if (!row || row.data_key !== dataKey) return;
            if (row.updated_at && row.data !== undefined) {
              applyIfNewer(row.updated_at, row.data);
            } else {
              // No data in payload — fall back to a pull
              pullLatest();
            }
          }
        )
        .subscribe();

      // Fallback polling — covers the case where the websocket is dropped
      // (iOS backgrounding, flaky network, auth expired)
      intervalId = setInterval(() => pullLatest(), FALLBACK_POLL_MS);
    }

    subscribe();

    // Also re-check immediately when the tab becomes visible or window focuses
    const onVisible = () => {
      if (document.visibilityState === "visible") pullLatest();
    };
    const onFocus = () => pullLatest();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      if (channel) {
        try { supabase.removeChannel(channel); } catch {}
      }
    };
  }, [dataKey, enabled]);
}
