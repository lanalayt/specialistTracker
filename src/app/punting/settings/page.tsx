"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";

const STORAGE_KEY = "puntSettings";

export type DirectionMode = "numeric" | "field";

interface PuntSettings {
  puntTypes: { id: string; label: string }[];
  directionEnabled: boolean;
  directionMode: DirectionMode;
  directionOptions: { id: string; label: string }[];
}

const DEFAULT_TYPES = [
  { id: "DIR_LEFT", label: "Left" },
  { id: "DIR_STRAIGHT", label: "Straight" },
  { id: "DIR_RIGHT", label: "Right" },
  { id: "POOCH_LEFT", label: "Pooch Left" },
  { id: "POOCH_MIDDLE", label: "Pooch Middle" },
  { id: "POOCH_RIGHT", label: "Pooch Right" },
  { id: "RUGBY", label: "Rugby" },
];

const NUMERIC_DIRECTIONS = [
  { id: "1", label: "1.0 ✓" },
  { id: "0.5", label: "0.5" },
  { id: "0", label: "0 ★" },
];

const FIELD_DIRECTIONS = [
  { id: "SL-NUM", label: "Sideline-Numbers" },
  { id: "NUM-HASH", label: "Numbers-Hash" },
  { id: "TO_FIELD", label: "To The Field" },
];

function loadSettings(): PuntSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const mode: DirectionMode = parsed.directionMode === "field" ? "field" : "numeric";
      const defaultDirs = mode === "field" ? FIELD_DIRECTIONS : NUMERIC_DIRECTIONS;
      return {
        puntTypes: parsed.puntTypes?.length > 0 ? parsed.puntTypes : DEFAULT_TYPES,
        directionEnabled: parsed.directionEnabled !== false,
        directionMode: mode,
        directionOptions: parsed.directionOptions?.length > 0 ? parsed.directionOptions : defaultDirs,
      };
    }
  } catch {}
  return { puntTypes: DEFAULT_TYPES, directionEnabled: true, directionMode: "numeric", directionOptions: NUMERIC_DIRECTIONS };
}

export default function PuntSettingsPage() {
  const [types, setTypes] = useState<{ id: string; label: string }[]>(DEFAULT_TYPES);
  const [newType, setNewType] = useState("");
  const [dirEnabled, setDirEnabled] = useState(true);
  const [dirMode, setDirMode] = useState<DirectionMode>("numeric");
  const [dirOptions, setDirOptions] = useState<{ id: string; label: string }[]>(NUMERIC_DIRECTIONS);
  const [newDir, setNewDir] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedSettings, setSavedSettings] = useState<PuntSettings>({
    puntTypes: DEFAULT_TYPES,
    directionEnabled: true,
    directionMode: "numeric",
    directionOptions: NUMERIC_DIRECTIONS,
  });

  useEffect(() => {
    const s = loadSettings();
    setTypes(s.puntTypes);
    setDirEnabled(s.directionEnabled);
    setDirMode(s.directionMode);
    setDirOptions(s.directionOptions);
    setSavedSettings(s);
    setLoaded(true);

    loadSettingsFromCloud<PuntSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        if (cloud.puntTypes?.length > 0) setTypes(cloud.puntTypes);
        if (typeof cloud.directionEnabled === "boolean") setDirEnabled(cloud.directionEnabled);
        if (cloud.directionMode) setDirMode(cloud.directionMode);
        if (cloud.directionOptions?.length > 0) setDirOptions(cloud.directionOptions);
        setSavedSettings({
          puntTypes: cloud.puntTypes?.length > 0 ? cloud.puntTypes : DEFAULT_TYPES,
          directionEnabled: cloud.directionEnabled !== false,
          directionMode: cloud.directionMode || "numeric",
          directionOptions: cloud.directionOptions?.length > 0 ? cloud.directionOptions : NUMERIC_DIRECTIONS,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const changed =
      JSON.stringify(types) !== JSON.stringify(savedSettings.puntTypes) ||
      dirEnabled !== savedSettings.directionEnabled ||
      dirMode !== savedSettings.directionMode ||
      JSON.stringify(dirOptions) !== JSON.stringify(savedSettings.directionOptions);
    setDirty(changed);
    if (changed) setSaved(false);
  }, [types, dirEnabled, dirMode, dirOptions, savedSettings, loaded]);

  const handleDirModeChange = (mode: DirectionMode) => {
    setDirMode(mode);
    setDirOptions(mode === "field" ? FIELD_DIRECTIONS : NUMERIC_DIRECTIONS);
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
    const id = trimmed.replace(/[^a-zA-Z0-9.✓★]/g, "_");
    if (dirOptions.some((d) => d.id === id)) return;
    setDirOptions([...dirOptions, { id, label: trimmed }]);
    setNewDir("");
  };

  const handleSave = () => {
    const settings: PuntSettings = { puntTypes: types, directionEnabled: dirEnabled, directionMode: dirMode, directionOptions: dirOptions };
    saveSettingsToCloud(STORAGE_KEY, settings);
    setSavedSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 p-6 max-w-lg space-y-6">
      <h2 className="text-lg font-bold text-slate-100">Punt Settings</h2>

      {/* Punt Types */}
      <div className="card space-y-4">
        <p className="label">Punt Types</p>
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
            onKeyDown={(e) => { if (e.key === "Enter") handleAddType(); }}
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

      {/* Direction Score */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Direction Score</p>
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
            {/* Direction mode toggle */}
            <div>
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
              <p className="text-[10px] text-muted mt-1.5">
                {dirMode === "numeric"
                  ? "Numeric scoring (1.0, 0.5, 0) — calculates a direction percentage."
                  : "Field zones (Sideline-Numbers, Numbers-Hash, etc.) — shows % breakdown by zone."}
              </p>
            </div>

            <p className="label">Direction Options</p>
            <div className="space-y-2">
              {dirOptions.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
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
