"use client";

import { useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { PuntEntryCard } from "@/components/ui/PuntEntryCard";
import { PuntFieldStrip } from "@/components/ui/PuntFieldStrip";
import { usePunt } from "@/lib/puntContext";
import type { PuntEntry } from "@/types";
import clsx from "clsx";

const LANDING_LABEL: Record<string, string> = {
  TB: "TB",
  inside10: "In10",
  inside20: "In20",
  returned: "Ret",
  fairCatch: "FC",
};

const DA_LABEL: Record<string, string> = {
  "1": "Good",
  "0.5": "Mid",
  "0": "Critical",
};

export default function PuntingSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice, resetAll } = usePunt();
  const [sessionPunts, setSessionPunts] = useState<PuntEntry[]>([]);
  const [committed, setCommitted] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        totalYards: acc.totalYards + s.overall.totalYards,
        totalHang: acc.totalHang + s.overall.totalHang,
        long: Math.max(acc.long, s.overall.long),
      };
    },
    { att: 0, totalYards: 0, totalHang: 0, long: 0 }
  );

  const avgYards = totals.att > 0 ? (totals.totalYards / totals.att).toFixed(1) : "—";
  const avgHang = totals.att > 0 ? (totals.totalHang / totals.att).toFixed(2) : "—";

  const handleAddPunt = (punt: PuntEntry) => setSessionPunts((prev) => [...prev, punt]);
  const handleDeletePunt = (idx: number) => setSessionPunts((prev) => prev.filter((_, i) => i !== idx));

  const handleCommit = () => {
    if (sessionPunts.length === 0) return;
    commitPractice(sessionPunts);
    setSessionPunts([]);
    setCommitted(true);
    setTimeout(() => setCommitted(false), 2000);
  };

  const handleReset = () => {
    if (!showReset) { setShowReset(true); return; }
    resetAll();
    setShowReset(false);
  };

  if (!sessionStarted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-slate-100">Practice Log</h2>
          <p className="text-sm text-muted">
            {sessionPunts.length > 0
              ? `${sessionPunts.length} punt${sessionPunts.length !== 1 ? "s" : ""} in progress.`
              : "Ready to start? Hit the button to begin logging punts."}
          </p>
          <button
            onClick={() => setSessionStarted(true)}
            className="btn-primary py-3 px-8 text-sm w-full"
          >
            {sessionPunts.length > 0 ? "▶ Continue Session" : "▶ Start Session"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left: Entry card + session log */}
      <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
        <div className="overflow-y-auto border-b border-border">
          <PuntEntryCard
            athletes={athletes}
            puntCount={sessionPunts.length}
            onAdd={handleAddPunt}
          />
        </div>

        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Session Log
            {sessionPunts.length > 0 && (
              <span className="text-accent ml-2">({sessionPunts.length})</span>
            )}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border/30">
          {sessionPunts.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-xs text-muted">
              No punts logged yet
            </div>
          ) : (
            [...sessionPunts].reverse().map((p, ri) => {
              const idx = sessionPunts.length - 1 - ri;
              return (
                <div
                  key={idx}
                  className="flex items-center px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
                >
                  <span className="text-xs text-muted w-6 shrink-0">#{idx + 1}</span>
                  <span className="text-sm font-medium text-slate-200 w-16 shrink-0 truncate">
                    {p.athlete}
                  </span>
                  <span className="text-xs text-muted w-12 shrink-0">{p.yards}yd</span>
                  <span className="text-xs text-muted w-10 shrink-0">{p.hangTime.toFixed(1)}s</span>
                  <span className="text-xs text-accent w-20 shrink-0">
                    {Array.isArray(p.landingZones) && p.landingZones.length > 0
                      ? p.landingZones.map((z) => LANDING_LABEL[z] ?? z).join("+")
                      : ">20"}
                  </span>
                  <span className={`text-xs w-14 shrink-0 ${p.directionalAccuracy === 0 ? "text-miss" : p.directionalAccuracy === 0.5 ? "text-warn" : "text-make"}`}>
                    {DA_LABEL[String(p.directionalAccuracy ?? 0.5)] ?? "Mid"}
                  </span>
                  <button
                    onClick={() => handleDeletePunt(idx)}
                    className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm ml-auto"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2 shrink-0 flex-wrap">
          <div className="flex gap-2">
            {canUndo && (
              <button onClick={undoLastCommit} className="btn-ghost text-xs py-1.5 px-3">
                ↩ Undo
              </button>
            )}
            <button
              onClick={handleReset}
              onBlur={() => setShowReset(false)}
              className={clsx(
                "text-xs py-1.5 px-3 rounded-input border transition-all",
                showReset
                  ? "bg-miss/20 border-miss/40 text-miss"
                  : "border-border text-muted hover:text-slate-300 hover:bg-surface-2"
              )}
            >
              {showReset ? "Confirm Reset All" : "Reset All"}
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleCommit}
            disabled={sessionPunts.length === 0}
            className={clsx("btn-primary text-xs py-2 px-5", committed && "bg-make/90")}
          >
            {committed
              ? "✓ Committed!"
              : `Commit Session${sessionPunts.length > 0 ? ` (${sessionPunts.length})` : ""}`}
          </button>
        </div>
      </div>

      {/* Right: Stats */}
      <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Avg Yards" value={avgYards} accent glow />
          <StatCard label="Avg Hang" value={totals.att > 0 ? `${avgHang}s` : "—"} />
          <StatCard label="Long Punt" value={totals.long > 0 ? `${totals.long} yd` : "—"} />
        </div>
        <PuntFieldStrip punts={sessionPunts} />
      </div>
    </main>
  );
}
