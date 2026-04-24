"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";

const SNAP_DISTANCES = ["6", "7", "8"];
const STORAGE_KEY = "fgSettings";

type ScoreMode = "on" | "practice" | "off";

interface FGSettings {
  snapDistance: string;
  makeMode: "simple" | "detailed";
  missMode: "simple" | "detailed";
  scoreEnabled: ScoreMode;
  scoreOptions: string[];
  opTimeEnabled: boolean;
}

const DEFAULT_SCORE_OPTIONS = ["0", "1", "2", "3", "4"];
const DEFAULT_SETTINGS: FGSettings = {
  snapDistance: "7",
  makeMode: "detailed",
  missMode: "detailed",
  scoreEnabled: "practice",
  scoreOptions: DEFAULT_SCORE_OPTIONS,
  opTimeEnabled: true,
};

function parseScoreMode(val: unknown): ScoreMode {
  if (val === "on" || val === "practice" || val === "off") return val;
  if (val === true) return "on";
  if (val === false) return "off";
  return "practice";
}

function loadSettingsLocal(): FGSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        snapDistance: parsed.snapDistance ?? "7",
        makeMode: parsed.makeMode ?? "detailed",
        missMode: parsed.missMode ?? "detailed",
        scoreEnabled: parseScoreMode(parsed.scoreEnabled),
        scoreOptions: Array.isArray(parsed.scoreOptions) && parsed.scoreOptions.length > 0
          ? parsed.scoreOptions
          : DEFAULT_SCORE_OPTIONS,
        opTimeEnabled: parsed.opTimeEnabled !== false,
      };
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export default function FGSettingsPage() {
  const [snapDistance, setSnapDistance] = useState("7");
  const [makeMode, setMakeMode] = useState<"simple" | "detailed">("detailed");
  const [missMode, setMissMode] = useState<"simple" | "detailed">("detailed");
  const [scoreEnabled, setScoreEnabled] = useState<ScoreMode>("practice");
  const [scoreOptions, setScoreOptions] = useState<string[]>(DEFAULT_SCORE_OPTIONS);
  const [opTimeEnabled, setOpTimeEnabled] = useState(true);
  const [newScore, setNewScore] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Track what was last saved so we can detect changes
  const [savedSettings, setSavedSettings] = useState<FGSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Load from localStorage immediately, then try cloud
    const local = loadSettingsLocal();
    setSnapDistance(local.snapDistance);
    setMakeMode(local.makeMode);
    setMissMode(local.missMode);
    setScoreEnabled(local.scoreEnabled);
    setScoreOptions(local.scoreOptions);
    setOpTimeEnabled(local.opTimeEnabled);
    setSavedSettings(local);
    setLoaded(true);

    // Try loading from Supabase (overrides if found)
    loadSettingsFromCloud<FGSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        setSnapDistance(cloud.snapDistance ?? "7");
        setMakeMode(cloud.makeMode ?? "detailed");
        setMissMode(cloud.missMode ?? "detailed");
        setScoreEnabled(parseScoreMode(cloud.scoreEnabled));
        setScoreOptions(Array.isArray(cloud.scoreOptions) && cloud.scoreOptions.length > 0 ? cloud.scoreOptions : DEFAULT_SCORE_OPTIONS);
        if (typeof cloud.opTimeEnabled === "boolean") setOpTimeEnabled(cloud.opTimeEnabled);
        setSavedSettings({
          snapDistance: cloud.snapDistance ?? "7",
          makeMode: cloud.makeMode ?? "detailed",
          missMode: cloud.missMode ?? "detailed",
          scoreEnabled: parseScoreMode(cloud.scoreEnabled),
          scoreOptions: Array.isArray(cloud.scoreOptions) && cloud.scoreOptions.length > 0 ? cloud.scoreOptions : DEFAULT_SCORE_OPTIONS,
          opTimeEnabled: cloud.opTimeEnabled !== false,
        });
      }
    });
  }, []);

  // Detect unsaved changes
  useEffect(() => {
    if (!loaded) return;
    const changed =
      snapDistance !== savedSettings.snapDistance ||
      makeMode !== savedSettings.makeMode ||
      missMode !== savedSettings.missMode ||
      scoreEnabled !== savedSettings.scoreEnabled ||
      JSON.stringify(scoreOptions) !== JSON.stringify(savedSettings.scoreOptions) ||
      opTimeEnabled !== savedSettings.opTimeEnabled;
    setDirty(changed);
    if (changed) setSaved(false);
  }, [snapDistance, makeMode, missMode, scoreEnabled, scoreOptions, opTimeEnabled, savedSettings, loaded]);

  const handleAddScore = () => {
    const trimmed = newScore.trim();
    if (!trimmed) return;
    if (scoreOptions.includes(trimmed)) return;
    setScoreOptions([...scoreOptions, trimmed]);
    setNewScore("");
  };

  const handleRemoveScore = (value: string) => {
    setScoreOptions(scoreOptions.filter((s) => s !== value));
  };

  const handleSave = () => {
    const settings: FGSettings = { snapDistance, makeMode, missMode, scoreEnabled, scoreOptions, opTimeEnabled };
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

      <div className="card space-y-4">
        <p className="label">Kick Score</p>
        <p className="text-xs text-muted">
          Choose when to track kick score. &quot;Practice Only&quot; hides score in game mode but shows it in practice.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["on", "practice", "off"] as ScoreMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setScoreEnabled(mode)}
              className={clsx(
                "py-3 rounded-input text-xs font-bold border transition-all",
                scoreEnabled === mode
                  ? "bg-accent/20 text-accent border-accent/50"
                  : "bg-surface-2 text-muted border-border hover:text-white"
              )}
            >
              {mode === "on" ? "On" : mode === "practice" ? "Practice Only" : "Off"}
            </button>
          ))}
        </div>
        {scoreEnabled !== "off" && (
          <>
            <p className="label">Score Options</p>
            <div className="space-y-2">
              {scoreOptions.map((opt) => (
                <div key={opt} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    readOnly
                    className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none"
                  />
                  <button
                    onClick={() => handleRemoveScore(opt)}
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
                value={newScore}
                onChange={(e) => setNewScore(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddScore(); }}
                placeholder="Add score value..."
                className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 placeholder:text-muted"
              />
              <button
                onClick={handleAddScore}
                disabled={!newScore.trim()}
                className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add
              </button>
            </div>
          </>
        )}
      </div>

      {/* Op Time toggle */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Operation Time</p>
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
          Track snap-to-kick operation time on each attempt. Existing op time data is preserved in stats even when disabled.
        </p>
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
