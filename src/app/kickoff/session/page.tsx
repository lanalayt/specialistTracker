"use client";

import { useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { ZoneBarChart } from "@/components/ui/Chart";
import { useKickoff } from "@/lib/kickoffContext";
import { RoleGuard } from "@/components/auth/RoleGuard";
import type { KickoffEntry, KickoffLandingZone } from "@/types";
import { KICKOFF_ZONES } from "@/types";
import clsx from "clsx";

interface KickoffRow {
  id: string;
  athlete: string;
  distance: string;
  hangTime: string;
  landingZone: KickoffLandingZone | "";
  result: "TB" | "RETURN" | "OOB" | "";
  returnYards: string;
}

function newRow(): KickoffRow {
  return {
    id: `row-${Date.now()}-${Math.random()}`,
    athlete: "", distance: "", hangTime: "", landingZone: "", result: "", returnYards: "",
  };
}

export default function KickoffSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice } = useKickoff();
  const [rows, setRows] = useState<KickoffRow[]>(() => Array.from({ length: 6 }, newRow));
  const [committed, setCommitted] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const updateRow = (id: string, field: keyof KickoffRow, value: string) => {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  };

  const filledRows = rows.filter((r) => r.athlete || r.distance);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        touchbacks: acc.touchbacks + s.overall.touchbacks,
        oob: acc.oob + s.overall.oob,
        totalDist: acc.totalDist + s.overall.totalDist,
        totalHang: acc.totalHang + s.overall.totalHang,
      };
    },
    { att: 0, touchbacks: 0, oob: 0, totalDist: 0, totalHang: 0 }
  );

  const tbRate = totals.att > 0 ? `${Math.round((totals.touchbacks / totals.att) * 100)}%` : "—";
  const avgDist = totals.att > 0 ? (totals.totalDist / totals.att).toFixed(1) : "—";
  const avgHang = totals.att > 0 ? (totals.totalHang / totals.att).toFixed(2) : "—";

  const zoneData = KICKOFF_ZONES.map((z) => ({
    zone: z === "TB" ? "TB" : `Zone ${z}`,
    count: athletes.reduce((acc, a) => acc + (stats[a]?.byZone[z] ?? 0), 0),
  }));

  const handleCommit = () => {
    const entries: KickoffEntry[] = rows
      .filter((r) => r.athlete && r.landingZone && r.result)
      .map((r) => ({
        athleteId: r.athlete,
        athlete: r.athlete,
        distance: parseInt(r.distance) || 0,
        hangTime: parseFloat(r.hangTime) || 0,
        landingZone: r.landingZone as KickoffLandingZone,
        result: r.result as "TB" | "RETURN" | "OOB",
        returnYards: parseInt(r.returnYards) || 0,
      }));
    if (entries.length === 0) return;
    commitPractice(entries);
    setRows(Array.from({ length: 6 }, newRow));
    setCommitted(true);
    setTimeout(() => setCommitted(false), 2000);
  };

  if (!sessionStarted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-slate-100">Practice Log</h2>
          <p className="text-sm text-muted">
            Ready to start? Hit the button to begin logging kickoffs.
          </p>
          <button
            onClick={() => setSessionStarted(true)}
            className="btn-primary py-3 px-8 text-sm w-full"
          >
            ▶ Start Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Log */}
      <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-bold text-slate-100">Kickoff Log</h2>
            <p className="text-xs text-muted">{filledRows.length} kicks entered</p>
          </div>
          {canUndo && (
            <button onClick={() => undoLastCommit()} className="btn-ghost text-xs py-1.5 px-3">↩ Undo</button>
          )}
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Dist</th>
                <th className="table-header">Hang</th>
                <th className="table-header">Zone</th>
                <th className="table-header">Result</th>
                <th className="table-header">Ret Yds</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-2/50">
                  <td className="py-1.5 px-2">
                    <RoleGuard disableForAthletes>
                      <select className="select py-1 text-xs min-w-[80px]" value={row.athlete} onChange={(e) => updateRow(row.id, "athlete", e.target.value)}>
                        <option value="">—</option>
                        {athletes.map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </RoleGuard>
                  </td>
                  <td className="py-1.5 px-2">
                    <RoleGuard disableForAthletes>
                      <input className="input py-1 text-xs w-16 text-right" type="number" placeholder="yds" value={row.distance} onChange={(e) => updateRow(row.id, "distance", e.target.value)} />
                    </RoleGuard>
                  </td>
                  <td className="py-1.5 px-2">
                    <RoleGuard disableForAthletes>
                      <input className="input py-1 text-xs w-16 text-right" type="number" step="0.1" placeholder="4.5" value={row.hangTime} onChange={(e) => updateRow(row.id, "hangTime", e.target.value)} />
                    </RoleGuard>
                  </td>
                  <td className="py-1.5 px-2">
                    <RoleGuard disableForAthletes>
                      <select className="select py-1 text-xs" value={row.landingZone} onChange={(e) => updateRow(row.id, "landingZone", e.target.value)}>
                        <option value="">—</option>
                        {KICKOFF_ZONES.map((z) => <option key={z} value={z}>{z === "TB" ? "TB" : `Zone ${z}`}</option>)}
                      </select>
                    </RoleGuard>
                  </td>
                  <td className="py-1.5 px-2">
                    <RoleGuard disableForAthletes>
                      <select className={clsx("select py-1 text-xs",
                        row.result === "TB" && "text-make",
                        row.result === "OOB" && "text-miss"
                      )} value={row.result} onChange={(e) => updateRow(row.id, "result", e.target.value)}>
                        <option value="">—</option>
                        <option value="TB">Touchback</option>
                        <option value="RETURN">Return</option>
                        <option value="OOB">OOB</option>
                      </select>
                    </RoleGuard>
                  </td>
                  <td className="py-1.5 px-2">
                    <RoleGuard disableForAthletes>
                      <input className="input py-1 text-xs w-16 text-right" type="number" placeholder="0" value={row.returnYards} onChange={(e) => updateRow(row.id, "returnYards", e.target.value)} />
                    </RoleGuard>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <RoleGuard disableForAthletes>
          <div className="border-t border-border p-3 flex gap-2 justify-end shrink-0">
            <button onClick={() => setRows([...rows, newRow()])} className="btn-ghost text-xs py-1.5 px-3">+ Row</button>
            <button onClick={handleCommit} disabled={filledRows.length === 0} className={clsx("btn-primary text-xs py-1.5 px-4", committed && "bg-make/90")}>
              {committed ? "✓ Committed!" : "Commit Practice"}
            </button>
          </div>
        </RoleGuard>
      </div>

      {/* Stats */}
      <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="TB Rate" value={tbRate} accent glow />
          <StatCard label="Avg Dist" value={avgDist ? `${avgDist} yd` : "—"} />
          <StatCard label="Avg Hang" value={avgHang ? `${avgHang}s` : "—"} />
        </div>
        <ZoneBarChart data={zoneData} />
      </div>
    </main>
  );
}
