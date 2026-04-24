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

interface PuntTypeConfig { id: string; label: string; category: string; metric: "distance" | "yardline"; hangTime: boolean }
interface PuntCategoryConfig { id: string; label: string; enabled: boolean }

const DEFAULT_CATEGORIES: PuntCategoryConfig[] = [
  { id: "DIRECTIONAL", label: "Directional", enabled: true },
  { id: "POOCH", label: "Pooch", enabled: true },
  { id: "BANANA", label: "Banana", enabled: true },
  { id: "RUGBY", label: "Rugby", enabled: true },
];

const DEFAULT_PUNT_TYPES: PuntTypeConfig[] = [
  { id: "DIR_LEFT", label: "Left", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "DIR_STRAIGHT", label: "Straight", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "DIR_RIGHT", label: "Right", category: "DIRECTIONAL", metric: "distance", hangTime: true },
  { id: "POOCH_LEFT", label: "Pooch Left", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "POOCH_MIDDLE", label: "Pooch Middle", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "POOCH_RIGHT", label: "Pooch Right", category: "POOCH", metric: "yardline", hangTime: false },
  { id: "BANANA_LEFT", label: "Banana Left", category: "BANANA", metric: "distance", hangTime: true },
  { id: "BANANA_RIGHT", label: "Banana Right", category: "BANANA", metric: "distance", hangTime: true },
  { id: "RUGBY", label: "Rugby", category: "RUGBY", metric: "distance", hangTime: true },
];

function migrateType(t: Record<string, unknown>): PuntTypeConfig {
  const id = t.id as string;
  const upper = id.toUpperCase();
  let category = (t.category as string) ?? "DIRECTIONAL";
  if (!t.category) {
    if (upper.includes("POOCH")) category = "POOCH";
    else if (upper.includes("BANANA")) category = "BANANA";
    else if (upper.includes("RUGBY")) category = "RUGBY";
  }
  return {
    id,
    label: t.label as string,
    category,
    metric: (t.metric as "distance" | "yardline") ?? (upper.includes("POOCH") ? "yardline" : "distance"),
    hangTime: typeof t.hangTime === "boolean" ? t.hangTime : !upper.includes("POOCH"),
  };
}

function loadPuntSettings(): { types: PuntTypeConfig[]; categories: PuntCategoryConfig[] } {
  if (typeof window === "undefined") return { types: DEFAULT_PUNT_TYPES, categories: DEFAULT_CATEGORIES };
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const categories: PuntCategoryConfig[] = parsed.puntCategories?.length > 0 ? parsed.puntCategories : DEFAULT_CATEGORIES;
      const types = parsed.puntTypes?.length > 0
        ? (parsed.puntTypes as Record<string, unknown>[]).map(migrateType)
        : DEFAULT_PUNT_TYPES;
      return { types, categories };
    }
  } catch {}
  return { types: DEFAULT_PUNT_TYPES, categories: DEFAULT_CATEGORIES };
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
  athletes: { id: string; name: string }[];
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
          const s = statsMap[a.name];
          if (!s) return null;
          const b = getBucket(s);
          if (!b) return null;
          return (
            <tr key={a.id} className="hover:bg-surface/30 transition-colors">
              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a.name}</td>
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
  athletes: { id: string; name: string }[],
  history: { entries?: PuntEntry[] }[],
  filter: (p: PuntEntry) => boolean
): Record<string, PuntAthleteStats> {
  let statsMap: Record<string, PuntAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a.name] = emptyPuntStats(); });
  history.forEach((session) => {
    const punts = (session.entries ?? []) as PuntEntry[];
    punts.filter(filter).forEach((p) => {
      statsMap = processPunt(p, statsMap);
    });
  });
  return statsMap;
}

function CategorySection({
  title,
  athletes,
  catStats,
  statsMap,
  catTypeIds,
  typeLabels,
  isPoochCat,
  hasPoochData,
  poochYLStats,
  history,
  puntFilter,
}: {
  title: string;
  athletes: { id: string; name: string }[];
  catStats: Record<string, PuntAthleteStats>;
  statsMap: Record<string, PuntAthleteStats>;
  catTypeIds: string[];
  typeLabels: Record<string, string>;
  isPoochCat: boolean;
  hasPoochData: boolean;
  poochYLStats: Record<string, { att: number; total: number }>;
  history: { entries?: PuntEntry[] }[];
  puntFilter?: (p: PuntEntry) => boolean;
}) {
  // Types that actually have data
  const activeTypes = catTypeIds.filter((type) => athletes.some((a) => statsMap[a.name]?.byType[type]?.att > 0));
  const hasMultipleTypes = activeTypes.length > 0;

  // Tab options: "type" for By Type overview, then one per type for position breakdown
  const [subTab, setSubTab] = useState<string>("type");

  // Compute per-type stats (with byHash) for position breakdowns
  const typePositionStats = useMemo(() => {
    const result: Record<string, Record<string, PuntAthleteStats>> = {};
    activeTypes.forEach((type) => {
      result[type] = computeFilteredPuntStats(
        athletes,
        history,
        (p) => p.type === type && (puntFilter ? puntFilter(p) : true)
      );
    });
    return result;
  }, [athletes, history, activeTypes, puntFilter]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</p>

      {/* Overall — combined with YL for pooch */}
      <section className="card-2">
        {isPoochCat && hasPoochData ? (() => {
          const hasDistData = athletes.some((a) => {
            const o = catStats[a.name]?.overall;
            return o && (o.yardsAtt ?? o.att) > 0 && o.totalYards > 0;
          });
          return (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Avg YL</th>
                  {hasDistData && <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Dist</th>}
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">HT</th>
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">OT</th>
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">DA</th>
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Crit</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((a) => {
                  const o = catStats[a.name]?.overall;
                  if (!o || o.att === 0) return null;
                  const yl = poochYLStats[a.name];
                  const ylVal = yl && yl.att > 0 ? (yl.total / yl.att).toFixed(1) : "—";
                  const yAtt = o.yardsAtt ?? o.att;
                  const distVal = yAtt > 0 && o.totalYards > 0 ? (o.totalYards / yAtt).toFixed(1) : "—";
                  const hAtt = o.hangAtt ?? o.att;
                  const htVal = hAtt > 0 ? (o.totalHang / hAtt).toFixed(2) : "—";
                  const oAtt = o.opTimeAtt ?? o.att;
                  const otVal = oAtt > 0 ? (o.totalOpTime / oAtt).toFixed(2) : "—";
                  const dAtt = o.daAtt ?? o.att;
                  const daVal = dAtt > 0 ? `${Math.round((o.totalDirectionalAccuracy / dAtt) * 100)}%` : "—";
                  return (
                    <tr key={a.id} className="hover:bg-surface/30 transition-colors">
                      <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a.name}</td>
                      <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{o.att || "—"}</td>
                      <td className="text-xs text-accent font-semibold text-right py-1.5 px-1.5 border-t border-border/50">{ylVal}</td>
                      {hasDistData && <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{distVal}</td>}
                      <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{htVal}</td>
                      <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{otVal}</td>
                      <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{daVal}</td>
                      <td className={clsx("text-xs text-right py-1.5 px-1.5 border-t border-border/50", o.criticalDirections > 0 ? "text-miss" : "text-slate-200")}>
                        {o.criticalDirections || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        })() : (
          <PuntStatTable athletes={athletes} statsMap={catStats} getBucket={(s) => s.overall} />
        )}
      </section>

      {/* Tab toggle: By Type, then each type's position breakdown */}
      {hasMultipleTypes && (
        <div className="flex flex-wrap rounded-input border border-border overflow-hidden w-fit">
          <button
            onClick={() => setSubTab("type")}
            className={clsx(
              "px-4 py-1.5 text-xs font-semibold transition-colors",
              subTab === "type" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
            )}
          >
            By Type
          </button>
          {activeTypes.map((type) => (
            <button
              key={type}
              onClick={() => setSubTab(type)}
              className={clsx(
                "px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border",
                subTab === type ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              {typeLabels[type] ?? type} by Pos
            </button>
          ))}
        </div>
      )}

      {/* By Type */}
      {subTab === "type" && hasMultipleTypes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {activeTypes.map((type) => (
            <div key={type} className="card-2">
              <p className="text-xs font-semibold text-slate-300 mb-2">{typeLabels[type] ?? type}</p>
              <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byType[type]} />
            </div>
          ))}
        </div>
      )}

      {/* Per-type position breakdown */}
      {subTab !== "type" && typePositionStats[subTab] && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PUNT_HASHES.map((hash) => {
            const typeStats = typePositionStats[subTab];
            const hasHashData = athletes.some((a) => (typeStats[a.name]?.byHash[hash]?.att ?? 0) > 0);
            if (!hasHashData) return null;
            return (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                <PuntStatTable athletes={athletes} statsMap={typeStats} getBucket={(s) => s.byHash[hash]} />
              </div>
            );
          })}
        </div>
      )}

      {/* If only one type or none, show overall position breakdown */}
      {!hasMultipleTypes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PUNT_HASHES.map((hash) => {
            const hasHashData = athletes.some((a) => (catStats[a.name]?.byHash[hash]?.att ?? 0) > 0);
            if (!hasHashData) return null;
            return (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                <PuntStatTable athletes={athletes} statsMap={catStats} getBucket={(s) => s.byHash[hash]} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PuntStatsView({
  athletes,
  statsMap,
  puntTypes,
  puntCategories,
  typeLabels,
  label,
  history,
  puntFilter,
}: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, PuntAthleteStats>;
  puntTypes: PuntTypeConfig[];
  puntCategories: PuntCategoryConfig[];
  typeLabels: Record<string, string>;
  label: string;
  history: { entries?: PuntEntry[] }[];
  puntFilter?: (p: PuntEntry) => boolean;
}) {
  // Map any punt type to a category — handles legacy types not in current config
  const typeToCategory = useMemo(() => {
    const map: Record<string, string> = {};
    puntTypes.forEach((t) => { map[t.id] = t.category; });
    return (type: string): string | null => {
      if (map[type]) return map[type];
      const upper = type.toUpperCase();
      if (upper.includes("POOCH")) return "POOCH";
      if (upper.includes("BANANA")) return "BANANA";
      if (upper.includes("RUGBY")) return "RUGBY";
      return "DIRECTIONAL"; // default fallback for legacy types
    };
  }, [puntTypes]);

  // Compute per-category overall stats
  const categoryStats = useMemo(() => {
    const result: Record<string, Record<string, PuntAthleteStats>> = {};
    puntCategories.filter((c) => c.enabled).forEach((cat) => {
      result[cat.id] = computeFilteredPuntStats(
        athletes,
        history,
        (p) => typeToCategory(p.type) === cat.id && (puntFilter ? puntFilter(p) : true)
      );
    });
    return result;
  }, [athletes, history, puntCategories, puntFilter, typeToCategory]);
  // Discover all type IDs that have data (includes legacy types not in config)
  const allTypeIds = useMemo(() => {
    const configIds = new Set(puntTypes.map((t) => t.id));
    const dataIds = new Set<string>();
    athletes.forEach((a) => {
      const s = statsMap[a.name];
      if (!s) return;
      Object.entries(s.byType).forEach(([type, bucket]) => {
        if (bucket.att > 0) dataIds.add(type);
      });
    });
    // Configured types first (in order), then any legacy types with data
    const ordered: string[] = puntTypes.filter(({ id }) => dataIds.has(id)).map(({ id }) => id);
    dataIds.forEach((id) => { if (!configIds.has(id)) ordered.push(id); });
    return ordered;
  }, [athletes, statsMap, puntTypes]);

  // Compute per-athlete pooch landing YL from filtered history
  const poochYLStats = useMemo(() => {
    const result: Record<string, { att: number; total: number }> = {};
    athletes.forEach((a) => { result[a.name] = { att: 0, total: 0 }; });
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

  // Group allTypeIds by category
  const typesByCategory = useMemo(() => {
    const result: Record<string, string[]> = {};
    allTypeIds.forEach((id) => {
      const cat = typeToCategory(id);
      if (!cat) return;
      if (!result[cat]) result[cat] = [];
      result[cat].push(id);
    });
    return result;
  }, [allTypeIds, typeToCategory]);

  // Categories that actually have data
  const activeCats = useMemo(() => {
    return puntCategories.filter((c) => {
      if (!c.enabled || !categoryStats[c.id]) return false;
      return athletes.some((a) => (categoryStats[c.id][a.name]?.overall.att ?? 0) > 0);
    });
  }, [puntCategories, categoryStats, athletes]);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  // Auto-select first category with data
  const selectedCatId = activeCatId && activeCats.some((c) => c.id === activeCatId) ? activeCatId : activeCats[0]?.id ?? null;
  const selectedCat = activeCats.find((c) => c.id === selectedCatId);

  return (
    <div className="space-y-4">
      {/* Game chart — shows all punts with LOS + landing YL */}
      {gamePunts.length > 0 && (
        <section className="card-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Game Chart — All Punts</p>
          <PuntFieldView punts={gamePunts} />
        </section>
      )}

      {/* Category toggle */}
      {activeCats.length > 1 && (
        <div className="flex rounded-input border border-border overflow-hidden w-fit">
          {activeCats.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCatId(cat.id)}
              className={clsx(
                "px-4 py-1.5 text-xs font-semibold transition-colors",
                selectedCatId === cat.id ? "bg-accent text-slate-900" : "text-muted hover:text-white",
                cat.id !== activeCats[0].id && "border-l border-border"
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Selected category */}
      {selectedCat && categoryStats[selectedCat.id] && (
        <CategorySection
          title={`${selectedCat.label} Punts`}
          athletes={athletes}
          catStats={categoryStats[selectedCat.id]}
          statsMap={statsMap}
          catTypeIds={typesByCategory[selectedCat.id] ?? []}
          typeLabels={typeLabels}
          isPoochCat={selectedCat.id === "POOCH"}
          hasPoochData={hasPoochData}
          poochYLStats={poochYLStats}
          history={history}
          puntFilter={puntFilter}
        />
      )}
    </div>
  );
}

export default function PuntingStatisticsPage() {
  const { athletes, stats, history } = usePunt();
  const [puntTypes, setPuntTypes] = useState(DEFAULT_PUNT_TYPES);
  const [puntCategories, setPuntCategories] = useState(DEFAULT_CATEGORIES);
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
    const { types, categories } = loadPuntSettings();
    setPuntTypes(types);
    setPuntCategories(categories);
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
          onClick={() => exportPuntStats(athletes.map((a) => a.name), history as { date?: string; entries?: PuntEntry[] }[], hasStarred)}
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
        <PuntStatsView
          athletes={athletes}
          statsMap={displayStats}
          puntTypes={puntTypes}
          puntCategories={puntCategories}
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
          puntCategories={puntCategories}
          typeLabels={typeLabels}
          label="Live Reps"
          history={filteredHistory}
          puntFilter={(p) => !!p.starred}
        />
      )}
    </main>
  );
}
