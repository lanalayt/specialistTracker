"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { saveSettingsToCloud, loadSettingsFromCloud } from "@/lib/settingsSync";

const STORAGE_KEY = "snapSettings";

interface SnapSettings {
  chartMode: "simple" | "detailed";
}

function loadSettings(): SnapSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { chartMode: parsed.chartMode === "detailed" ? "detailed" : "simple" };
    }
  } catch {}
  return { chartMode: "simple" };
}

export default function SnapSettingsPage() {
  const [chartMode, setChartMode] = useState<"simple" | "detailed">(() => loadSettings().chartMode);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedSettings, setSavedSettings] = useState<SnapSettings>(() => loadSettings());

  useEffect(() => {
    loadSettingsFromCloud<SnapSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        if (cloud.chartMode === "simple" || cloud.chartMode === "detailed") setChartMode(cloud.chartMode);
        setSavedSettings({ chartMode: cloud.chartMode === "detailed" ? "detailed" : "simple" });
      }
    });
  }, []);

  useEffect(() => {
    setDirty(chartMode !== savedSettings.chartMode);
    if (chartMode !== savedSettings.chartMode) setSaved(false);
  }, [chartMode, savedSettings]);

  const handleSave = () => {
    const settings: SnapSettings = { chartMode };
    saveSettingsToCloud(STORAGE_KEY, settings);
    setSavedSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 p-6 max-w-5xl space-y-6">
      <h2 className="text-lg font-bold text-slate-100">Snapping Settings</h2>

      <div className="card space-y-4">
        <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Strike Zone Charting</p>
        <p className="text-xs text-muted">
          Simple mode tracks Strike/Ball only. Detailed mode adds a 3×3 grid to track exactly where the snap lands with directional arrows.
        </p>
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button
            onClick={() => setChartMode("simple")}
            className={clsx(
              "px-4 py-2 text-xs font-semibold transition-colors",
              chartMode === "simple" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
            )}
          >
            Simple
          </button>
          <button
            onClick={() => setChartMode("detailed")}
            className={clsx(
              "px-4 py-2 text-xs font-semibold transition-colors border-l border-border",
              chartMode === "detailed" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
            )}
          >
            Detailed
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
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
