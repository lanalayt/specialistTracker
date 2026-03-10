"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";

const STORAGE_KEY = "puntSettings";

interface PuntSettings {
  puntTypes: { id: string; label: string }[];
}

const DEFAULT_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "POOCH_BLUE", label: "P-Blue" },
  { id: "POOCH_RED", label: "P-Red" },
  { id: "BROWN", label: "Brown" },
];

function loadSettings(): PuntSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.puntTypes && parsed.puntTypes.length > 0) {
        return { puntTypes: parsed.puntTypes };
      }
    }
  } catch {}
  return { puntTypes: DEFAULT_TYPES };
}

export default function PuntSettingsPage() {
  const [types, setTypes] = useState<{ id: string; label: string }[]>(DEFAULT_TYPES);
  const [newType, setNewType] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedTypes, setSavedTypes] = useState<{ id: string; label: string }[]>(DEFAULT_TYPES);

  useEffect(() => {
    const s = loadSettings();
    setTypes(s.puntTypes);
    setSavedTypes(s.puntTypes);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const changed = JSON.stringify(types) !== JSON.stringify(savedTypes);
    setDirty(changed);
    if (changed) setSaved(false);
  }, [types, savedTypes, loaded]);

  const handleAdd = () => {
    const trimmed = newType.trim();
    if (!trimmed) return;
    // Create an ID from the label
    const id = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (types.some((t) => t.id === id)) return;
    setTypes([...types, { id, label: trimmed }]);
    setNewType("");
  };

  const handleRemove = (id: string) => {
    setTypes(types.filter((t) => t.id !== id));
  };

  const handleRename = (id: string, newLabel: string) => {
    setTypes(types.map((t) => (t.id === id ? { ...t, label: newLabel } : t)));
  };

  const handleSave = () => {
    const settings: PuntSettings = { puntTypes: types };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSavedTypes(types);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex-1 p-6 max-w-lg space-y-6">
      <h2 className="text-lg font-bold text-slate-100">Punt Settings</h2>

      <div className="card space-y-4">
        <p className="label">Punt Types</p>
        <div className="space-y-2">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <input
                type="text"
                value={t.label}
                onChange={(e) => handleRename(t.id, e.target.value)}
                className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all"
              />
              <button
                onClick={() => handleRemove(t.id)}
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
              if (e.key === "Enter") handleAdd();
            }}
            placeholder="Add new type..."
            className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
          />
          <button
            onClick={handleAdd}
            disabled={!newType.trim()}
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
