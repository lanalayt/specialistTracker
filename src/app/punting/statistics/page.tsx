"use client";

import { useState, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { usePunt } from "@/lib/puntContext";
import { processPunt, emptyPuntStats, isPuntTouchback, TOUCHBACK_NET_PENALTY } from "@/lib/stats";
import { PUNT_HASHES } from "@/types";
import type { PuntHash, PuntStatBucket, PuntAthleteStats, PuntEntry } from "@/types";
import clsx from "clsx";
import { Tooltip } from "@/components/ui/Tooltip";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportPuntStats, exportPuntStatsPDF } from "@/lib/exportStats";
import { loadSettingsFromCloud, getCachedSettings, getAppPref, setAppPref } from "@/lib/settingsSync";
import { ExportButton } from "@/components/ui/ExportButton";

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
  try {
    const parsed = getCachedSettings<{ puntCategories?: PuntCategoryConfig[]; puntTypes?: Record<string, unknown>[] }>("puntSettings");
    if (parsed) {
      const categories: PuntCategoryConfig[] = (parsed.puntCategories?.length ?? 0) > 0 ? parsed.puntCategories! : DEFAULT_CATEGORIES;
      const types = (parsed.puntTypes?.length ?? 0) > 0
        ? parsed.puntTypes!.map(migrateType)
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

// Pooch only: average landing yard line (game stats).
function avgYL(b: PuntStatBucket): string {
  const count = b.poochYardLineAtt ?? 0;
  if (count === 0) return "—";
  return ((b.poochYardLineTotal ?? 0) / count).toFixed(1);
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
  metric,
}: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, PuntAthleteStats>;
  getBucket: (s: PuntAthleteStats) => PuntStatBucket;
  metric?: "distance" | "yardline";
}) {
  const isYL = metric === "yardline";
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Dist</th>
          {isYL && <th className="text-[10px] font-semibold text-accent uppercase tracking-wider text-right py-1.5 px-1.5">Avg YL</th>}
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">HT</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">OT</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">DA</th>
          <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Crit<Tooltip text="Critical Direction — Any punt with a direction score of 0" /></th>
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a.name];
          if (!s) return null;
          const b = getBucket(s);
          if (!b || b.att === 0) return null;
          return (
            <tr key={a.id} className="hover:bg-surface/30 transition-colors">
              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a.name}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{b.att || "—"}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{avgYds(b)}</td>
              {isYL && <td className="text-xs text-accent font-semibold text-right py-1.5 px-1.5 border-t border-border/50">{avgYL(b)}</td>}
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
  filter: (p: PuntEntry) => boolean,
  typeConfigs?: { id: string; metric: "distance" | "yardline"; hangTime: boolean }[]
): Record<string, PuntAthleteStats> {
  let statsMap: Record<string, PuntAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a.name] = emptyPuntStats(); });
  const GAME_TYPES = new Set(["LINE_GOLF", "PUNT_BATTLE"]);
  history.forEach((session) => {
    const punts = (session.entries ?? []) as PuntEntry[];
    punts.filter((p) => !GAME_TYPES.has(p.type) && filter(p)).forEach((p) => {
      // Pass the type's config so yard-line types (e.g. a custom "Brown"/rugby
      // set to yard line) are averaged correctly — without it processPunt falls
      // back to the "POOCH"-in-name heuristic and drops the Avg YL.
      const tc = typeConfigs?.find((t) => t.id === p.type);
      statsMap = processPunt(p, statsMap, tc);
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
  typeMetrics,
  isPoochCat,
  hasPoochData,
  poochYLStats,
  history,
  puntFilter,
  typeConfigs,
}: {
  title: string;
  athletes: { id: string; name: string }[];
  catStats: Record<string, PuntAthleteStats>;
  statsMap: Record<string, PuntAthleteStats>;
  catTypeIds: string[];
  typeLabels: Record<string, string>;
  typeMetrics: Record<string, "distance" | "yardline">;
  isPoochCat: boolean;
  hasPoochData: boolean;
  poochYLStats: Record<string, { att: number; total: number }>;
  history: { entries?: PuntEntry[] }[];
  puntFilter?: (p: PuntEntry) => boolean;
  typeConfigs?: { id: string; metric: "distance" | "yardline"; hangTime: boolean }[];
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
        (p) => p.type === type && (puntFilter ? puntFilter(p) : true),
        typeConfigs
      );
    });
    return result;
  }, [athletes, history, activeTypes, puntFilter, typeConfigs]);

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
                  <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Crit<Tooltip text="Critical Direction — Any punt with a direction score of 0" /></th>
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
              <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byType[type]} metric={typeMetrics[type]} />
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
                <PuntStatTable athletes={athletes} statsMap={typeStats} getBucket={(s) => s.byHash[hash]} metric={typeMetrics[subTab]} />
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
  typeMetrics,
  label,
  history,
  puntFilter,
}: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, PuntAthleteStats>;
  puntTypes: PuntTypeConfig[];
  puntCategories: PuntCategoryConfig[];
  typeLabels: Record<string, string>;
  typeMetrics: Record<string, "distance" | "yardline">;
  label: string;
  history: { entries?: PuntEntry[]; mode?: string }[];
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

  const typeConfigs = useMemo(
    () => puntTypes.map((t) => ({ id: t.id, metric: t.metric, hangTime: t.hangTime })),
    [puntTypes]
  );

  // Compute per-category overall stats
  const categoryStats = useMemo(() => {
    const result: Record<string, Record<string, PuntAthleteStats>> = {};
    puntCategories.filter((c) => c.enabled).forEach((cat) => {
      result[cat.id] = computeFilteredPuntStats(
        athletes,
        history,
        (p) => typeToCategory(p.type) === cat.id && (puntFilter ? puntFilter(p) : true),
        typeConfigs
      );
    });
    return result;
  }, [athletes, history, puntCategories, puntFilter, typeToCategory, typeConfigs]);
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

  // All game punts with LOS + landing YL for the field view. Practice punts can
  // also carry yard lines now (yard-line distance entry), so gate on the
  // session mode — otherwise practice reps would land in the game stats.
  const gamePunts = useMemo(() => {
    const all: PuntEntry[] = [];
    history.forEach((session) => {
      if (session.mode !== "game") return;
      (session.entries ?? []).forEach((p) => {
        if (puntFilter && !puntFilter(p)) return;
        if (p.los != null && p.landingYL != null) all.push(p);
      });
    });
    return all;
  }, [history, puntFilter]);

  // Stat highlights derived from all game punts
  const gameHighlights = useMemo(() => {
    const n = gamePunts.length;
    if (n === 0) return null;
    let grossTotal = 0;
    let returnTotal = 0;
    let hangTotal = 0;
    let hangCount = 0;
    let touchbacks = 0;
    let inside20 = 0;
    let inside10 = 0;
    let fairCatches = 0;
    gamePunts.forEach((p) => {
      grossTotal += p.yards ?? 0;
      returnTotal += p.returnYards ?? 0;
      if (p.hangTime && p.hangTime > 0) {
        hangTotal += p.hangTime;
        hangCount += 1;
      }
      if (p.fairCatch) fairCatches += 1;
      const yl = p.landingYL ?? 0;
      const isTouchback = isPuntTouchback(p);
      if (isTouchback) {
        touchbacks += 1;
      } else {
        if (yl >= 80 && yl < 100) inside20 += 1;
        if (yl >= 90 && yl < 100) inside10 += 1;
      }
    });
    // NCAA net punt average: (gross − return yards − 20 per touchback) / punts
    const net = (grossTotal - returnTotal - TOUCHBACK_NET_PENALTY * touchbacks) / n;
    return {
      total: n,
      avgDistance: (grossTotal / n).toFixed(1),
      netAverage: net.toFixed(1),
      avgHang: hangCount > 0 ? (hangTotal / hangCount).toFixed(2) : "—",
      inside20,
      inside10,
      touchbacks,
      fairCatches,
    };
  }, [gamePunts]);

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
      {/* Stat highlights — key game punting numbers */}
      {gameHighlights && (
        <section className="card-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Stat Highlights</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Punts", value: gameHighlights.total },
              { label: "Avg Distance", value: gameHighlights.avgDistance },
              { label: "Net Average", value: gameHighlights.netAverage },
              { label: "Avg Hang Time", value: gameHighlights.avgHang },
              { label: "Inside the 20", value: gameHighlights.inside20 },
              { label: "Inside the 10", value: gameHighlights.inside10 },
              { label: "Touchbacks", value: gameHighlights.touchbacks },
              { label: "Fair Catches", value: gameHighlights.fairCatches },
            ].map((stat) => (
              <div key={stat.label} className="rounded-input border border-border bg-surface-2 px-3 py-2.5 text-center">
                <p className="text-xl font-extrabold text-slate-100">{stat.value}</p>
                <p className="text-[11px] text-muted mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
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
          typeMetrics={typeMetrics}
          isPoochCat={selectedCat.id === "POOCH"}
          hasPoochData={hasPoochData}
          poochYLStats={poochYLStats}
          history={history}
          puntFilter={puntFilter}
          typeConfigs={typeConfigs}
        />
      )}
    </div>
  );
}

export default function PuntingStatisticsPage() {
  const pathname = usePathname();
  const isAthleteMode = pathname.startsWith("/athlete");
  const { athletes, stats, history } = usePunt();
  const [puntTypes, setPuntTypes] = useState(DEFAULT_PUNT_TYPES);
  const [puntCategories, setPuntCategories] = useState(DEFAULT_CATEGORIES);
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  const [typeMetrics, setTypeMetrics] = useState<Record<string, "distance" | "yardline">>({});
  const [tab, setTab] = useState<"all" | "starred">("all");
  const [gameMode, setGameMode] = useState<"practice" | "game">("practice");
  const dateFilter = useDateRangeFilter();

  const [excludeLiveReps, setExcludeLiveReps] = useState(() => getAppPref<boolean>("puntExcludeLiveReps") === true);

  const toggleExcludeLiveReps = (val: boolean) => {
    setExcludeLiveReps(val);
    setAppPref("puntExcludeLiveReps", val);
  };

  useEffect(() => {
    const reload = () => {
      const { types, categories } = loadPuntSettings();
      setPuntTypes(types);
      setPuntCategories(categories);
      const map: Record<string, string> = {};
      const metrics: Record<string, "distance" | "yardline"> = {};
      types.forEach((t) => { map[t.id] = t.label; metrics[t.id] = t.metric; });
      setTypeLabels(map);
      setTypeMetrics(metrics);
    };
    reload();
    loadSettingsFromCloud("puntSettings").then(reload);
    window.addEventListener("settingsChanged", reload);
    return () => window.removeEventListener("settingsChanged", reload);
  }, []);

  const modeHistory = useMemo(() => {
    return history.filter((s) => !s.label?.startsWith("Line Golf") && !s.label?.startsWith("Punt Battle") && (gameMode === "game" ? s.mode === "game" : s.mode !== "game"));
  }, [history, gameMode]);

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(modeHistory as { date?: string; entries?: PuntEntry[] }[]);
  }, [modeHistory, dateFilter.mode, dateFilter.range]) as { entries?: PuntEntry[] }[];

  const hasStarred = useMemo(() => {
    return filteredHistory.some((s) =>
      ((s.entries ?? []) as unknown as PuntEntry[]).some((p) => p.starred)
    );
  }, [filteredHistory]);

  // Per-type metric/hangTime configs, so filtered recomputes match the main
  // stats (yard-line types keep their Avg YL in every breakdown).
  const typeConfigs = useMemo(
    () => puntTypes.map((t) => ({ id: t.id, metric: t.metric, hangTime: t.hangTime })),
    [puntTypes]
  );

  const baseStats = useMemo(() => {
    if (gameMode === "practice" && dateFilter.mode === "all") return stats;
    return computeFilteredPuntStats(athletes, filteredHistory, () => true, typeConfigs);
  }, [gameMode, dateFilter.mode, filteredHistory, stats, athletes, typeConfigs]);

  const displayStats = useMemo(() => {
    if (!hasStarred || !excludeLiveReps) return baseStats;
    return computeFilteredPuntStats(athletes, filteredHistory, (p) => !p.starred, typeConfigs);
  }, [baseStats, hasStarred, excludeLiveReps, athletes, filteredHistory, typeConfigs]);

  const starredStats = useMemo(() => {
    if (!hasStarred) return null;
    return computeFilteredPuntStats(athletes, filteredHistory, (p) => !!p.starred, typeConfigs);
  }, [hasStarred, athletes, filteredHistory, typeConfigs]);

  const hasAnyData = history.length > 0;

  return (
    <main className="p-4 lg:p-6 space-y-4 max-w-5xl overflow-y-auto">
      {/* Practice / Game mode toggle */}
      {!isAthleteMode && (
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
      )}

      {!hasAnyData && (
        <p className="text-sm text-muted">No punting data yet. Commit a session to see statistics.</p>
      )}

      {hasAnyData && modeHistory.length === 0 && (
        <p className="text-sm text-muted">No {gameMode} sessions yet.</p>
      )}

      {/* Header with date filter + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <div className="flex gap-2">
          <ExportButton onExcel={() => exportPuntStats(athletes.map((a) => a.name), history as { date?: string; entries?: PuntEntry[] }[], hasStarred)} onPDF={() => exportPuntStatsPDF(athletes.map((a) => a.name), history as { date?: string; entries?: PuntEntry[] }[], puntTypes.map((t) => ({ id: t.id, label: t.label })))} />
        </div>
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
          typeMetrics={typeMetrics}
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
          typeMetrics={typeMetrics}
          label="Live Reps"
          history={filteredHistory}
          puntFilter={(p) => !!p.starred}
        />
      )}
    </main>
  );
}
