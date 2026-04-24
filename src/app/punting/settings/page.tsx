"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";
import { Tooltip } from "@/components/ui/Tooltip";

const STORAGE_KEY = "puntSettings";

export type DirectionMode = "numeric" | "field";

export interface PuntTypeConfig {
  id: string;
  label: string;
  category: string;
  metric: "distance" | "yardline";
  hangTime: boolean;
}

export interface PuntCategory {
  id: string;
  label: string;
  enabled: boolean;
}

interface PuntSettings {
  puntCategories: PuntCategory[];
  puntTypes: PuntTypeConfig[];
  directionEnabled: boolean;
  directionMode: DirectionMode;
  directionOptions: { id: string; label: string; score?: number }[];
  opTimeEnabled: boolean;
}

const DEFAULT_CATEGORIES: PuntCategory[] = [
  { id: "DIRECTIONAL", label: "Directional", enabled: true },
  { id: "POOCH", label: "Pooch", enabled: true },
  { id: "BANANA", label: "Banana", enabled: true },
  { id: "RUGBY", label: "Rugby", enabled: true },
];

const DEFAULT_TYPES: PuntTypeConfig[] = [
  { id: "DIR_LEFT", label: "Left", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "DIR_STRAIGHT", label: "Straight", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "DIR_RIGHT", label: "Right", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "POOCH_LEFT", label: "Pooch Left", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "POOCH_MIDDLE", label: "Pooch Middle", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "POOCH_RIGHT", label: "Pooch Right", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "BANANA_LEFT", label: "Banana Left", category: "BANANA", metric: "distance", hangTime: true },
  { id: "BANANA_RIGHT", label: "Banana Right", category: "BANANA", metric: "distance", hangTime: true },
  { id: "RUGBY", label: "Rugby", category: "RUGBY", metric: "distance", hangTime: true },
];

const NUMERIC_DIRECTIONS = [
  { id: "1", label: "1.0 ✓" },
  { id: "0.5", label: "0.5" },
  { id: "0", label: "0 ★" },
];

const FIELD_DIRECTIONS = [
  { id: "SL-NUM", label: "Sideline-Numbers", score: 1 },
  { id: "NUM-HASH", label: "Numbers-Hash", score: 0.5 },
  { id: "TO_FIELD", label: "To The Field", score: 0 },
];

function migrateType(t: Record<string, unknown>): PuntTypeConfig {
  const id = t.id as string;
  const upper = id.toUpperCase();
  let category = (t.category as string) ?? "DIRECTIONAL";
  if (!t.category) {
    if (upper.includes("POOCH")) category = "POOCH";
    else if (upper.includes("BANANA")) category = "BANANA";
    else if (upper.includes("RUGBY")) category = "RUGBY";
    else category = "DIRECTIONAL";
  }
  return {
    id,
    label: t.label as string,
    category,
    metric: (t.metric as "distance" | "yardline") ?? (upper.includes("POOCH") ? "yardline" : "distance"),
    hangTime: typeof t.hangTime === "boolean" ? t.hangTime : !upper.includes("POOCH"),
  };
}

function loadSettings(): PuntSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode: DirectionMode = parsed.directionMode === "field" ? "field" : "numeric";
      const defaultDirs = mode === "field" ? FIELD_DIRECTIONS : NUMERIC_DIRECTIONS;
      const rawTypes = parsed.puntTypes?.length > 0 ? parsed.puntTypes : DEFAULT_TYPES;
      const puntTypes = rawTypes.map((t: Record<string, unknown>) => migrateType(t));
      const puntCategories: PuntCategory[] = parsed.puntCategories?.length > 0
        ? parsed.puntCategories
        : DEFAULT_CATEGORIES;
      return {
        puntCategories,
        puntTypes,
        directionEnabled: parsed.directionEnabled !== false,
        directionMode: mode,
        directionOptions: parsed.directionOptions?.length > 0 ? parsed.directionOptions : defaultDirs,
        opTimeEnabled: parsed.opTimeEnabled !== false,
      };
    }
  } catch {}
  return {
    puntCategories: DEFAULT_CATEGORIES,
    puntTypes: DEFAULT_TYPES,
    directionEnabled: true,
    directionMode: "numeric",
    directionOptions: NUMERIC_DIRECTIONS,
    opTimeEnabled: true,
  };
}

export default function PuntSettingsPage() {
  const [categories, setCategories] = useState<PuntCategory[]>(DEFAULT_CATEGORIES);
  const [types, setTypes] = useState<PuntTypeConfig[]>(DEFAULT_TYPES);
  const [newTypes, setNewTypes] = useState<Record<string, string>>({});
  const [dirEnabled, setDirEnabled] = useState(true);
  const [dirMode, setDirMode] = useState<DirectionMode>("numeric");
  const [dirOptions, setDirOptions] = useState<{ id: string; label: string; score?: number }[]>(NUMERIC_DIRECTIONS);
  const [opTimeEnabled, setOpTimeEnabled] = useState(true);
  const [newDir, setNewDir] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedSettings, setSavedSettings] = useState<PuntSettings>({
    puntCategories: DEFAULT_CATEGORIES,
    puntTypes: DEFAULT_TYPES,
    directionEnabled: true,
    directionMode: "numeric",
    directionOptions: NUMERIC_DIRECTIONS,
    opTimeEnabled: true,
  });

  // Ensure field-based options have scores (migration for old data)
  const ensureScores = (opts: { id: string; label: string; score?: number }[], mode: DirectionMode) => {
    if (mode !== "field") return opts;
    const defaults = [1, 0.5, 0];
    return opts.map((o, i) => ({ ...o, score: o.score ?? defaults[i] ?? 0 }));
  };

  useEffect(() => {
    const s = loadSettings();
    setCategories(s.puntCategories);
    setTypes(s.puntTypes);
    setDirEnabled(s.directionEnabled);
    setDirMode(s.directionMode);
    setDirOptions(ensureScores(s.directionOptions, s.directionMode));
    setOpTimeEnabled(s.opTimeEnabled);
    setSavedSettings(s);
    setLoaded(true);

    loadSettingsFromCloud<PuntSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        if (cloud.puntCategories?.length > 0) setCategories(cloud.puntCategories);
        if (cloud.puntTypes?.length > 0) setTypes((cloud.puntTypes as unknown as Record<string, unknown>[]).map(migrateType));
        if (typeof cloud.directionEnabled === "boolean") setDirEnabled(cloud.directionEnabled);
        if (cloud.directionMode) setDirMode(cloud.directionMode);
        if (cloud.directionOptions?.length > 0) setDirOptions(ensureScores(cloud.directionOptions, cloud.directionMode || "numeric"));
        if (typeof cloud.opTimeEnabled === "boolean") setOpTimeEnabled(cloud.opTimeEnabled);
        setSavedSettings({
          puntCategories: cloud.puntCategories?.length > 0 ? cloud.puntCategories : DEFAULT_CATEGORIES,
          puntTypes: cloud.puntTypes?.length > 0 ? (cloud.puntTypes as unknown as Record<string, unknown>[]).map(migrateType) : DEFAULT_TYPES,
          directionEnabled: cloud.directionEnabled !== false,
          directionMode: cloud.directionMode || "numeric",
          directionOptions: cloud.directionOptions?.length > 0 ? cloud.directionOptions : NUMERIC_DIRECTIONS,
          opTimeEnabled: cloud.opTimeEnabled !== false,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const changed =
      JSON.stringify(categories) !== JSON.stringify(savedSettings.puntCategories) ||
      JSON.stringify(types) !== JSON.stringify(savedSettings.puntTypes) ||
      dirEnabled !== savedSettings.directionEnabled ||
      dirMode !== savedSettings.directionMode ||
      JSON.stringify(dirOptions) !== JSON.stringify(savedSettings.directionOptions) ||
      opTimeEnabled !== savedSettings.opTimeEnabled;
    setDirty(changed);
    if (changed) setSaved(false);
  }, [categories, types, dirEnabled, dirMode, dirOptions, opTimeEnabled, savedSettings, loaded]);

  const handleDirModeChange = (mode: DirectionMode) => {
    setDirMode(mode);
    setDirOptions(mode === "field" ? FIELD_DIRECTIONS : NUMERIC_DIRECTIONS);
  };

  const handleAddType = (categoryId: string) => {
    const trimmed = (newTypes[categoryId] ?? "").trim();
    if (!trimmed) return;
    const id = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (types.some((t) => t.id === id)) return;
    const catDefaults = categoryId === "POOCH"
      ? { metric: "yardline" as const, hangTime: false }
      : { metric: "distance" as const, hangTime: true };
    setTypes([...types, { id, label: trimmed, category: categoryId, ...catDefaults }]);
    setNewTypes({ ...newTypes, [categoryId]: "" });
  };

  const handleAddDir = () => {
    const trimmed = newDir.trim();
    if (!trimmed) return;
    const id = trimmed.replace(/[^a-zA-Z0-9.✓★]/g, "_");
    if (dirOptions.some((d) => d.id === id)) return;
    setDirOptions([...dirOptions, { id, label: trimmed, score: dirMode === "field" ? 0 : undefined }]);
    setNewDir("");
  };

  const handleSave = () => {
    const settings: PuntSettings = { puntCategories: categories, puntTypes: types, directionEnabled: dirEnabled, directionMode: dirMode, directionOptions: dirOptions, opTimeEnabled };
    saveSettingsToCloud(STORAGE_KEY, settings);
    setSavedSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 p-6 max-w-5xl space-y-6">
      <h2 className="text-lg font-bold text-slate-100">Punt Settings</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column: Punt Types */}
      <div className="space-y-4">
      <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Punt Types<Tooltip text="Configure the types of punts you track. Each category (Directional, Pooch, etc.) can have multiple types. Toggle categories on/off and add or remove types within each." /></p>
      {categories.map((cat) => {
        const catTypes = types.filter((t) => t.category === cat.id);
        return (
          <div key={cat.id} className="card space-y-4">
            <div className="flex items-center justify-between">
              <p className="label mb-0">{cat.label}</p>
              <button
                onClick={() => setCategories(categories.map((c) => c.id === cat.id ? { ...c, enabled: !c.enabled } : c))}
                className={clsx(
                  "relative w-11 h-6 rounded-full transition-colors",
                  cat.enabled ? "bg-accent" : "bg-border"
                )}
                aria-label={`Toggle ${cat.label}`}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                    cat.enabled ? "left-[22px]" : "left-0.5"
                  )}
                />
              </button>
            </div>
            {cat.enabled && (
              <>
                <div className="space-y-3">
                  {catTypes.map((t) => (
                    <div key={t.id} className="border border-border rounded-input p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={t.label}
                          onChange={(e) => setTypes(types.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)))}
                          className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all"
                        />
                        <button
                          onClick={() => setTypes(types.filter((x) => x.id !== t.id))}
                          className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm"
                          title="Remove type"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted">Metric:</span>
                          <div className="flex rounded border border-border overflow-hidden">
                            <button
                              onClick={() => setTypes(types.map((x) => x.id === t.id ? { ...x, metric: "distance" } : x))}
                              className={clsx(
                                "px-2 py-1 text-[10px] font-semibold transition-colors",
                                t.metric === "distance" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                              )}
                            >
                              Distance
                            </button>
                            <button
                              onClick={() => setTypes(types.map((x) => x.id === t.id ? { ...x, metric: "yardline" } : x))}
                              className={clsx(
                                "px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border",
                                t.metric === "yardline" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                              )}
                            >
                              Yard Line
                            </button>
                          </div>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={t.hangTime}
                            onChange={() => setTypes(types.map((x) => x.id === t.id ? { ...x, hangTime: !x.hangTime } : x))}
                            className="accent-accent"
                          />
                          <span className="text-[10px] text-muted">Hang Time</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTypes[cat.id] ?? ""}
                    onChange={(e) => setNewTypes({ ...newTypes, [cat.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddType(cat.id); }}
                    placeholder={`Add ${cat.label.toLowerCase()} type...`}
                    className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                  />
                  <button
                    onClick={() => handleAddType(cat.id)}
                    disabled={!(newTypes[cat.id] ?? "").trim()}
                    className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      </div>

      {/* Right column: Direction, Op Time */}
      <div className="space-y-4">
      <p className="text-sm font-bold text-slate-100 uppercase tracking-wider hidden lg:block">&nbsp;</p>
      {/* Direction Score */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Direction Score<Tooltip text="Track how accurate each punt's direction is. Score each punt as 1.0 (on target), 0.5 (close), or 0 (critical miss). Stats show your directional accuracy percentage." /></p>
          <button
            onClick={() => setDirEnabled((v) => !v)}
            className={clsx(
              "relative w-11 h-6 rounded-full transition-colors",
              dirEnabled ? "bg-accent" : "bg-border"
            )}
            aria-label="Toggle direction scoring"
          >
            <span
              className={clsx(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                dirEnabled ? "left-[22px]" : "left-0.5"
              )}
            />
          </button>
        </div>
        <p className="text-xs text-muted">
          Enable to track directional accuracy on each punt. Disable to hide direction everywhere.
        </p>
        {dirEnabled && (
          <>
            <div>
              <p className="label">Direction System<Tooltip text="Numeric uses a 0/0.5/1 scale. Field-based lets you define custom direction zones (e.g. Sideline-Numbers, Numbers-Hash)." /></p>
              <div className="flex rounded-input border border-border overflow-hidden w-fit">
                <button
                  onClick={() => handleDirModeChange("numeric")}
                  className={clsx(
                    "px-4 py-2 text-xs font-semibold transition-colors",
                    dirMode === "numeric" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                  )}
                >
                  Numeric
                </button>
                <button
                  onClick={() => handleDirModeChange("field")}
                  className={clsx(
                    "px-4 py-2 text-xs font-semibold transition-colors border-l border-border",
                    dirMode === "field" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                  )}
                >
                  Field-Based
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1.5">
                {dirMode === "numeric"
                  ? "Numeric scoring (1.0, 0.5, 0) — calculates a direction percentage."
                  : "Field zones (Sideline-Numbers, Numbers-Hash, etc.) — shows % breakdown by zone."}
              </p>
            </div>

            <p className="label">Direction Options<Tooltip text={dirMode === "numeric" ? "Fixed scoring: 1.0 (on target), 0.5 (close), 0 (critical miss)." : "Assign a point value to each zone. Direction % = total points / attempts."} /></p>
            {dirMode === "numeric" ? (
              <div className="space-y-2">
                {NUMERIC_DIRECTIONS.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <span className="flex-1 bg-surface-2 border border-border text-slate-400 px-3 py-2 rounded-input text-sm">{d.label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {dirOptions.map((d) => (
                    <div key={d.id} className="flex items-center gap-2">
                      <select
                        value={d.score ?? 0}
                        onChange={(e) => setDirOptions(dirOptions.map((x) => (x.id === d.id ? { ...x, score: parseFloat(e.target.value) } : x)))}
                        className="w-16 bg-surface-2 border border-border text-accent font-bold px-1 py-2 rounded-input text-sm text-center focus:outline-none focus:border-accent/60"
                      >
                        <option value={1}>1</option>
                        <option value={0.5}>0.5</option>
                        <option value={0}>0</option>
                        <option value={-1}>-1</option>
                      </select>
                      <input
                        type="text"
                        value={d.label}
                        onChange={(e) => setDirOptions(dirOptions.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                        className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all"
                      />
                      <button
                        onClick={() => setDirOptions(dirOptions.filter((x) => x.id !== d.id))}
                        className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm"
                        title="Remove option"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDir}
                    onChange={(e) => setNewDir(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddDir(); }}
                    placeholder="Add direction option..."
                    className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                  />
                  <button
                    onClick={handleAddDir}
                    disabled={!newDir.trim()}
                    className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Op Time toggle */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Operation Time<Tooltip text="Snap-to-punt time in seconds. Measures how fast the ball goes from the snap to off the punter's foot." /></p>
          <button
            onClick={() => setOpTimeEnabled((v) => !v)}
            className={clsx(
              "relative w-11 h-6 rounded-full transition-colors",
              opTimeEnabled ? "bg-accent" : "bg-border"
            )}
            aria-label="Toggle operation time"
          >
            <span
              className={clsx(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                opTimeEnabled ? "left-[22px]" : "left-0.5"
              )}
            />
          </button>
        </div>
        <p className="text-xs text-muted">
          Track punter operation time on each punt. Existing op time data is preserved in stats even when disabled.
        </p>
      </div>
      </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!dirty}
        className={clsx(
          "w-full py-3 rounded-input text-sm font-bold transition-all",
          saved
            ? "bg-make text-slate-900"
            : dirty
              ? "btn-primary"
              : "bg-surface-2 text-muted border border-border cursor-not-allowed"
        )}
      >
        {saved ? "✓ Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
