"use client";

import React from "react";
import type { FGKick } from "@/types";
import clsx from "clsx";

const RESULT_LABELS: Record<string, string> = {
  YL: "✓ GOOD ←",
  YC: "✓ GOOD",
  YR: "✓ GOOD →",
  XL: "← MISS",
  XR: "MISS →",
  XS: "✗ MISS",
};

interface SessionLogProps {
  kicks: FGKick[];
  onDelete: (idx: number) => void;
}

export function SessionLog({ kicks, onDelete }: SessionLogProps) {
  if (kicks.length === 0) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-muted">
        No kicks logged yet
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {[...kicks].reverse().map((k, ri) => {
        const idx = kicks.length - 1 - ri;
        const isMake = k.result.startsWith("Y");
        return (
          <div
            key={idx}
            className="flex items-center px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
          >
            <span className="text-xs text-muted w-6 shrink-0">#{k.kickNum ?? idx + 1}</span>
            <span className="text-sm font-medium text-slate-200 w-20 shrink-0 truncate">
              {k.athlete}
            </span>
            <span className="text-xs text-muted w-14 shrink-0">
              {k.isPAT ? "PAT" : `${k.dist} yd`}
            </span>
            <span className="text-xs text-muted w-10 shrink-0">{k.pos}</span>
            <span
              className={clsx(
                "text-xs font-bold flex-1",
                isMake ? "text-make" : "text-miss"
              )}
            >
              {RESULT_LABELS[k.result] ?? k.result}
            </span>
            <button
              onClick={() => onDelete(idx)}
              className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm ml-2"
              title="Remove kick"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
