"use client";

import React from "react";
import { useSettings } from "@/lib/settingsSync";
import type { PuntEntry } from "@/types";

const DEFAULT_PUNT_TYPES = [
  { id: "DIR_LEFT", label: "Left", metric: "distance" as const },
  { id: "DIR_STRAIGHT", label: "Straight", metric: "distance" as const },
  { id: "DIR_RIGHT", label: "Right", metric: "distance" as const },
  { id: "POOCH_LEFT", label: "Pooch Left", metric: "yardline" as const },
  { id: "POOCH_MIDDLE", label: "Pooch Middle", metric: "yardline" as const },
  { id: "POOCH_RIGHT", label: "Pooch Right", metric: "yardline" as const },
  { id: "RUGBY", label: "Rugby", metric: "distance" as const },
];

type PuntTypeInfo = { id: string; label: string; metric?: "distance" | "yardline" };

function resolvePuntTypes(parsed: { puntTypes?: PuntTypeInfo[] } | null): PuntTypeInfo[] {
  if (parsed?.puntTypes && parsed.puntTypes.length > 0) return parsed.puntTypes;
  return DEFAULT_PUNT_TYPES;
}

// A punt type is measured by yard line (vs. gross distance) — pooch and any
// custom type the coach configured with the "yardline" metric.
function isYardLineType(type: string | undefined, types: PuntTypeInfo[]): boolean {
  if (!type) return false;
  const cfg = types.find((t) => t.id === type);
  if (cfg?.metric) return cfg.metric === "yardline";
  return type.toUpperCase().includes("POOCH");
}

interface PuntSessionLogProps {
  punts: PuntEntry[];
  onDelete: (idx: number) => void;
}

export function PuntSessionLog({ punts, onDelete }: PuntSessionLogProps) {
  const puntSettings = useSettings<{ puntTypes?: PuntTypeInfo[] }>("puntSettings");
  const puntTypes = resolvePuntTypes(puntSettings);
  const typeLabels: Record<string, string> = {};
  puntTypes.forEach((t) => { typeLabels[t.id] = t.label; });

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
        const isYL = isYardLineType(p.type, puntTypes);
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
            {p.blocked ? (
              <span className="text-xs font-bold text-miss w-24 shrink-0">⊘ Blocked</span>
            ) : isYL ? (
              <>
                <span className="text-xs text-accent font-semibold w-12 shrink-0">{p.poochLandingYardLine ?? 0} YL</span>
                <span className="text-xs text-muted w-12 shrink-0">{p.hangTime > 0 ? `${p.hangTime}s` : "—"}</span>
              </>
            ) : (
              <>
                <span className="text-xs text-slate-200 w-12 shrink-0">{p.yards} yd</span>
                <span className="text-xs text-muted w-12 shrink-0">{p.hangTime}s</span>
              </>
            )}
            <span className="text-xs text-muted w-12 shrink-0">{p.opTime}s OT</span>
            {p.blocked ? (
              <span className="text-xs text-muted flex-1">—</span>
            ) : (
              <span className={`text-xs font-bold flex-1 ${p.directionalAccuracy === 0 ? "text-miss" : p.directionalAccuracy === 1 ? "text-make" : "text-warn"}`}>
                {p.directionalAccuracy === 1 ? "1.0" : p.directionalAccuracy === 0.5 ? "0.5" : "0"}
              </span>
            )}
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
