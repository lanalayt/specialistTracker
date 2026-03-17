"use client";

import React from "react";
import type { PuntEntry, PuntLandingZone } from "@/types";

interface ZoneCount {
  zone: PuntLandingZone;
  label: string;
  count: number;
  color: string;
}

interface PuntFieldStripProps {
  punts: PuntEntry[];
}

export function PuntFieldStrip({ punts }: PuntFieldStripProps) {
  const att = punts.length;

  const counts: Record<PuntLandingZone, number> = {
    TB: 0, inside10: 0, inside20: 0, returned: 0, fairCatch: 0,
  };

  // Multi-select: a punt counts toward each zone in its landingZones array
  punts.forEach((p) => {
    const zones = Array.isArray(p.landingZones)
      ? p.landingZones
      : (p as unknown as { landingZone?: PuntLandingZone }).landingZone
        ? [(p as unknown as { landingZone: PuntLandingZone }).landingZone]
        : [];
    zones.forEach((z) => {
      if (z in counts) counts[z as PuntLandingZone]++;
    });
  });

  const in20 = counts.inside10 + counts.inside20;
  const inside20Pct = att > 0 ? Math.round((in20 / att) * 100) : 0;
  const tbPct = att > 0 ? Math.round((counts.TB / att) * 100) : 0;
  const totalReturn = punts.reduce((acc, p) => acc + (p.returnYards || 0), 0);
  const puntsWithYards = punts.filter((p) => p.yards > 0);
  const totalYards = puntsWithYards.reduce((acc, p) => acc + p.yards, 0);
  const avgYards = puntsWithYards.length > 0 ? (totalYards / puntsWithYards.length).toFixed(1) : "—";
  const avgNet = puntsWithYards.length > 0 ? ((totalYards - totalReturn) / puntsWithYards.length).toFixed(1) : "—";

  // Directional accuracy stats
  const puntsWithDA = punts.filter((p) => p.directionalAccuracy != null && p.directionalAccuracy >= 0);
  const totalDA = puntsWithDA.reduce((acc, p) => acc + p.directionalAccuracy, 0);
  const criticalCount = puntsWithDA.filter((p) => p.directionalAccuracy === 0).length;
  const avgDA = puntsWithDA.length > 0 ? (totalDA / puntsWithDA.length).toFixed(2) : "—";

  // Pooch avg yard line
  const poochPunts = punts.filter((p) => (p.type === "POOCH_BLUE" || p.type === "POOCH_RED") && p.poochLandingYardLine != null);
  const poochYLTotal = poochPunts.reduce((acc, p) => acc + (p.poochLandingYardLine ?? 0), 0);
  const avgPoochYL = poochPunts.length > 0 ? (poochYLTotal / poochPunts.length).toFixed(1) : null;

  const zones: ZoneCount[] = [
    { zone: "TB", label: "TB", count: counts.TB, color: "#f59e0b" },
    { zone: "inside10", label: "In 10", count: counts.inside10, color: "#00d4a0" },
    { zone: "inside20", label: "In 20", count: counts.inside20, color: "#00b484" },
    { zone: "fairCatch", label: "FC", count: counts.fairCatch, color: "#3b82f6" },
    { zone: "returned", label: "Ret", count: counts.returned, color: "#ef4444" },
  ];

  return (
    <div className="card">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Punt Landing Zones
      </p>

      {att === 0 ? (
        <div className="h-16 flex items-center justify-center text-xs text-muted">
          No punts logged yet
        </div>
      ) : (
        <>
          {/* Field strip visualization */}
          <div className="relative h-10 rounded-lg overflow-hidden flex mb-3 border border-border/50">
            {/* Endzone / TB */}
            <div className="w-[12%] h-full bg-yellow-500/20 border-r border-yellow-500/30 flex items-center justify-center shrink-0">
              <span className="text-[9px] text-yellow-400 font-bold">EZ</span>
            </div>
            {/* In 10 */}
            <div className="w-[12%] h-full bg-make/25 border-r border-make/30 flex items-center justify-center shrink-0">
              <span className="text-[9px] text-make font-bold">10</span>
            </div>
            {/* In 20 */}
            <div className="w-[12%] h-full bg-make/12 border-r border-make/20 flex items-center justify-center shrink-0">
              <span className="text-[9px] text-make font-bold">20</span>
            </div>
            {/* Rest of field */}
            <div className="flex-1 h-full bg-surface-2 flex items-center justify-center">
              <span className="text-[9px] text-muted">field</span>
            </div>
          </div>

          {/* Zone counts grid */}
          <div className="grid grid-cols-5 gap-1 text-center mb-3">
            {zones.map(({ zone, label, count, color }) => (
              <div key={zone}>
                <p className="text-xl font-extrabold" style={{ color }}>
                  {count}
                </p>
                <p className="text-[10px] text-muted">{label}</p>
              </div>
            ))}
          </div>

          {/* Key stats row 1 */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="card-2 text-center py-3">
              <p className="text-xl font-extrabold text-make">{inside20Pct}%</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Inside 20</p>
            </div>
            <div className="card-2 text-center py-3">
              <p className={`text-xl font-extrabold ${tbPct > 20 ? "text-warn" : "text-slate-300"}`}>
                {tbPct}%
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Touchback%</p>
            </div>
          </div>

          {/* Key stats row 2 */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="card-2 text-center py-3">
              <p className="text-xl font-extrabold text-slate-100">{avgYards}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Avg Yards</p>
            </div>
            <div className="card-2 text-center py-3">
              <p className="text-xl font-extrabold text-accent">{avgNet}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Avg Net</p>
            </div>
          </div>

          {/* DA stats row */}
          <div className={`grid gap-2 ${avgPoochYL ? "grid-cols-3" : "grid-cols-2"}`}>
            <div className="card-2 text-center py-3">
              <p className="text-xl font-extrabold text-slate-100">{avgDA}</p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Avg DA</p>
            </div>
            <div className="card-2 text-center py-3">
              <p className={`text-xl font-extrabold ${criticalCount > 0 ? "text-miss" : "text-slate-100"}`}>
                {criticalCount}
              </p>
              <p className="text-[10px] text-muted uppercase tracking-wider">Critical Dirs</p>
            </div>
            {avgPoochYL && (
              <div className="card-2 text-center py-3">
                <p className="text-xl font-extrabold text-accent">{avgPoochYL}</p>
                <p className="text-[10px] text-muted uppercase tracking-wider">Avg Pooch YL</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
