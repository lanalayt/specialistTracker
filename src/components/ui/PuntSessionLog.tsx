"use client";

import React from "react";
import type { PuntEntry, PuntType } from "@/types";

const TYPE_LABELS: Record<PuntType, string> = {
  RED: "Red",
  BLUE: "Blue",
  POOCH_BLUE: "P-Blue",
  POOCH_RED: "P-Red",
  BROWN: "Brown",
};

interface PuntSessionLogProps {
  punts: PuntEntry[];
  onDelete: (idx: number) => void;
}

export function PuntSessionLog({ punts, onDelete }: PuntSessionLogProps) {
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
            <span className="text-xs text-muted w-6 shrink-0">#{idx + 1}</span>
            <span className="text-sm font-medium text-slate-200 w-20 shrink-0 truncate">
              {p.athlete}
            </span>
            <span className="text-xs text-muted w-14 shrink-0">
              {TYPE_LABELS[p.type] ?? p.type}
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
