import { cloudGet, cloudSet } from "@/lib/supabaseData";
import { getCloudUserId } from "@/lib/amplify";

/**
 * Load a settings object from Supabase first, falling back to localStorage.
 */
export async function loadSettingsFromCloud<T>(localKey: string): Promise<T | null> {
  const userId = getCloudUserId();
  if (userId && userId !== "local-dev") {
    try {
      const cloud = await cloudGet<T>(userId, `settings_${localKey}`);
      if (cloud) return cloud;
    } catch {}
  }

  // Fall back to localStorage
  try {
    const raw = localStorage.getItem(localKey);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

/**
 * Save a settings object to both localStorage and Supabase.
 */
export function saveSettingsToCloud<T>(localKey: string, data: T): void {
  // Always write to localStorage
  localStorage.setItem(localKey, JSON.stringify(data));

  // Also sync to Supabase
  const userId = getCloudUserId();
  if (userId && userId !== "local-dev") {
    cloudSet(userId, `settings_${localKey}`, data);
  }
}
