"use client";

import { useState, useEffect, useMemo } from "react";
import { usePunt } from "@/lib/puntContext";
import { processPunt, emptyPuntStats } from "@/lib/stats";
import { PUNT_HASHES } from "@/types";
import type { PuntHash, PuntStatBucket, PuntAthleteStats, PuntEntry } from "@/types";
import clsx from "clsx";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";

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
  if (b.att === 0) return "—";
  return (b.totalYards / b.att).toFixed(1);
}

function avgHT(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return (b.totalHang / b.att).toFixed(2);
}

function avgOT(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return (b.totalOpTime / b.att).toFixed(2);
}

function avgDA(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return `${Math.round((b.totalDirectionalAccuracy / b.att) * 100)}%`;
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
}: {
  athletes: string[];
  statsMap: Record<string, PuntAthleteStats>;
  puntTypes: { id: string; label: string }[];
  typeLabels: Record<string, string>;
  label: string;
}) {
  return (
    <div className="space-y-4">
      {/* Overall */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Overall {label}</p>
        <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.overall} />
      </section>

      {/* By Type */}
      <CollapsibleSection title="By Type">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {puntTypes.map(({ id: type }) => (
            <div key={type} className="card-2">
              <p className="text-xs font-semibold text-slate-300 mb-2">{typeLabels[type] ?? type}</p>
              <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byType[type]} />
            </div>
          ))}
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
      {puntTypes.map(({ id: type }) => (
        <CollapsibleSection key={type} title={`${typeLabels[type] ?? type} — By Position`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PUNT_HASHES.map((hash) => (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byHash[hash]} />
              </div>
            ))}
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
  const dateFilter = useDateRangeFilter();

  const [includeLiveReps, setIncludeLiveReps] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const v = localStorage.getItem("punt_include_live_reps");
      return v === null ? true : v === "true";
    } catch { return true; }
  });

  const toggleIncludeLiveReps = (val: boolean) => {
    setIncludeLiveReps(val);
    try { localStorage.setItem("punt_include_live_reps", String(val)); } catch {}
  };

  useEffect(() => {
    const types = loadPuntTypes();
    setPuntTypes(types);
    const map: Record<string, string> = {};
    types.forEach((t) => { map[t.id] = t.label; });
    setTypeLabels(map);
  }, []);

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(history as { date?: string; entries?: PuntEntry[] }[]);
  }, [history, dateFilter.mode, dateFilter.range]) as { entries?: PuntEntry[] }[];

  const hasStarred = useMemo(() => {
    return filteredHistory.some((s) =>
      ((s.entries ?? []) as unknown as PuntEntry[]).some((p) => p.starred)
    );
  }, [filteredHistory]);

  const baseStats = useMemo(() => {
    if (dateFilter.mode === "all") return stats;
    return computeFilteredPuntStats(athletes, filteredHistory, () => true);
  }, [dateFilter.mode, filteredHistory, stats, athletes]);

  const displayStats = useMemo(() => {
    if (!hasStarred || includeLiveReps) return baseStats;
    return computeFilteredPuntStats(athletes, filteredHistory, (p) => !p.starred);
  }, [baseStats, hasStarred, includeLiveReps, athletes, filteredHistory]);

  const starredStats = useMemo(() => {
    if (!hasStarred) return null;
    return computeFilteredPuntStats(athletes, filteredHistory, (p) => !!p.starred);
  }, [hasStarred, athletes, filteredHistory]);

  const hasData = athletes.some((a) => stats[a]?.overall.att > 0);

  if (!hasData) {
    return (
      <main className="p-4 lg:p-6 max-w-5xl">
        <p className="text-sm text-muted">No punting data yet. Commit a practice to see statistics.</p>
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-6 space-y-4 max-w-5xl overflow-y-auto">
      {/* Date range filter */}
      <DateRangeFilter {...dateFilter} />

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
                onClick={() => toggleIncludeLiveReps(!includeLiveReps)}
                className={clsx(
                  "relative w-9 h-5 rounded-full transition-colors",
                  includeLiveReps ? "bg-accent" : "bg-border"
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                    includeLiveReps ? "left-[18px]" : "left-0.5"
                  )}
                />
              </button>
              <span className="text-xs text-slate-300">Include live reps</span>
            </div>
          )}
        </div>
      )}

      {tab === "all" && (
        <PuntStatsView athletes={athletes} statsMap={displayStats} puntTypes={puntTypes} typeLabels={typeLabels} label="Punts" />
      )}

      {tab === "starred" && starredStats && (
        <PuntStatsView athletes={athletes} statsMap={starredStats} puntTypes={puntTypes} typeLabels={typeLabels} label="Live Reps" />
      )}
    </main>
  );
}
