"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";

const SNAP_DISTANCES = ["6", "7", "8"];
const STORAGE_KEY = "fgSettings";

interface FGSettings {
  snapDistance: string;
}

function loadSettings(): FGSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { snapDistance: "7" };
}

function saveSettings(settings: FGSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export default function FGSettingsPage() {
  const [snapDistance, setSnapDistance] = useState("7");

  useEffect(() => {
    const s = loadSettings();
    setSnapDistance(s.snapDistance);
  }, []);

  const handleSelect = (val: string) => {
    setSnapDistance(val);
    saveSettings({ snapDistance: val });
  };

  return (
    <div className="flex-1 p-6 max-w-lg">
      <h2 className="text-lg font-bold text-slate-100 mb-6">FG Settings</h2>

      <div className="card space-y-3">
        <p className="label">Snap Distance</p>
        <div className="flex gap-2">
          {SNAP_DISTANCES.map((d) => (
            <button
              key={d}
              onClick={() => handleSelect(d)}
              className={clsx(
                "flex-1 py-3 rounded-input text-sm font-bold transition-all",
                snapDistance === d
                  ? "bg-accent text-slate-900"
                  : "bg-surface-2 text-muted border border-border hover:text-slate-300 hover:border-accent/50"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
