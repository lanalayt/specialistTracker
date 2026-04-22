"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";

const STORAGE_KEY = "kickoffSettings";

export type DirectionMode = "numeric" | "field";

interface KickoffSettings {
  kickoffTypes: { id: string; label: string }[];
  directionMode: DirectionMode;
  directionMetrics: { id: string; label: string }[];
}

const DEFAULT_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "SQUIB", label: "Squib" },
  { id: "SKY", label: "Sky" },
  { id: "ONSIDE", label: "Onside" },
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

function loadSettings(): KickoffSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        kickoffTypes: parsed.kickoffTypes?.length > 0 ? parsed.kickoffTypes : DEFAULT_TYPES,
        directionMode: parsed.directionMode === "field" ? "field" : "numeric",
        directionMetrics: parsed.directionMetrics?.length > 0 ? parsed.directionMetrics : NUMERIC_DIRECTIONS,
      };
    }
  } catch {}
  return { kickoffTypes: DEFAULT_TYPES, directionMode: "numeric", directionMetrics: NUMERIC_DIRECTIONS };
}

export default function KickoffSettingsPage() {
  const [types, setTypes] = useState<{ id: string; label: string }[]>(DEFAULT_TYPES);
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
        if (cloud.kickoffTypes?.length > 0) setTypes(cloud.kickoffTypes);
        if (cloud.directionMode) setDirMode(cloud.directionMode);
        if (cloud.directionMetrics?.length > 0) setDirections(cloud.directionMetrics);
        setSavedSettings({
          kickoffTypes: cloud.kickoffTypes?.length > 0 ? cloud.kickoffTypes : DEFAULT_TYPES,
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
    setTypes([...types, { id, label: trimmed }]);
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
    <div className="flex-1 p-6 max-w-lg space-y-6">
      <h2 className="text-lg font-bold text-slate-100">KO Settings</h2>

      <div className="card space-y-4">
        <p className="label">Kickoff Types</p>
        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
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

      <div className="card space-y-4">
        <p className="label">Direction System</p>
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

        <p className="label mt-2">Direction Options</p>
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
