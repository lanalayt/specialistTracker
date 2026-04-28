"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { saveSettingsToCloud, loadSettingsFromCloud } from "@/lib/settingsSync";

const STORAGE_KEY = "snapSettings";

interface SnapSettings {
  chartMode: "simple" | "detailed";
  missMode: "simple" | "detailed";
  shortSnapTime: boolean;
}

function loadSettings(): SnapSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        chartMode: parsed.chartMode === "detailed" ? "detailed" : "simple",
        missMode: parsed.missMode === "detailed" ? "detailed" : "simple",
        shortSnapTime: parsed.shortSnapTime === true,
      };
    }
  } catch {}
  return { chartMode: "simple", missMode: "simple", shortSnapTime: false };
}

export default function SnapSettingsPage() {
  const [chartMode, setChartMode] = useState<"simple" | "detailed">(() => loadSettings().chartMode);
  const [missMode, setMissMode] = useState<"simple" | "detailed">(() => loadSettings().missMode);
  const [shortSnapTime, setShortSnapTime] = useState(() => loadSettings().shortSnapTime);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedSettings, setSavedSettings] = useState<SnapSettings>(() => loadSettings());

  useEffect(() => {
    loadSettingsFromCloud<SnapSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        if (cloud.chartMode === "simple" || cloud.chartMode === "detailed") setChartMode(cloud.chartMode);
        if (cloud.missMode === "simple" || cloud.missMode === "detailed") setMissMode(cloud.missMode);
        if (typeof cloud.shortSnapTime === "boolean") setShortSnapTime(cloud.shortSnapTime);
        setSavedSettings({
          chartMode: cloud.chartMode === "detailed" ? "detailed" : "simple",
          missMode: cloud.missMode === "detailed" ? "detailed" : "simple",
          shortSnapTime: cloud.shortSnapTime === true,
        });
      }
    });
  }, []);

  useEffect(() => {
    const changed = chartMode !== savedSettings.chartMode || missMode !== savedSettings.missMode || shortSnapTime !== savedSettings.shortSnapTime;
    setDirty(changed);
    if (changed) setSaved(false);
  }, [chartMode, missMode, shortSnapTime, savedSettings]);

  const handleSave = () => {
    const settings: SnapSettings = { chartMode, missMode, shortSnapTime };
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
        <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Strike Charting</p>
        <p className="text-xs text-muted">
          Simple tracks Strike/Ball only. Detailed adds a 3x3 grid to track exactly where the snap lands with directional arrows.
        </p>
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setChartMode("simple")} className={clsx("px-4 py-2 text-xs font-semibold transition-colors", chartMode === "simple" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Simple</button>
          <button onClick={() => setChartMode("detailed")} className={clsx("px-4 py-2 text-xs font-semibold transition-colors border-l border-border", chartMode === "detailed" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Detailed</button>
        </div>
      </div>

      <div className="card space-y-4">
        <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Miss Charting</p>
        <p className="text-xs text-muted">
          Simple tracks Ball only. Detailed extends the grid outside the strike zone to track exactly where the miss landed with directional arrows.
        </p>
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          <button onClick={() => setMissMode("simple")} className={clsx("px-4 py-2 text-xs font-semibold transition-colors", missMode === "simple" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Simple</button>
          <button onClick={() => setMissMode("detailed")} className={clsx("px-4 py-2 text-xs font-semibold transition-colors border-l border-border", missMode === "detailed" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>Detailed</button>
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Short Snap Time</p>
            <p className="text-xs text-muted mt-1">Track snap time for FG/PAT snaps. Disable to hide the time column from the short snap session.</p>
          </div>
          <button
            onClick={() => setShortSnapTime((v) => !v)}
            className={clsx("relative w-11 h-6 rounded-full transition-colors", shortSnapTime ? "bg-accent" : "bg-border")}
            aria-label="Toggle short snap time"
          >
            <span className={clsx("absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform", shortSnapTime ? "left-[22px]" : "left-0.5")} />
          </button>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!dirty}
        className={clsx(
          "w-full py-3 rounded-input text-sm font-bold transition-all",
          saved ? "bg-make text-slate-900" : dirty ? "btn-primary" : "bg-surface-2 text-muted border border-border cursor-not-allowed"
        )}
      >
        {saved ? "Saved!" : "Save Settings"}
      </button>
    </div>
  );
}
