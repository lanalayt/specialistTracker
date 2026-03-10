"use client";

import React from "react";
import type { KickoffEntry, KickoffType } from "@/types";

const TYPE_LABELS: Record<KickoffType, string> = {
  REG: "Regular",
  ONSIDE: "Onside",
  SQUIB: "Squib",
  FREE: "Free",
};

const DIR_LABELS: Record<string, string> = {
  left: "←",
  middle: "↑",
  right: "→",
};

interface KickoffSessionLogProps {
  kicks: KickoffEntry[];
  onDelete: (idx: number) => void;
}

export function KickoffSessionLog({ kicks, onDelete }: KickoffSessionLogProps) {
  if (kicks.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted">
        No kickoffs logged yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {[...kicks].reverse().map((k, ri) => {
        const idx = kicks.length - 1 - ri;
        return (
          <div
            key={idx}
            className="flex items-center px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
          >
            <span className="text-xs text-muted w-6 shrink-0">#{idx + 1}</span>
            <span className="text-sm font-medium text-slate-200 w-20 shrink-0 truncate">
              {k.athlete}
            </span>
            <span className="text-xs text-muted w-16 shrink-0">
              {TYPE_LABELS[k.type] ?? k.type}
            </span>
            <span className="text-xs text-slate-200 w-12 shrink-0">{k.distance} yd</span>
            <span className="text-xs text-muted w-12 shrink-0">{k.hangTime}s</span>
            <span className="text-xs text-muted w-6 shrink-0">{DIR_LABELS[k.direction] ?? k.direction}</span>
            <span className="text-xs font-bold text-accent flex-1">{k.score}</span>
            <button
              onClick={() => onDelete(idx)}
              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm ml-2"
              title="Remove kickoff"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
