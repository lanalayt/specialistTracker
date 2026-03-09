"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";

const SNAP_DISTANCES = ["6", "7", "8"];
const STORAGE_KEY = "fgSettings";

interface FGSettings {
  snapDistance: string;
  makeMode: "simple" | "detailed";
  missMode: "simple" | "detailed";
}

function loadSettings(): FGSettings {
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
  return { snapDistance: "7", makeMode: "detailed", missMode: "detailed" };
}

function saveSettings(settings: FGSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export default function FGSettingsPage() {
  const [snapDistance, setSnapDistance] = useState("7");
  const [makeMode, setMakeMode] = useState<"simple" | "detailed">("detailed");
  const [missMode, setMissMode] = useState<"simple" | "detailed">("detailed");

  useEffect(() => {
    const s = loadSettings();
    setSnapDistance(s.snapDistance);
    setMakeMode(s.makeMode);
    setMissMode(s.missMode);
  }, []);

  const save = (overrides: Partial<FGSettings>) => {
    const updated = { snapDistance, makeMode, missMode, ...overrides };
    saveSettings(updated);
  };

  const handleSnapSelect = (val: string) => {
    setSnapDistance(val);
    save({ snapDistance: val });
  };

  const handleMakeModeSelect = (val: "simple" | "detailed") => {
    setMakeMode(val);
    save({ makeMode: val });
  };

  const handleMissModeSelect = (val: "simple" | "detailed") => {
    setMissMode(val);
    save({ missMode: val });
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
              onClick={() => handleSnapSelect(d)}
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

      <div className="card space-y-3">
        <p className="label">Make Tracking</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleMakeModeSelect("simple")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              makeMode === "simple"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
            )}
          >
            <span className="block text-base mb-1">Simple</span>
            <span className="block text-[10px] font-normal text-muted">
              ✓ GOOD
            </span>
          </button>
          <button
            onClick={() => handleMakeModeSelect("detailed")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              makeMode === "detailed"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
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
            onClick={() => handleMissModeSelect("simple")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              missMode === "simple"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
            )}
          >
            <span className="block text-base mb-1">Simple</span>
            <span className="block text-[10px] font-normal text-muted">
              ✗ MISS
            </span>
          </button>
          <button
            onClick={() => handleMissModeSelect("detailed")}
            className={clsx(
              "py-4 rounded-input text-sm font-bold border transition-all",
              missMode === "detailed"
                ? "bg-accent/20 text-accent border-accent/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
            )}
          >
            <span className="block text-base mb-1">Detailed</span>
            <span className="block text-[10px] font-normal text-muted">
              ← MISS &nbsp; ↓ SHORT &nbsp; MISS →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
