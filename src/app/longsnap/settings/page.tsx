"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { saveSettingsToCloud, loadSettingsFromCloud } from "@/lib/settingsSync";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "snapSettings";

interface SnapSettings {
  chartMode: "simple" | "detailed";
  missMode: "simple" | "detailed";
  openSpiralIsBall: boolean;
  holderEnabled: boolean;
}

function loadSettings(): SnapSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        chartMode: parsed.chartMode === "detailed" ? "detailed" : "simple",
        missMode: parsed.missMode === "detailed" ? "detailed" : "simple",
        openSpiralIsBall: parsed.openSpiralIsBall !== false,
        holderEnabled: parsed.holderEnabled !== false,
      };
    }
  } catch {}
  return { chartMode: "simple", missMode: "simple", openSpiralIsBall: true, holderEnabled: true };
}

export default function SnapSettingsPage() {
  const { isAthlete } = useAuth();
  if (isAthlete) return <main className="p-4 lg:p-6"><p className="text-sm text-muted">Settings are coach-only.</p></main>;
  return <SnapSettingsContent />;
}

function SnapSettingsContent() {
  const [chartMode, setChartMode] = useState<"simple" | "detailed">(() => loadSettings().chartMode);
  const [missMode, setMissMode] = useState<"simple" | "detailed">(() => loadSettings().missMode);
  const [openSpiralIsBall, setOpenSpiralIsBall] = useState(() => loadSettings().openSpiralIsBall);
  const [holderEnabled, setHolderEnabled] = useState(() => loadSettings().holderEnabled);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedSettings, setSavedSettings] = useState<SnapSettings>(() => loadSettings());

  useEffect(() => {
    loadSettingsFromCloud<SnapSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        const cm = (cloud.chartMode === "detailed" ? "detailed" : "simple") as "simple" | "detailed";
        const mm = (cloud.missMode === "detailed" ? "detailed" : "simple") as "simple" | "detailed";
        const osb = cloud.openSpiralIsBall !== false;
        const he = cloud.holderEnabled !== false;
        setChartMode(cm);
        setMissMode(mm);
        setOpenSpiralIsBall(osb);
        setHolderEnabled(he);
        const synced: SnapSettings = { chartMode: cm, missMode: mm, openSpiralIsBall: osb, holderEnabled: he };
        setSavedSettings(synced);
        // Sync cloud → localStorage so session pages pick it up
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(synced)); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    const changed = chartMode !== savedSettings.chartMode || missMode !== savedSettings.missMode || openSpiralIsBall !== savedSettings.openSpiralIsBall || holderEnabled !== savedSettings.holderEnabled;
    setDirty(changed);
    if (changed) setSaved(false);
  }, [chartMode, missMode, openSpiralIsBall, holderEnabled, savedSettings]);

  const handleSave = () => {
    const settings: SnapSettings = { chartMode, missMode, openSpiralIsBall, holderEnabled };
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

      <div className="card space-y-4">
        <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Open Spiral</p>
        <p className="text-xs text-muted">
          When enabled, an open (bad) spiral automatically counts as a Ball. When disabled, spiral does not affect the Strike/Ball call.
        </p>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Open Spiral = Ball</p>
          <button
            onClick={() => setOpenSpiralIsBall(!openSpiralIsBall)}
            className={clsx("w-10 h-5 rounded-full transition-colors relative", openSpiralIsBall ? "bg-accent" : "bg-surface-2 border border-border")}
          >
            <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", openSpiralIsBall ? "left-5" : "left-0.5")} />
          </button>
        </div>
      </div>

      <div className="card space-y-4">
        <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Holder</p>
        <p className="text-xs text-muted">
          When enabled, holder selection appears in snap charting overlays.
        </p>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">Holder Enabled</p>
          <button
            onClick={() => setHolderEnabled(!holderEnabled)}
            className={clsx("w-10 h-5 rounded-full transition-colors relative", holderEnabled ? "bg-accent" : "bg-surface-2 border border-border")}
          >
            <div className={clsx("w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all", holderEnabled ? "left-5" : "left-0.5")} />
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
