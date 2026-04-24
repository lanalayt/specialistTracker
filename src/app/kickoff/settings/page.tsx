"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";
import { Tooltip } from "@/components/ui/Tooltip";

const STORAGE_KEY = "kickoffSettings";

export type DirectionMode = "numeric" | "field";
export type KODistMetric = "distance" | "yardline" | "none";

export interface KOTypeConfig {
  id: string;
  label: string;
  metric: KODistMetric;
  hangTime: boolean;
}

interface KickoffSettings {
  kickoffTypes: KOTypeConfig[];
  directionMode: DirectionMode;
  directionMetrics: { id: string; label: string }[];
}

const DEFAULT_TYPES: KOTypeConfig[] = [
  { id: "BLUE", label: "Blue", metric: "distance", hangTime: true },
  { id: "RED", label: "Red", metric: "distance", hangTime: true },
  { id: "SQUIB", label: "Squib", metric: "distance", hangTime: false },
  { id: "SKY", label: "Sky", metric: "distance", hangTime: true },
  { id: "ONSIDE", label: "Onside", metric: "none", hangTime: false },
];

const NUMERIC_DIRECTIONS = [
  { id: "1", label: "1.0" },
  { id: "0.5", label: "0.5" },
  { id: "OB", label: "OB" },
];

const FIELD_DIRECTIONS = [
  { id: "SL-NUM", label: "Sideline-Numbers" },
  { id: "NUM-HASH", label: "Numbers-Hash" },
  { id: "TO_FIELD", label: "To The Field" },
  { id: "OB", label: "OB" },
];

function migrateType(t: Record<string, unknown>): KOTypeConfig {
  return {
    id: t.id as string,
    label: t.label as string,
    metric: (t.metric as KODistMetric) ?? "distance",
    hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
  };
}

function loadSettings(): KickoffSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawTypes = parsed.kickoffTypes?.length > 0 ? parsed.kickoffTypes : DEFAULT_TYPES;
      return {
        kickoffTypes: rawTypes.map((t: Record<string, unknown>) => migrateType(t)),
        directionMode: parsed.directionMode === "field" ? "field" : "numeric",
        directionMetrics: parsed.directionMetrics?.length > 0 ? parsed.directionMetrics : NUMERIC_DIRECTIONS,
      };
    }
  } catch {}
  return { kickoffTypes: DEFAULT_TYPES, directionMode: "numeric", directionMetrics: NUMERIC_DIRECTIONS };
}

export default function KickoffSettingsPage() {
  const [types, setTypes] = useState<KOTypeConfig[]>(DEFAULT_TYPES);
  const [dirMode, setDirMode] = useState<DirectionMode>("numeric");
  const [directions, setDirections] = useState<{ id: string; label: string }[]>(NUMERIC_DIRECTIONS);
  const [newType, setNewType] = useState("");
  const [newDir, setNewDir] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedSettings, setSavedSettings] = useState<KickoffSettings>({
    kickoffTypes: DEFAULT_TYPES,
    directionMode: "numeric",
    directionMetrics: NUMERIC_DIRECTIONS,
  });

  useEffect(() => {
    const s = loadSettings();
    setTypes(s.kickoffTypes);
    setDirMode(s.directionMode);
    setDirections(s.directionMetrics);
    setSavedSettings(s);
    setLoaded(true);

    loadSettingsFromCloud<KickoffSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        if (cloud.kickoffTypes?.length > 0) {
          const migrated = (cloud.kickoffTypes as unknown as Record<string, unknown>[]).map(migrateType);
          setTypes(migrated);
        }
        if (cloud.directionMode) setDirMode(cloud.directionMode);
        if (cloud.directionMetrics?.length > 0) setDirections(cloud.directionMetrics);
        setSavedSettings({
          kickoffTypes: cloud.kickoffTypes?.length > 0
            ? (cloud.kickoffTypes as unknown as Record<string, unknown>[]).map(migrateType)
            : DEFAULT_TYPES,
          directionMode: cloud.directionMode || "numeric",
          directionMetrics: cloud.directionMetrics?.length > 0 ? cloud.directionMetrics : NUMERIC_DIRECTIONS,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const changed =
      JSON.stringify(types) !== JSON.stringify(savedSettings.kickoffTypes) ||
      dirMode !== savedSettings.directionMode ||
      JSON.stringify(directions) !== JSON.stringify(savedSettings.directionMetrics);
    setDirty(changed);
    if (changed) setSaved(false);
  }, [types, dirMode, directions, savedSettings, loaded]);

  const handleDirModeChange = (mode: DirectionMode) => {
    setDirMode(mode);
    setDirections(mode === "field" ? FIELD_DIRECTIONS : NUMERIC_DIRECTIONS);
  };

  const handleAddType = () => {
    const trimmed = newType.trim();
    if (!trimmed) return;
    const id = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (types.some((t) => t.id === id)) return;
    setTypes([...types, { id, label: trimmed, metric: "distance", hangTime: true }]);
    setNewType("");
  };

  const handleAddDir = () => {
    const trimmed = newDir.trim();
    if (!trimmed) return;
    const id = trimmed.toUpperCase().replace(/[^A-Z0-9.]/g, "_");
    if (directions.some((d) => d.id === id)) return;
    setDirections([...directions, { id, label: trimmed }]);
    setNewDir("");
  };

  const handleSave = () => {
    const settings: KickoffSettings = { kickoffTypes: types, directionMode: dirMode, directionMetrics: directions };
    saveSettingsToCloud(STORAGE_KEY, settings);
    setSavedSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 p-6 max-w-5xl space-y-6">
      <h2 className="text-lg font-bold text-slate-100">KO Settings</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
      <div className="card space-y-4">
        <p className="label">Kickoff Types<Tooltip text="Configure the types of kickoffs you track. Each type can measure distance, yard line, or neither, and optionally track hang time." /></p>
        <div className="space-y-3">
          {types.map((t) => (
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
              <div className="flex items-center gap-4 flex-wrap">
                {/* Metric toggle */}
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
                    <button
                      onClick={() => setTypes(types.map((x) => x.id === t.id ? { ...x, metric: "none" } : x))}
                      className={clsx(
                        "px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border",
                        t.metric === "none" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                      )}
                    >
                      None
                    </button>
                  </div>
                </div>
                {/* Hang time checkbox */}
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
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddType();
            }}
            placeholder="Add new type..."
            className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
          />
          <button
            onClick={handleAddType}
            disabled={!newType.trim()}
            className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      </div>

      </div>
      <div className="space-y-4">
      <div className="card space-y-4">
        <p className="label">Direction System<Tooltip text="Numeric uses a percentage-based score. Field-based lets you define custom direction zones to track where each kickoff lands." /></p>
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
        <p className="text-[10px] text-muted">
          {dirMode === "numeric"
            ? "Numeric scoring (1.0, 0.5, OB) — calculates a direction percentage."
            : "Field zones (Sideline-Numbers, Numbers-Hash, etc.) — shows % breakdown by zone."}
        </p>

        <p className="label mt-2">Direction Options<Tooltip text="Customize the direction options available when logging kickoffs. Add or remove options to match your grading system." /></p>
        <div className="space-y-2">
          {directions.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <input
                type="text"
                value={d.label}
                onChange={(e) => setDirections(directions.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all"
              />
              <button
                onClick={() => setDirections(directions.filter((x) => x.id !== d.id))}
                className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm"
                title="Remove metric"
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
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddDir();
            }}
            placeholder="Add new direction..."
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
