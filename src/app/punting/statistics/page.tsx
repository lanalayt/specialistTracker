"use client";

import { useState, useEffect, useMemo } from "react";
import { usePunt } from "@/lib/puntContext";
import { PuntFieldView } from "@/components/ui/PuntFieldView";
import { processPunt, emptyPuntStats } from "@/lib/stats";
import { PUNT_HASHES } from "@/types";
import type { PuntHash, PuntStatBucket, PuntAthleteStats, PuntEntry } from "@/types";
import clsx from "clsx";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportPuntStats } from "@/lib/exportStats";

const DEFAULT_PUNT_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "POOCH_BLUE", label: "Pooch - Blue" },
  { id: "POOCH_RED", label: "Pooch - Red" },
  { id: "BROWN", label: "Brown" },
];

function loadPuntTypes(): { id: string; label: string }[] {
  if (typeof window === "undefined") return DEFAULT_PUNT_TYPES;
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.puntTypes && parsed.puntTypes.length > 0) return parsed.puntTypes;
    }
  } catch {}
  return DEFAULT_PUNT_TYPES;
}

const POS_LABELS: Record<PuntHash, string> = {
  LH: "Left Hash",
  LM: "Left Middle",
  M: "Middle",
  RM: "Right Middle",
  RH: "Right Hash",
};

function avgYds(b: PuntStatBucket): string {
  const count = b.yardsAtt ?? b.att;
  if (count === 0) return "—";
  return (b.totalYards / count).toFixed(1);
}

function avgHT(b: PuntStatBucket): string {
  const count = b.hangAtt ?? b.att;
  if (count === 0) return "—";
  return (b.totalHang / count).toFixed(2);
}

function avgOT(b: PuntStatBucket): string {
  const count = b.opTimeAtt ?? b.att;
  if (count === 0) return "—";
  return (b.totalOpTime / count).toFixed(2);
}

function avgDA(b: PuntStatBucket): string {
  const count = b.daAtt ?? b.att;
  if (count === 0) return "—";
  return `${Math.round((b.totalDirectionalAccuracy / count) * 100)}%`;
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

function PuntStatTable({
  athletes,
  statsMap,
  getBucket,
}: {
  athletes: string[];
  statsMap: Record<string, PuntAthleteStats>;
  getBucket: (s: PuntAthleteStats) => PuntStatBucket;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Dist</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">HT</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">OT</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">DA</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Crit</th>
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a];
          if (!s) return null;
          const b = getBucket(s);
          return (
            <tr key={a} className="hover:bg-surface/30 transition-colors">
              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{b.att || "—"}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgYds(b)}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgHT(b)}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgOT(b)}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgDA(b)}</td>
              <td className={clsx("text-xs text-right py-1.5 px-1.5 border-t border-border/50", b.criticalDirections > 0 ? "text-miss" : "text-slate-200")}>
                {b.criticalDirections || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function computeFilteredPuntStats(
  athletes: string[],
  history: { entries?: PuntEntry[] }[],
  filter: (p: PuntEntry) => boolean
): Record<string, PuntAthleteStats> {
  let statsMap: Record<string, PuntAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyPuntStats(); });
  history.forEach((session) => {
    const punts = (session.entries ?? []) as PuntEntry[];
    punts.filter(filter).forEach((p) => {
      statsMap = processPunt(p, statsMap);
    });
  });
  return statsMap;
}

function PuntStatsView({
  athletes,
  statsMap,
  puntTypes,
  typeLabels,
  label,
  history,
  puntFilter,
}: {
  athletes: string[];
  statsMap: Record<string, PuntAthleteStats>;
  puntTypes: { id: string; label: string }[];
  typeLabels: Record<string, string>;
  label: string;
  history: { entries?: PuntEntry[] }[];
  puntFilter?: (p: PuntEntry) => boolean;
}) {
  // Compute per-type stats maps for accurate position breakdowns
  const typeStatsMaps = useMemo(() => {
    const result: Record<string, Record<string, PuntAthleteStats>> = {};
    puntTypes.forEach(({ id: type }) => {
      if (!athletes.some((a) => statsMap[a]?.byType[type]?.att > 0)) return;
      result[type] = computeFilteredPuntStats(
        athletes,
        history,
        (p) => p.type === type && (puntFilter ? puntFilter(p) : true)
      );
    });
    return result;
  }, [athletes, history, puntTypes, statsMap, puntFilter]);

  // Compute per-athlete pooch landing YL from filtered history
  const poochYLStats = useMemo(() => {
    const result: Record<string, { att: number; total: number }> = {};
    athletes.forEach((a) => { result[a] = { att: 0, total: 0 }; });
    history.forEach((session) => {
      (session.entries ?? []).forEach((p) => {
        if (puntFilter && !puntFilter(p)) return;
        const isPooch = typeof p.type === "string" && p.type.toUpperCase().includes("POOCH");
        if (!isPooch) return;
        if (p.poochLandingYardLine == null) return;
        if (!result[p.athlete]) result[p.athlete] = { att: 0, total: 0 };
        result[p.athlete].att += 1;
        result[p.athlete].total += p.poochLandingYardLine;
      });
    });
    return result;
  }, [athletes, history, puntFilter]);

  const hasPoochData = Object.values(poochYLStats).some((s) => s.att > 0);

  // All game punts with LOS + landing YL for the field view
  const gamePunts = useMemo(() => {
    const all: PuntEntry[] = [];
    history.forEach((session) => {
      (session.entries ?? []).forEach((p) => {
        if (puntFilter && !puntFilter(p)) return;
        if (p.los != null && p.landingYL != null) all.push(p);
      });
    });
    return all;
  }, [history, puntFilter]);

  return (
    <div className="space-y-4">
      {/* Overall */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Overall {label}</p>
        <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.overall} />
      </section>

      {/* Game chart — shows all punts with LOS + landing YL */}
      {gamePunts.length > 0 && (
        <section className="card-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Game Chart — All Punts</p>
          <PuntFieldView punts={gamePunts} />
        </section>
      )}

      {/* Pooch Stats — Avg Landing YL instead of distance */}
      {hasPoochData && (
        <section className="card-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Pooch Punts</p>
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
                <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
                <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Avg YL</th>
                <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">HT</th>
                <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">DA</th>
              </tr>
            </thead>
            <tbody>
              {athletes.filter((a) => poochYLStats[a]?.att > 0).map((a) => {
                const s = poochYLStats[a];
                const avgYL = s.att > 0 ? (s.total / s.att).toFixed(1) : "—";
                // Get pooch-specific HT and DA from byType buckets
                const poochTypes = puntTypes.filter(({ id }) => id.toUpperCase().includes("POOCH"));
                let poochHangTotal = 0, poochHangAtt = 0, poochDATotal = 0, poochDAAtt = 0;
                poochTypes.forEach(({ id }) => {
                  const b = statsMap[a]?.byType[id];
                  if (b) {
                    poochHangTotal += b.totalHang;
                    poochHangAtt += (b.hangAtt ?? 0);
                    poochDATotal += b.totalDirectionalAccuracy;
                    poochDAAtt += (b.daAtt ?? 0);
                  }
                });
                const avgHT = poochHangAtt > 0 ? (poochHangTotal / poochHangAtt).toFixed(2) : "—";
                const avgDA = poochDAAtt > 0 ? `${Math.round((poochDATotal / poochDAAtt) * 100)}%` : "—";
                return (
                  <tr key={a} className="hover:bg-surface/30 transition-colors">
                    <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a}</td>
                    <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{s.att}</td>
                    <td className="text-xs text-accent font-semibold text-right py-1.5 px-1.5 border-t border-border/50">{avgYL}</td>
                    <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgHT}</td>
                    <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgDA}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* By Type */}
      <CollapsibleSection title="By Type">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {puntTypes
            .filter(({ id: type }) => athletes.some((a) => statsMap[a]?.byType[type]?.att > 0))
            .map(({ id: type }) => {
              const isPooch = type.toUpperCase().includes("POOCH");
              if (isPooch) {
                // Pooch types: show Avg YL instead of Dist
                return (
                  <div key={type} className="card-2">
                    <p className="text-xs font-semibold text-slate-300 mb-2">{typeLabels[type] ?? type}</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
                          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
                          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Avg YL</th>
                          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">HT</th>
                          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">DA</th>
                        </tr>
                      </thead>
                      <tbody>
                        {athletes.map((a) => {
                          const b = statsMap[a]?.byType[type];
                          if (!b || b.att === 0) return null;
                          const ylData = poochYLStats[a];
                          const avgYL = ylData && ylData.att > 0 ? (ylData.total / ylData.att).toFixed(1) : "—";
                          const ht = (b.hangAtt ?? 0) > 0 ? ((b.totalHang / (b.hangAtt ?? b.att)).toFixed(2)) : "—";
                          const da = (b.daAtt ?? 0) > 0 ? `${Math.round((b.totalDirectionalAccuracy / (b.daAtt ?? b.att)) * 100)}%` : "—";
                          return (
                            <tr key={a} className="hover:bg-surface/30 transition-colors">
                              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a}</td>
                              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{b.att}</td>
                              <td className="text-xs text-accent font-semibold text-right py-1.5 px-1.5 border-t border-border/50">{avgYL}</td>
                              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{ht}</td>
                              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{da}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              }
              return (
                <div key={type} className="card-2">
                  <p className="text-xs font-semibold text-slate-300 mb-2">{typeLabels[type] ?? type}</p>
                  <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byType[type]} />
                </div>
              );
            })}
        </div>
      </CollapsibleSection>

      {/* By Hash / Position */}
      <CollapsibleSection title="By Hash / Position">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PUNT_HASHES.map((hash) => (
            <div key={hash} className="card-2">
              <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
              <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byHash[hash]} />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Per-Type Position Breakdown */}
      {puntTypes.filter(({ id: type }) => athletes.some((a) => statsMap[a]?.byType[type]?.att > 0)).map(({ id: type }) => (
        <CollapsibleSection key={type} title={`${typeLabels[type] ?? type} — By Position`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PUNT_HASHES.map((hash) => {
              const typeStats = typeStatsMaps[type];
              if (!typeStats) return null;
              const hasData = athletes.some((a) => typeStats[a]?.byHash[hash]?.att > 0);
              if (!hasData) return null;
              return (
                <div key={hash} className="card-2">
                  <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                  <PuntStatTable athletes={athletes} statsMap={typeStats} getBucket={(s) => s.byHash[hash]} />
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

export default function PuntingStatisticsPage() {
  const { athletes, stats, history } = usePunt();
  const [puntTypes, setPuntTypes] = useState(DEFAULT_PUNT_TYPES);
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"all" | "starred">("all");
  const [gameMode, setGameMode] = useState<"practice" | "game">("practice");
  const dateFilter = useDateRangeFilter();

  const [excludeLiveReps, setExcludeLiveReps] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = localStorage.getItem("punt_exclude_live_reps");
      return v === "true";
    } catch { return false; }
  });

  const toggleExcludeLiveReps = (val: boolean) => {
    setExcludeLiveReps(val);
    try { localStorage.setItem("punt_exclude_live_reps", String(val)); } catch {}
  };

  useEffect(() => {
    const types = loadPuntTypes();
    setPuntTypes(types);
    const map: Record<string, string> = {};
    types.forEach((t) => { map[t.id] = t.label; });
    setTypeLabels(map);
  }, []);

  const modeHistory = useMemo(() => {
    return history.filter((s) => gameMode === "game" ? s.mode === "game" : s.mode !== "game");
  }, [history, gameMode]);

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(modeHistory as { date?: string; entries?: PuntEntry[] }[]);
  }, [modeHistory, dateFilter.mode, dateFilter.range]) as { entries?: PuntEntry[] }[];

  const hasStarred = useMemo(() => {
    return filteredHistory.some((s) =>
      ((s.entries ?? []) as unknown as PuntEntry[]).some((p) => p.starred)
    );
  }, [filteredHistory]);

  const baseStats = useMemo(() => {
    if (gameMode === "practice" && dateFilter.mode === "all") return stats;
    return computeFilteredPuntStats(athletes, filteredHistory, () => true);
  }, [gameMode, dateFilter.mode, filteredHistory, stats, athletes]);

  const displayStats = useMemo(() => {
    if (!hasStarred || !excludeLiveReps) return baseStats;
    return computeFilteredPuntStats(athletes, filteredHistory, (p) => !p.starred);
  }, [baseStats, hasStarred, excludeLiveReps, athletes, filteredHistory]);

  const starredStats = useMemo(() => {
    if (!hasStarred) return null;
    return computeFilteredPuntStats(athletes, filteredHistory, (p) => !!p.starred);
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
        <p className="text-sm text-muted">No punting data yet. Commit a session to see statistics.</p>
      )}

      {hasAnyData && modeHistory.length === 0 && (
        <p className="text-sm text-muted">No {gameMode} sessions yet.</p>
      )}

      {/* Header with date filter + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportPuntStats(athletes, history as { date?: string; entries?: PuntEntry[] }[], hasStarred)}
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
              <span className="text-xs text-slate-300">Exclude live reps</span>
            </div>
          )}
        </div>
      )}

      {tab === "all" && (
        <PuntStatsView
          athletes={athletes}
          statsMap={displayStats}
          puntTypes={puntTypes}
          typeLabels={typeLabels}
          label="Punts"
          history={filteredHistory}
          puntFilter={!hasStarred || !excludeLiveReps ? undefined : (p) => !p.starred}
        />
      )}

      {tab === "starred" && starredStats && (
        <PuntStatsView
          athletes={athletes}
          statsMap={starredStats}
          puntTypes={puntTypes}
          typeLabels={typeLabels}
          label="Live Reps"
          history={filteredHistory}
          puntFilter={(p) => !!p.starred}
        />
      )}
    </main>
  );
}
