"use client";

import React, { useState, useEffect } from "react";
import type { PuntEntry } from "@/types";

const DEFAULT_PUNT_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "POOCH_BLUE", label: "P-Blue" },
  { id: "POOCH_RED", label: "P-Red" },
  { id: "BROWN", label: "Brown" },
];

function loadPuntTypes(): { id: string; label: string }[] {
  if (typeof window === "undefined") return DEFAULT_PUNT_TYPES;
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.puntTypes && parsed.puntTypes.length > 0) return parsed.puntTypes;
    }
  } catch {}
  return DEFAULT_PUNT_TYPES;
}

interface PuntSessionLogProps {
  punts: PuntEntry[];
  onDelete: (idx: number) => void;
}

export function PuntSessionLog({ punts, onDelete }: PuntSessionLogProps) {
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    const types = loadPuntTypes();
    const map: Record<string, string> = {};
    types.forEach((t) => { map[t.id] = t.label; });
    setTypeLabels(map);
  }, []);

  if (punts.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted">
        No punts logged yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {[...punts].reverse().map((p, ri) => {
        const idx = punts.length - 1 - ri;
        return (
          <div
            key={idx}
            className="flex items-center px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
          >
            <span className="text-xs text-muted w-6 shrink-0">#{p.kickNum ?? idx + 1}</span>
            <span className="text-sm font-medium text-slate-200 w-20 shrink-0 truncate">
              {p.athlete}
            </span>
            <span className="text-xs text-muted w-14 shrink-0">
              {typeLabels[p.type] ?? p.type}
            </span>
            <span className="text-xs text-muted w-8 shrink-0">{p.hash}</span>
            <span className="text-xs text-slate-200 w-12 shrink-0">{p.yards} yd</span>
            <span className="text-xs text-muted w-12 shrink-0">{p.hangTime}s</span>
            <span className="text-xs text-muted w-12 shrink-0">{p.opTime}s OT</span>
            <span className={`text-xs font-bold flex-1 ${p.directionalAccuracy === 0 ? "text-miss" : p.directionalAccuracy === 1 ? "text-make" : "text-warn"}`}>
              {p.directionalAccuracy === 1 ? "1.0" : p.directionalAccuracy === 0.5 ? "0.5" : "0"}
            </span>
            <button
              onClick={() => onDelete(idx)}
              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm ml-2"
              title="Remove punt"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
