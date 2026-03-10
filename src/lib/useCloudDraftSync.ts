"use client";

import { useEffect, useRef } from "react";
import { cloudGetWithTimestamp } from "@/lib/supabaseData";
import { getCloudUserId } from "@/lib/amplify";

const POLL_INTERVAL = 5000; // 5 seconds

/**
 * Polls Supabase for draft changes and calls `onUpdate` when remote data
 * has been updated by another device.
 *
 * @param cloudKey  - The Supabase data_key (e.g. "fg_session_draft")
 * @param onUpdate  - Callback with the new draft data when a remote change is detected
 * @param enabled   - Set false to pause polling (e.g. when the user is actively typing)
 */
export function useCloudDraftSync<T>(
  cloudKey: string,
  onUpdate: (data: T) => void,
  enabled = true
) {
  const lastTimestamp = useRef<string | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled) return;

    const userId = getCloudUserId();
    if (!userId || userId === "local-dev") return;

    // Initialize timestamp from current cloud state
    let active = true;
    cloudGetWithTimestamp<T>(userId, cloudKey).then((result) => {
      if (result && active) {
        lastTimestamp.current = result.updatedAt;
      }
    });

    const interval = setInterval(async () => {
      if (!active) return;
      const uid = getCloudUserId();
      if (!uid || uid === "local-dev") return;

      const result = await cloudGetWithTimestamp<T>(uid, cloudKey);
      if (!result || !active) return;

      // If timestamp changed, another device wrote new data
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
  }, [cloudKey, enabled]);
}
