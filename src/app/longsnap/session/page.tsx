"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { SnapEntryCard } from "@/components/ui/SnapEntryCard";
import { SnapTimeBars } from "@/components/ui/SnapTimeBars";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct } from "@/lib/stats";
import type { LongSnapEntry, SnapBenchmark } from "@/types";
import clsx from "clsx";
import { cloudGet, cloudSet } from "@/lib/supabaseData";
import { getCloudUserId } from "@/lib/amplify";
import { useCloudDraftSync } from "@/lib/useCloudDraftSync";

const BM_COLORS: Record<SnapBenchmark, string> = {
  excellent: "text-make",
  good: "text-accent",
  needsWork: "text-miss",
};

const BM_LABELS: Record<SnapBenchmark, string> = {
  excellent: "Exc",
  good: "Good",
  needsWork: "NW",
};

const ACC_LABEL: Record<string, string> = {
  ON_TARGET: "✓",
  HIGH: "↑",
  LOW: "↓",
  LEFT: "←",
  RIGHT: "→",
};

export default function LongSnapSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice } = useLongSnap();
  const { isAthlete } = useAuth();
  const [sessionSnaps, setSessionSnaps] = useState<LongSnapEntry[]>([]);
  const [committed, setCommitted] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [weather, setWeather] = useState("");

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        onTarget: acc.onTarget + s.overall.onTarget,
        totalTime: acc.totalTime + s.overall.totalTime,
      };
    },
    { att: 0, onTarget: 0, totalTime: 0 }
  );

  const avgTime = totals.att > 0 ? (totals.totalTime / totals.att).toFixed(2) : "—";
  const onTargetPct = makePct(totals.att, totals.onTarget);

  // Poll for draft changes from other devices
  useCloudDraftSync<{ sessionSnaps: LongSnapEntry[]; sessionStarted: boolean; weather?: string }>(
    "longsnap_session_draft",
    (cloud) => {
      if (cloud && cloud.sessionSnaps) {
        setSessionSnaps(cloud.sessionSnaps);
        setSessionStarted(cloud.sessionStarted ?? false);
        if (cloud.weather !== undefined) setWeather(cloud.weather);
      }
    }
  );

  // Sync session snaps to cloud
  const saveSnapsToCloud = useCallback((snaps: LongSnapEntry[]) => {
    const userId = getCloudUserId();
    if (userId && userId !== "local-dev") {
      cloudSet(userId, "longsnap_session_draft", { sessionSnaps: snaps, sessionStarted: true, weather });
    }
  }, [weather]);

  // Load session from cloud on mount
  useEffect(() => {
    const userId = getCloudUserId();
    if (userId && userId !== "local-dev") {
      cloudGet<{ sessionSnaps: LongSnapEntry[]; sessionStarted: boolean; weather?: string }>(userId, "longsnap_session_draft").then((cloud) => {
        if (cloud && cloud.sessionSnaps && cloud.sessionSnaps.length > 0) {
          setSessionSnaps(cloud.sessionSnaps);
          setSessionStarted(cloud.sessionStarted ?? false);
          if (cloud.weather) setWeather(cloud.weather);
        }
      });
    }
  }, []);

  const handleAddSnap = (snap: LongSnapEntry) => {
    setSessionSnaps((prev) => {
      const next = [...prev, snap];
      saveSnapsToCloud(next);
      return next;
    });
  };
  const handleDeleteSnap = (idx: number) => {
    setSessionSnaps((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      saveSnapsToCloud(next);
      return next;
    });
  };

  const handleCommit = () => {
    if (sessionSnaps.length === 0) return;
    commitPractice(sessionSnaps, undefined, weather);
    setSessionSnaps([]);
    setCommitted(true);
    setWeather("");
    setTimeout(() => setCommitted(false), 2000);
  };

  if (!sessionStarted) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-slate-100">Practice Log</h2>
          <p className="text-sm text-muted">
            {sessionSnaps.length > 0
              ? `${sessionSnaps.length} snap${sessionSnaps.length !== 1 ? "s" : ""} in progress.`
              : "Ready to start? Hit the button to begin logging snaps."}
          </p>
          {!isAthlete ? (
            <button
              onClick={() => setSessionStarted(true)}
              className="btn-primary py-3 px-8 text-sm w-full"
            >
              {sessionSnaps.length > 0 ? "▶ Continue Session" : "▶ Start Session"}
            </button>
          ) : (
            <p className="text-xs text-warn font-semibold">View Only — Athlete accounts cannot start sessions</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left: Entry card + session log */}
      <div className="lg:w-[55%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
        {/* Weather input */}
        <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
          <input
            type="text"
            value={weather}
            onChange={(e) => setWeather(e.target.value)}
            readOnly={isAthlete}
            placeholder="e.g. 72°F, Sunny, Wind 10mph SW"
            className="flex-1 bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
          />
        </div>
        <div className="overflow-y-auto border-b border-border">
          <div className={isAthlete ? "pointer-events-none opacity-60" : ""}>
            <SnapEntryCard
              athletes={athletes}
              snapCount={sessionSnaps.length}
              onAdd={handleAddSnap}
            />
          </div>
        </div>

        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Session Log
            {sessionSnaps.length > 0 && (
              <span className="text-accent ml-2">({sessionSnaps.length})</span>
            )}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border/30">
          {sessionSnaps.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-xs text-muted">
              No snaps logged yet
            </div>
          ) : (
            [...sessionSnaps].reverse().map((s, ri) => {
              const idx = sessionSnaps.length - 1 - ri;
              const bm = s.benchmark;
              return (
                <div
                  key={idx}
                  className="flex items-center px-4 py-2.5 hover:bg-surface-2/30 transition-colors"
                >
                  <span className="text-xs text-muted w-6 shrink-0">#{idx + 1}</span>
                  <span className="text-sm font-medium text-slate-200 w-20 shrink-0 truncate">
                    {s.athlete}
                  </span>
                  <span className="text-xs text-muted w-12 shrink-0">{s.snapType}</span>
                  <span className="text-xs font-bold text-slate-100 w-16 shrink-0">
                    {s.time.toFixed(3)}s
                  </span>
                  <span
                    className={clsx(
                      "text-xs font-semibold w-8 shrink-0",
                      s.accuracy === "ON_TARGET" ? "text-make" : "text-warn"
                    )}
                  >
                    {ACC_LABEL[s.accuracy] ?? s.accuracy}
                  </span>
                  {bm && (
                    <span className={clsx("text-xs font-bold flex-1", BM_COLORS[bm])}>
                      {BM_LABELS[bm]}
                    </span>
                  )}
                  {!isAthlete && (
                    <button
                      onClick={() => handleDeleteSnap(idx)}
                      className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm ml-2"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-3 flex items-center gap-2 shrink-0">
          {!isAthlete && (
            <>
              {canUndo && (
                <button onClick={undoLastCommit} className="btn-ghost text-xs py-1.5 px-3">
                  ↩ Undo
                </button>
              )}
            </>
          )}
          <div className="flex-1" />
          {!isAthlete && (
            <button
              onClick={handleCommit}
              disabled={sessionSnaps.length === 0}
              className={clsx("btn-primary text-xs py-2 px-5", committed && "bg-make/90")}
            >
              {committed
                ? "✓ Committed!"
                : `Commit Session${sessionSnaps.length > 0 ? ` (${sessionSnaps.length})` : ""}`}
            </button>
          )}
        </div>
      </div>

      {/* Right: Stats */}
      <div className="lg:w-[45%] overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="On-Target%" value={onTargetPct} accent glow />
          <StatCard label="Avg Time" value={totals.att > 0 ? `${avgTime}s` : "—"} />
          <StatCard label="Total Snaps" value={totals.att || "—"} />
        </div>
        <SnapTimeBars entries={sessionSnaps} athletes={athletes} />
      </div>
    </main>
  );
}
