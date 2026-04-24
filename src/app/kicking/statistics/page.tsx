"use client";

import { useState, useEffect, useMemo } from "react";
import { useFG } from "@/lib/fgContext";
import { makePct, avgScore, processKick, emptyAthleteStats } from "@/lib/stats";
import { POSITIONS, DIST_RANGES } from "@/types";
import type { FGPosition, DistRange, AthleteStats, FGKick } from "@/types";
import clsx from "clsx";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportFGStats } from "@/lib/exportStats";
import { loadSettingsFromCloud } from "@/lib/settingsSync";

const POS_LABELS: Record<FGPosition, string> = {
  LH: "Left Hash",
  RH: "Right Hash",
  LM: "Left Middle",
  M: "Middle",
  RM: "Right Middle",
};

const DIST_LABELS: Record<DistRange, string> = {
  "20-29": "20–29 yds",
  "30-39": "30–39 yds",
  "40-49": "40–49 yds",
  "50-60": "50–60 yds",
  "60+": "60+ yds",
};

function StatTable({
  athletes,
  statsMap,
  getValue,
  showScore = true,
  maxScore = 3,
}: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, AthleteStats>;
  getValue: (s: AthleteStats) => { att: number; made: number; score: number };
  showScore?: boolean;
  maxScore?: number;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Made</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">%</th>
          {showScore && <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5 whitespace-nowrap">KS<span className="text-[8px] font-normal"> /{maxScore}</span></th>}
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a.name];
          if (!s) return null;
          const v = getValue(s);
          return (
            <tr key={a.id} className="hover:bg-surface/30 transition-colors">
              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a.name}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{v.made || "—"}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{v.att || "—"}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50 make-pct">{makePct(v.att, v.made)}</td>
              {showScore && <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgScore(v.att, v.score)}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between py-2 group"
      >
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">
          {title}
        </p>
        <span
          className={clsx(
            "text-muted text-sm transition-transform",
            open && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>
      {open && children}
    </section>
  );
}

function computeFilteredStats(
  athletes: { id: string; name: string }[],
  history: { entries?: FGKick[] }[],
  filter: (k: FGKick) => boolean
): Record<string, AthleteStats> {
  let statsMap: Record<string, AthleteStats> = {};
  athletes.forEach((a) => { statsMap[a.name] = emptyAthleteStats(); });
  history.forEach((session) => {
    const kicks = (session.entries ?? []) as FGKick[];
    kicks.filter(filter).forEach((k) => {
      statsMap = processKick(k, statsMap);
    });
  });
  return statsMap;
}

function FGStatsView({
  athletes,
  statsMap,
  label,
  makeMode = "detailed",
}: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, AthleteStats>;
  label: string;
  makeMode?: "simple" | "detailed";
}) {
  return (
    <div className="space-y-4">
      {/* Overall FG */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Overall {label}</p>
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Made</th>
              <th className="table-header">Att</th>
              <th className="table-header">%</th>
              <th className="table-header whitespace-nowrap"><span className="hidden sm:inline">Kick Score</span><span className="sm:hidden">KS</span><br/><span className="text-[9px] font-normal text-muted hidden sm:inline">Out of 3</span><span className="text-[8px] font-normal text-muted sm:hidden">/3</span></th>
              <th className="table-header"><span className="hidden sm:inline">Long FG</span><span className="sm:hidden">Long</span></th>
              <th className="table-header"><span className="hidden sm:inline">Avg OT</span><span className="sm:hidden">OT</span></th>
            </tr>
          </thead>
          <tbody>
            {athletes.map((a) => {
              const s = statsMap[a.name];
              if (!s) return null;
              const o = s.overall;
              const avgOT = (o.opTimeAtt || 0) > 0 ? ((o.totalOpTime || 0) / o.opTimeAtt).toFixed(2) : "—";
              return (
                <tr key={a.id} className="hover:bg-surface/30 transition-colors">
                  <td className="table-name">{a.name}</td>
                  <td className="table-cell">{o.made || "—"}</td>
                  <td className="table-cell">{o.att || "—"}</td>
                  <td className="table-cell make-pct">{makePct(o.att, o.made)}</td>
                  <td className="table-cell">{avgScore(o.att, o.score)}</td>
                  <td className="table-cell">{o.longFG > 0 ? `${o.longFG} yd` : "—"}</td>
                  <td className="table-cell">{avgOT !== "—" ? `${avgOT}s` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Miss Chart */}
      <CollapsibleSection title="Miss Chart">
        <div className="card-2">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header"><span className="hidden sm:inline">Miss </span>Left</th>
                <th className="table-header"><span className="hidden sm:inline">Miss </span>Right</th>
                <th className="table-header"><span className="hidden sm:inline">Miss </span>Short</th>
                <th className="table-header">Total</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = statsMap[a.name];
                if (!s) return null;
                const total = s.miss.XL + s.miss.XR + s.miss.XS + s.miss.X;
                return (
                  <tr key={a.id} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a.name}</td>
                    <td className="table-cell text-miss">{s.miss.XL || "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XR || "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XS || "—"}</td>
                    <td className="table-cell text-miss font-semibold">{total || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* Make Chart — only shown when detailed make mode and data exists */}
      {makeMode === "detailed" && athletes.some((a) => {
        const m = statsMap[a.name]?.make;
        return m && (m.YL > 0 || m.YC > 0 || m.YR > 0);
      }) && (
      <CollapsibleSection title="Make Chart">
        <div className="card-2">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header"><span className="hidden sm:inline">Make </span>Left</th>
                <th className="table-header"><span className="hidden sm:inline">Make </span>Middle</th>
                <th className="table-header"><span className="hidden sm:inline">Make </span>Right</th>
                <th className="table-header">Total</th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = statsMap[a.name];
                if (!s) return null;
                const m = s.make ?? { YL: 0, YC: 0, YR: 0 };
                const total = m.YL + m.YC + m.YR;
                if (total === 0) return null;
                return (
                  <tr key={a.id} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a.name}</td>
                    <td className="table-cell text-make">{m.YL || "—"}</td>
                    <td className="table-cell text-make">{m.YC || "—"}</td>
                    <td className="table-cell text-make">{m.YR || "—"}</td>
                    <td className="table-cell text-make font-semibold">{total || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      )}

      {/* Op Time — only show if any athlete has op time data */}
      {athletes.some((a) => (statsMap[a.name]?.overall.opTimeAtt || 0) > 0) && (
      <CollapsibleSection title="Operation Time">
        <div className="card-2">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Avg OT</th>
                <th className="table-header"><span className="hidden sm:inline">Kicks w/ </span>OT<span className="sm:hidden"> #</span></th>
              </tr>
            </thead>
            <tbody>
              {athletes.map((a) => {
                const s = statsMap[a.name];
                if (!s) return null;
                const ot = s.overall.opTimeAtt || 0;
                const avg = ot > 0 ? ((s.overall.totalOpTime || 0) / ot).toFixed(2) : "—";
                return (
                  <tr key={a.id} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a.name}</td>
                    <td className="table-cell">{avg !== "—" ? `${avg}s` : "—"}</td>
                    <td className="table-cell text-muted">{ot || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
      )}

      {/* By Hash / Position */}
      <CollapsibleSection title="By Hash / Position">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["LH", "RH"] as FGPosition[]).map((pos) => (
              <div key={pos} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[pos]}</p>
                <StatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.position[pos]} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["LM", "M", "RM"] as FGPosition[]).map((pos) => (
              <div key={pos} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[pos]}</p>
                <StatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.position[pos]} />
              </div>
            ))}
          </div>
        </div>
      </CollapsibleSection>

      {/* By Distance */}
      <CollapsibleSection title="By Distance">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {DIST_RANGES.map((range) => {
            const maxScore = range === "50-60" || range === "60+" ? 4 : 3;
            return (
              <div key={range} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{DIST_LABELS[range]}</p>
                <StatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.distance[range]} maxScore={maxScore} />
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* PAT */}
      <CollapsibleSection title="PAT">
        <div className="card-2">
          <StatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.pat ?? { att: 0, made: 0, score: 0 }} showScore={false} />
        </div>
      </CollapsibleSection>
    </div>
  );
}

export default function KickingStatisticsPage() {
  const { athletes, stats, history } = useFG();
  const [tab, setTab] = useState<"all" | "starred">("all");
  const [gameMode, setGameMode] = useState<"practice" | "game">("practice");
  const dateFilter = useDateRangeFilter();

  const [makeMode, setMakeMode] = useState<"simple" | "detailed">(() => {
    if (typeof window === "undefined") return "detailed";
    try {
      const raw = localStorage.getItem("fgSettings");
      if (raw) return JSON.parse(raw).makeMode === "simple" ? "simple" : "detailed";
    } catch {}
    return "detailed";
  });

  useEffect(() => {
    loadSettingsFromCloud<{ makeMode?: string }>("fgSettings").then((cloud) => {
      if (cloud?.makeMode === "simple" || cloud?.makeMode === "detailed") setMakeMode(cloud.makeMode);
    });
  }, []);

  const [excludeLiveReps, setExcludeLiveReps] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = localStorage.getItem("fg_exclude_live_reps");
      return v === "true";
    } catch { return false; }
  });

  const toggleExcludeLiveReps = (val: boolean) => {
    setExcludeLiveReps(val);
    try { localStorage.setItem("fg_exclude_live_reps", String(val)); } catch {}
  };

  const modeHistory = useMemo(() => {
    return history.filter((s) => gameMode === "game" ? s.mode === "game" : s.mode !== "game");
  }, [history, gameMode]);

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(modeHistory as { date?: string; entries?: FGKick[] }[]);
  }, [modeHistory, dateFilter.mode, dateFilter.range]) as { entries?: FGKick[] }[];

  const hasStarred = useMemo(() => {
    return filteredHistory.some((s) =>
      ((s.entries ?? []) as unknown as FGKick[]).some((k) => k.starred)
    );
  }, [filteredHistory]);

  const baseStats = useMemo(() => {
    // Use cached stats only when showing practice + all dates (what cache represents)
    if (gameMode === "practice" && dateFilter.mode === "all") return stats;
    return computeFilteredStats(athletes, filteredHistory, () => true);
  }, [gameMode, dateFilter.mode, filteredHistory, stats, athletes]);

  const displayStats = useMemo(() => {
    if (!hasStarred || !excludeLiveReps) return baseStats;
    return computeFilteredStats(athletes, filteredHistory, (k) => !k.starred);
  }, [baseStats, hasStarred, excludeLiveReps, athletes, filteredHistory]);

  const starredStats = useMemo(() => {
    if (!hasStarred) return null;
    return computeFilteredStats(athletes, filteredHistory, (k) => !!k.starred);
  }, [hasStarred, athletes, filteredHistory]);

  const hasAnyData = history.length > 0;

  return (
    <main className="p-4 lg:p-6 space-y-4 max-w-5xl overflow-y-auto">
      {/* Practice / Game mode toggle */}
      <div className="flex rounded-input border border-border overflow-hidden w-fit">
        <button
          onClick={() => setGameMode("practice")}
          className={clsx(
            "px-4 py-1.5 text-xs font-semibold transition-colors",
            gameMode === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
          )}
        >
          Practice Stats
        </button>
        <button
          onClick={() => setGameMode("game")}
          className={clsx(
            "px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border",
            gameMode === "game" ? "bg-red-500 text-white" : "text-red-400/60 hover:text-red-400"
          )}
        >
          GAME Stats
        </button>
      </div>

      {!hasAnyData && (
        <p className="text-sm text-muted">No kicking data yet. Commit a session to see statistics.</p>
      )}

      {hasAnyData && modeHistory.length === 0 && (
        <p className="text-sm text-muted">No {gameMode} sessions yet.</p>
      )}

      {/* Header with date filter + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportFGStats(athletes.map((a) => a.name), history as { date?: string; entries?: FGKick[] }[], hasStarred)}
          className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
        >
          Export
        </button>
      </div>

      {/* Tabs + toggle */}
      {hasStarred && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex rounded-input border border-border overflow-hidden">
            <button
              onClick={() => setTab("all")}
              className={clsx(
                "px-4 py-1.5 text-xs font-semibold transition-colors",
                tab === "all"
                  ? "bg-accent text-slate-900"
                  : "text-muted hover:text-white"
              )}
            >
              All Stats
            </button>
            <button
              onClick={() => setTab("starred")}
              className={clsx(
                "px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border",
                tab === "starred"
                  ? "bg-amber-500 text-slate-900"
                  : "text-amber-400/60 hover:text-amber-400"
              )}
            >
              Live Reps ★
            </button>
          </div>
          {tab === "all" && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleExcludeLiveReps(!excludeLiveReps)}
                className={clsx(
                  "relative w-9 h-5 rounded-full transition-colors",
                  excludeLiveReps ? "bg-accent" : "bg-border"
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                    excludeLiveReps ? "left-[18px]" : "left-0.5"
                  )}
                />
              </button>
              <span className="text-xs text-slate-300">Include live reps</span>
            </div>
          )}
        </div>
      )}

      {tab === "all" && (
        <FGStatsView athletes={athletes} statsMap={displayStats} label="FG" makeMode={makeMode} />
      )}

      {tab === "starred" && starredStats && (
        <FGStatsView athletes={athletes} statsMap={starredStats} label="Live Reps" makeMode={makeMode} />
      )}
    </main>
  );
}
