"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";

const SNAP_DISTANCES = ["6", "7", "8"];
const STORAGE_KEY = "fgSettings";

interface FGSettings {
  snapDistance: string;
  makeMode: "simple" | "detailed";
  missMode: "simple" | "detailed";
}

const DEFAULT_SETTINGS: FGSettings = { snapDistance: "7", makeMode: "detailed", missMode: "detailed" };

function loadSettingsLocal(): FGSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        snapDistance: parsed.snapDistance ?? "7",
        makeMode: parsed.makeMode ?? "detailed",
        missMode: parsed.missMode ?? "detailed",
      };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export default function FGSettingsPage() {
  const [snapDistance, setSnapDistance] = useState("7");
  const [makeMode, setMakeMode] = useState<"simple" | "detailed">("detailed");
  const [missMode, setMissMode] = useState<"simple" | "detailed">("detailed");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Track what was last saved so we can detect changes
  const [savedSettings, setSavedSettings] = useState<FGSettings>({
    snapDistance: "7",
    makeMode: "detailed",
    missMode: "detailed",
  });

  useEffect(() => {
    // Load from localStorage immediately, then try cloud
    const local = loadSettingsLocal();
    setSnapDistance(local.snapDistance);
    setMakeMode(local.makeMode);
    setMissMode(local.missMode);
    setSavedSettings(local);
    setLoaded(true);

    // Try loading from Supabase (overrides if found)
    loadSettingsFromCloud<FGSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        setSnapDistance(cloud.snapDistance ?? "7");
        setMakeMode(cloud.makeMode ?? "detailed");
        setMissMode(cloud.missMode ?? "detailed");
        setSavedSettings(cloud);
      }
    });
  }, []);

  // Detect unsaved changes
  useEffect(() => {
    if (!loaded) return;
    const changed =
      snapDistance !== savedSettings.snapDistance ||
      makeMode !== savedSettings.makeMode ||
      missMode !== savedSettings.missMode;
    setDirty(changed);
    if (changed) setSaved(false);
  }, [snapDistance, makeMode, missMode, savedSettings, loaded]);

  const handleSave = () => {
    const settings: FGSettings = { snapDistance, makeMode, missMode };
    saveSettingsToCloud(STORAGE_KEY, settings);
    setSavedSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 p-6 max-w-lg space-y-6">
      <h2 className="text-lg font-bold text-slate-100">FG Settings</h2>

      <div className="card space-y-3">
        <p className="label">Snap Distance</p>
        <div className="flex gap-2">
          {SNAP_DISTANCES.map((d) => (
            <button
              key={d}
              onClick={() => setSnapDistance(d)}
              className={clsx(
                "flex-1 py-3 rounded-input text-sm font-bold transition-all",
                snapDistance === d
                  ? "bg-accent text-slate-900"
                  : "bg-surface-2 text-muted border border-border hover:text-white hover:border-accent/50"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-3">
        <p className="label">Make Tracking</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMakeMode("simple")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              makeMode === "simple"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-white"
            )}
          >
            <span className="block text-base mb-1">Simple</span>
            <span className="block text-[10px] font-normal text-muted">
              ✓ GOOD
            </span>
          </button>
          <button
            onClick={() => setMakeMode("detailed")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              makeMode === "detailed"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-white"
            )}
          >
            <span className="block text-base mb-1">Detailed</span>
            <span className="block text-[10px] font-normal text-muted">
              ← GOOD &nbsp; ✓ GOOD &nbsp; GOOD →
            </span>
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <p className="label">Miss Tracking</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setMissMode("simple")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              missMode === "simple"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-white"
            )}
          >
            <span className="block text-base mb-1">Simple</span>
            <span className="block text-[10px] font-normal text-muted">
              ✗ MISS
            </span>
          </button>
          <button
            onClick={() => setMissMode("detailed")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              missMode === "detailed"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-white"
            )}
          >
            <span className="block text-base mb-1">Detailed</span>
            <span className="block text-[10px] font-normal text-muted">
              ← MISS &nbsp; ↓ SHORT &nbsp; MISS →
            </span>
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
