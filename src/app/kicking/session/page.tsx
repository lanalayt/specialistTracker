"use client";

import { useState } from "react";
import { KickEntryCard } from "@/components/ui/KickEntryCard";
import { SessionLog } from "@/components/ui/SessionLog";
import { LiveFGStats } from "@/components/ui/LiveSessionStats";
import { StatCard } from "@/components/ui/StatCard";
import { SessionSummary } from "@/components/ui/SessionSummary";
import { useFG } from "@/lib/fgContext";
import { makePct } from "@/lib/stats";
import type { FGKick } from "@/types";
import clsx from "clsx";

export default function KickingSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice, resetAll } = useFG();
  const [sessionKicks, setSessionKicks] = useState<FGKick[]>([]);
  const [pendingKicks, setPendingKicks] = useState<FGKick[] | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        made: acc.made + s.overall.made,
        score: acc.score + s.overall.score,
        longFG: Math.max(acc.longFG, s.overall.longFG),
      };
    },
    { att: 0, made: 0, score: 0, longFG: 0 }
  );

  const handleAddKick = (kick: FGKick) => setSessionKicks((prev) => [...prev, kick]);
  const handleDeleteKick = (idx: number) => setSessionKicks((prev) => prev.filter((_, i) => i !== idx));
  const handleCommitReady = () => { if (sessionKicks.length === 0) return; setPendingKicks(sessionKicks); };
  const handleConfirmCommit = () => {
    if (!pendingKicks) return;
    commitPractice(pendingKicks);
    setSessionKicks([]);
    setPendingKicks(null);
  };
  const handleUndo = () => { const ok = undoLastCommit(); if (!ok) alert("Nothing to undo"); };
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
            {sessionKicks.length > 0
              ? `${sessionKicks.length} kick${sessionKicks.length !== 1 ? "s" : ""} in progress — continue where you left off.`
              : "Ready to start? Hit the button to begin logging kicks."}
          </p>
          <button
            onClick={() => setSessionStarted(true)}
            className="btn-primary py-3 px-8 text-sm w-full"
          >
            {sessionKicks.length > 0 ? "▶ Continue Session" : "▶ Start Session"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Entry card + Session log */}
        <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
          <div className="overflow-y-auto border-b border-border">
            <KickEntryCard
              athletes={athletes}
              kickCount={sessionKicks.length}
              onAdd={handleAddKick}
            />
          </div>
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Session Log
              {sessionKicks.length > 0 && (
                <span className="text-accent ml-2">({sessionKicks.length})</span>
              )}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <SessionLog kicks={sessionKicks} onDelete={handleDeleteKick} />
          </div>
          <div className="border-t border-border p-3 flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex gap-2">
              {canUndo && (
                <button onClick={handleUndo} className="btn-ghost text-xs py-1.5 px-3">
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
              onClick={handleCommitReady}
              disabled={sessionKicks.length === 0}
              className="btn-primary text-xs py-2 px-5"
            >
              Commit Session{sessionKicks.length > 0 && ` (${sessionKicks.length})`}
            </button>
          </div>
        </div>

        {/* Right: Live stats */}
        <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Season %" value={makePct(totals.att, totals.made)} accent glow />
            <StatCard label="Attempts" value={totals.att || "—"} />
            <StatCard label="Long FG" value={totals.longFG > 0 ? `${totals.longFG} yd` : "—"} />
          </div>
          <LiveFGStats kicks={sessionKicks} />
        </div>
      </main>

      {pendingKicks && (
        <SessionSummary
          kicks={pendingKicks}
          label={new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "numeric",
            day: "numeric",
          })}
          onConfirm={handleConfirmCommit}
          onCancel={() => setPendingKicks(null)}
        />
      )}
    </>
  );
}
