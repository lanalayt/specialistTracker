import { getCachedSettings } from "@/lib/settingsSync";

// Colors a coach can assign to a punt type (Punt Settings) — used for that
// type's flight line on the game field charts.
export const DEFAULT_PUNT_ARC_COLOR = "#06b6d4";

export const PUNT_TYPE_COLORS: { value: string; name: string }[] = [
  { value: "#06b6d4", name: "Cyan" },
  { value: "#3b82f6", name: "Blue" },
  { value: "#ef4444", name: "Red" },
  { value: "#22c55e", name: "Green" },
  { value: "#eab308", name: "Yellow" },
  { value: "#f97316", name: "Orange" },
  { value: "#a855f7", name: "Purple" },
  { value: "#ec4899", name: "Pink" },
  { value: "#f8fafc", name: "White" },
];

// Type id → assigned color, from the saved punt settings.
export function loadPuntTypeColors(): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    const parsed = getCachedSettings<{ puntTypes?: { id: string; color?: string }[] }>("puntSettings");
    (parsed?.puntTypes ?? []).forEach((t) => { if (t.color) map[t.id] = t.color; });
  } catch {}
  return map;
}
