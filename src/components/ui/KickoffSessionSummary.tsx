"use client";

import React from "react";
import type { KickoffEntry } from "@/types";

interface KOTypeConfig {
  id: string;
  label: string;
  category: string;
  metric: string;
  hangTime: boolean;
}

interface KickoffSessionSummaryProps {
  kicks: KickoffEntry[];
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
  sessionMode?: "practice" | "game";
  typeConfigs?: KOTypeConfig[];
}

function getMetric(type: string, typeConfigs?: KOTypeConfig[]): string {
  return typeConfigs?.find((t) => t.id === type)?.metric ?? "distance";
}

export function KickoffSessionSummary({
  kicks,
  label,
  onConfirm,
  onCancel,
  sessionMode = "practice",
  typeConfigs,
}: KickoffSessionSummaryProps) {
  // In practice mode, only show deep kickoffs in the recap
  const recapKicks = sessionMode === "practice" && typeConfigs
    ? kicks.filter((k) => {
        const cfg = typeConfigs.find((t) => t.id === k.type);
        return cfg ? cfg.category === "DEEP" : true;
      })
    : kicks;

  // Separate distance vs yardline kicks
  const distKicks = recapKicks.filter((k) => k.distance > 0 && getMetric(k.type, typeConfigs) === "distance");
  const ylKicks = recapKicks.filter((k) => k.distance > 0 && getMetric(k.type, typeConfigs) === "yardline");
  const htEntries = recapKicks.filter((k) => k.hangTime > 0);

  const avgDist = distKicks.length > 0 ? (distKicks.reduce((s, k) => s + k.distance, 0) / distKicks.length).toFixed(1) : null;
  const avgYL = ylKicks.length > 0 ? (ylKicks.reduce((s, k) => s + k.distance, 0) / ylKicks.length).toFixed(1) : null;
  const avgHT = htEntries.length > 0 ? (htEntries.reduce((s, k) => s + k.hangTime, 0) / htEntries.length).toFixed(2) : "—";
  const athletes = [...new Set(recapKicks.map((k) => k.athlete))];

  const byAthlete = athletes.map((a) => {
    const ak = recapKicks.filter((k) => k.athlete === a);
    const akDist = ak.filter((k) => k.distance > 0 && getMetric(k.type, typeConfigs) === "distance");
    const akYL = ak.filter((k) => k.distance > 0 && getMetric(k.type, typeConfigs) === "yardline");
    const akHt = ak.filter((k) => k.hangTime > 0);
    return {
      name: a,
      count: ak.length,
      avgDist: akDist.length > 0 ? (akDist.reduce((s, k) => s + k.distance, 0) / akDist.length).toFixed(1) : null,
      avgYL: akYL.length > 0 ? (akYL.reduce((s, k) => s + k.distance, 0) / akYL.length).toFixed(1) : null,
      avgHT: akHt.length > 0 ? (akHt.reduce((s, k) => s + k.hangTime, 0) / akHt.length).toFixed(2) : "—",
    };
  });

  const nonDeepCount = kicks.length - recapKicks.length;

  // How many summary stat cards to show
  const statCards: { value: string; label: string; color: string }[] = [
    { value: String(recapKicks.length), label: sessionMode === "practice" ? "Deep KOs" : "Kickoffs", color: "text-accent" },
  ];
  if (avgDist) statCards.push({ value: avgDist, label: "Avg Dist", color: "text-make" });
  if (avgYL) statCards.push({ value: avgYL, label: "Avg YL", color: "text-accent" });
  statCards.push({ value: `${avgHT}s`, label: "Avg HT", color: "text-slate-100" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md shadow-accent-lg">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold text-slate-100">
            {sessionMode === "game" ? "Commit Game" : "Commit Practice"}
          </h2>
          <p className="text-sm text-muted mt-0.5">{label}</p>
        </div>

        <div className="p-5 space-y-4">
          {sessionMode === "practice" && nonDeepCount > 0 && (
            <p className="text-[10px] text-muted">
              Showing deep kickoffs only. {nonDeepCount} other kickoff{nonDeepCount !== 1 ? "s" : ""} (sky, squib, onside) will still be saved.
            </p>
          )}

          <div className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${Math.min(statCards.length, 4)}, minmax(0, 1fr))` }}>
            {statCards.map((card) => (
              <div key={card.label} className="card-2 text-center">
                <p className={`text-2xl font-extrabold ${card.color}`}>{card.value}</p>
                <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>

          {byAthlete.length > 0 && (
          <div className="card-2 space-y-1.5">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
              By Athlete{sessionMode === "practice" ? " — Deep Kickoffs" : ""}
            </p>
            {byAthlete.map((a) => (
              <div key={a.name} className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-200">{a.name}</span>
                <span className="text-muted">
                  {a.count} kicks
                  {a.avgDist && <> · <span className="text-slate-300 font-semibold">{a.avgDist} yd</span></>}
                  {a.avgYL && <> · <span className="text-accent font-semibold">{a.avgYL} YL</span></>}
                  {a.avgHT !== "—" && <span className="text-slate-300"> · {a.avgHT}s</span>}
                </span>
              </div>
            ))}
          </div>
          )}

          <p className="text-xs text-muted">
            This will save all {kicks.length} kickoff{kicks.length !== 1 ? "s" : ""} to cumulative stats. You can undo once after committing.
          </p>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1">
            Commit {kicks.length} kickoff{kicks.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
