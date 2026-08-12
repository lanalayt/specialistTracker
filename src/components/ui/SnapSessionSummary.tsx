"use client";

import clsx from "clsx";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import type { LongSnapEntry } from "@/types";

/**
 * Post-commit recap for a snap session. Groups the committed snaps by athlete
 * and, for each, shows their diagram (rebuilt from the saved marker positions)
 * plus a table of every snap. Two snappers in one session each get their own
 * diagram + table — same shape as the history detail view.
 */
export function SnapSessionSummary({ snaps }: { snaps: LongSnapEntry[] }) {
  const isShort = snaps.length > 0 && snaps.every((s) => s.snapType === "FG" || s.snapType === "PAT");
  const athletes = [...new Set(snaps.map((s) => s.athlete))];

  if (athletes.length === 0) {
    return <p className="text-sm text-muted text-center py-8">No snaps in this session.</p>;
  }

  return (
    <div className="space-y-6">
      {athletes.map((a) => {
        const ps = snaps.filter((s) => s.athlete === a);
        const strikes = ps.filter((s) => s.accuracy === "ON_TARGET").length;
        const times = ps.filter((s) => s.time > 0);
        const avgT = times.length > 0 ? (times.reduce((sum, s) => sum + s.time, 0) / times.length).toFixed(2) : null;
        const hasSpiral = ps.some((s) => s.spiral === "Good" || s.spiral === "Bad");
        const tights = ps.filter((s) => s.spiral === "Good").length;
        const hasLaces = ps.some((s) => s.laces);
        const withMarkers = ps.filter((s) => s.markerX != null && s.markerY != null);
        // Short snaps carry a 0–3 score per snap; show the athlete's total.
        const scoreTotal = ps.reduce((sum, s) => sum + (s.score ?? 0), 0);
        const maxScore = ps.length * 3;

        return (
          <div key={a} className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-slate-200">{a}</span>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs font-bold text-accent uppercase tracking-wider">{isShort ? "FG / Short Snap" : "Punt / Long Snap"}</span>
              <span className="text-xs text-muted">·</span>
              <span className="text-xs text-muted">{strikes}/{ps.length} Strikes</span>
              {isShort && (<><span className="text-xs text-muted">·</span><span className="text-xs text-sky-400 font-semibold">{scoreTotal % 1 === 0 ? scoreTotal : scoreTotal.toFixed(1)}/{maxScore}</span></>)}
              {avgT && (<><span className="text-xs text-muted">·</span><span className="text-xs text-slate-300">Avg {avgT}s</span></>)}
              {hasSpiral && (<><span className="text-xs text-muted">·</span><span className="text-xs text-slate-300">{tights}/{ps.length} Tight</span></>)}
            </div>

            {withMarkers.length > 0 && (
              <div className="card-2 flex justify-center">
                <div className="w-full max-w-[280px]">
                  {isShort ? (
                    <HolderStrikeZone
                      markers={withMarkers.map((s, i): ShortSnapMarker => ({ x: s.markerX!, y: s.markerY!, num: i + 1, inZone: s.markerInZone ?? false }))}
                    />
                  ) : (
                    <PunterStrikeZone
                      markers={withMarkers.map((s, i): SnapMarker => ({ x: s.markerX!, y: s.markerY!, num: i + 1, inZone: s.markerInZone ?? false }))}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header">Acc</th>
                    {!isShort && <th className="table-header">Time</th>}
                    {hasLaces && <th className="table-header">Laces</th>}
                    {hasSpiral && <th className="table-header">Spiral</th>}
                    {isShort && <th className="table-header">Score</th>}
                  </tr>
                </thead>
                <tbody>
                  {ps.map((s, i) => (
                    <tr key={i}>
                      <td className="table-cell text-left text-muted">{i + 1}</td>
                      <td className={clsx("table-cell font-bold", s.accuracy === "ON_TARGET" ? "text-make" : "text-miss")}>
                        {s.accuracy === "ON_TARGET" ? "Strike" : "Ball"}
                      </td>
                      {!isShort && <td className="table-cell text-muted">{s.time > 0 ? `${s.time.toFixed(2)}s` : "—"}</td>}
                      {hasLaces && <td className={clsx("table-cell font-bold", s.laces === "Good" ? "text-make" : s.laces ? "text-miss" : "text-muted")}>{s.laces || "—"}</td>}
                      {hasSpiral && (
                        <td className={clsx("table-cell", s.spiral === "Good" ? "text-make" : s.spiral === "Bad" ? "text-miss" : "text-muted")}>
                          {s.spiral === "Good" ? "Tight" : s.spiral === "Bad" ? "Open" : "—"}
                        </td>
                      )}
                      {isShort && <td className="table-cell text-sky-400 font-semibold">{(s.score ?? 0) % 1 === 0 ? (s.score ?? 0) : (s.score ?? 0).toFixed(1)}/3</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
