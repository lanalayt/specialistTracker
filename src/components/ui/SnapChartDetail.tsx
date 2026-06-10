"use client";

import { HolderStrikeZone } from "./HolderStrikeZone";
import { PunterStrikeZone } from "./PunterStrikeZone";
import clsx from "clsx";

export interface SnapDetailEntry {
  accuracy?: string;
  laces?: string;
  spiral?: string;
  time?: string;
  points?: number;
  score?: number;
  markerX?: number;
  markerY?: number;
  markerInZone?: boolean;
}

/**
 * Read-only snap chart view — the strike-zone diagram + score + snap-by-snap
 * table, matching what the Snap rankings page shows when you hit "See Chart".
 */
export function SnapChartDetail({ entries, is30Point }: { entries: SnapDetailEntry[]; is30Point: boolean }) {
  const count = entries.length;
  const total = entries.reduce((s, e) => s + (e.points ?? e.score ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* Score */}
      <div className="text-center">
        <p className="text-3xl font-black text-amber-400">{total}</p>
        <p className="text-xs text-muted">{is30Point ? `/ ${count * 3}` : `${total} / ${count} strikes`}</p>
      </div>

      {/* Strike zone diagram */}
      <div className="max-w-[250px] mx-auto">
        {is30Point ? (
          <HolderStrikeZone
            markers={entries
              .filter((e) => e.markerX != null && e.markerY != null)
              .map((e, i) => ({ x: e.markerX!, y: e.markerY!, inZone: e.markerInZone ?? false, num: i + 1 }))}
          />
        ) : (
          <PunterStrikeZone
            markers={entries
              .filter((e) => e.markerX != null && e.markerY != null)
              .map((e, i) => ({ x: e.markerX!, y: e.markerY!, inZone: e.accuracy === "Strike", num: i + 1 }))}
          />
        )}
      </div>

      {/* Snap-by-snap table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
              <th className="text-[10px] text-muted text-center py-1 px-1">{is30Point ? "Loc" : "Call"}</th>
              {is30Point && <th className="text-[10px] text-muted text-center py-1 px-1">Laces</th>}
              {!is30Point && <th className="text-[10px] text-muted text-center py-1 px-1">Time</th>}
              <th className="text-[10px] text-muted text-center py-1 px-1">Spiral</th>
              <th className="text-[10px] text-muted text-right py-1 px-1">Pts</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className="border-t border-border/30">
                <td className="text-muted py-1 px-1">{i + 1}</td>
                <td className={clsx("text-center py-1 px-1 font-semibold", e.accuracy === "Strike" ? "text-make" : "text-miss")}>{e.accuracy}</td>
                {is30Point && (
                  <td className={clsx("text-center py-1 px-1", e.laces === "Good" ? "text-make" : e.laces === "1/4 Turn" ? "text-warn" : "text-miss")}>
                    {e.laces === "Good" ? "Perfect" : e.laces}
                  </td>
                )}
                {!is30Point && <td className="text-center py-1 px-1 text-slate-300">{e.time || "—"}</td>}
                <td className={clsx("text-center py-1 px-1", e.spiral === "Good" ? "text-make" : "text-miss")}>
                  {e.spiral === "Good" ? "Tight" : "Open"}
                </td>
                <td className="text-right py-1 px-1 font-bold text-amber-400">{e.points ?? e.score ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
