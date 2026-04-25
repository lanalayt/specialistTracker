"use client";

import { useMemo, useState, useEffect } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import type { KickoffEntry, KickoffHash } from "@/types";
import { KICKOFF_HASHES } from "@/types";
import clsx from "clsx";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportKickoffStats } from "@/lib/exportStats";

const LEGACY_TYPE_LABELS: Record<string, string> = {
  REG: "Regular",
  ONSIDE: "Onside",
  SQUIB: "Squib",
  FREE: "Free",
};

const POS_LABELS: Record<KickoffHash, string> = {
  LH: "Left Hash",
  LM: "Left Middle",
  M: "Middle",
  RM: "Right Middle",
  RH: "Right Hash",
};

type DirectionMode = "numeric" | "field";

interface KOTypeConfig { id: string; label: string; category: string; metric: "distance" | "yardline" | "none"; hangTime: boolean }
interface KOCategory { id: string; label: string; enabled: boolean }

const DEFAULT_CATEGORIES: KOCategory[] = [
  { id: "DEEP", label: "Deep Kickoffs", enabled: true },
  { id: "SKY", label: "Sky Kick", enabled: true },
  { id: "SQUIB", label: "Squib", enabled: true },
  { id: "ONSIDE", label: "Onside", enabled: true },
];

const DEFAULT_KO_TYPES: KOTypeConfig[] = [
  { id: "DEEP_LEFT", label: "Directional Left", category: "DEEP", metric: "distance", hangTime: true },
  { id: "DEEP_RIGHT", label: "Directional Right", category: "DEEP", metric: "distance", hangTime: true },
  { id: "SKY", label: "Sky Kick", category: "SKY", metric: "distance", hangTime: true },
  { id: "SQUIB_LEFT", label: "Left", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "SQUIB_MID", label: "Middle", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "SQUIB_RIGHT", label: "Right", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "ONSIDE", label: "Onside", category: "ONSIDE", metric: "none", hangTime: false },
];

function migrateType(t: Record<string, unknown>): KOTypeConfig {
  const id = t.id as string;
  const upper = id.toUpperCase();
  let category = (t.category as string) ?? "DEEP";
  if (!t.category) {
    if (upper.includes("SQUIB")) category = "SQUIB";
    else if (upper.includes("SKY")) category = "SKY";
    else if (upper.includes("ONSIDE")) category = "ONSIDE";
    else category = "DEEP";
  }
  return {
    id,
    label: t.label as string,
    category,
    metric: (t.metric as "distance" | "yardline" | "none") ?? "distance",
    hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
  };
}

function loadKoSettings(): { types: KOTypeConfig[]; categories: KOCategory[]; dirMode: DirectionMode; directions: { id: string; label: string; score?: number }[] } {
  const defaults = {
    types: DEFAULT_KO_TYPES,
    categories: DEFAULT_CATEGORIES,
    dirMode: "numeric" as DirectionMode,
    directions: [{ id: "1", label: "1.0" }, { id: "0.5", label: "0.5" }, { id: "0", label: "0" }, { id: "-1", label: "OB" }],
  };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem("kickoffSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawTypes = parsed.kickoffTypes?.length > 0 ? parsed.kickoffTypes : DEFAULT_KO_TYPES;
      return {
        types: (rawTypes as Record<string, unknown>[]).map(migrateType),
        categories: parsed.kickoffCategories?.length > 0 ? parsed.kickoffCategories : DEFAULT_CATEGORIES,
        dirMode: parsed.directionMode === "field" ? "field" : "numeric",
        directions: parsed.directionMetrics?.length > 0 ? parsed.directionMetrics : defaults.directions,
      };
    }
  } catch {}
  return defaults;
}

function dirToNum(d: string, directions?: { id: string; score?: number }[]): number | null {
  if (d === "1") return 1;
  if (d === "0.5") return 0.5;
  if (d === "0") return 0;
  if (d === "-1" || d === "OB") return -1;
  if (directions) {
    const opt = directions.find((o) => o.id === d);
    if (opt && opt.score != null) return opt.score;
  }
  return null;
}

interface AthleteKOStats {
  att: number;
  totalDist: number;
  distAtt: number;
  totalHang: number;
  hangAtt: number;
  dirSum: number;
  dirAtt: number;
  endzones: number;
  dirCounts: Record<string, number>;
}

function emptyStats(): AthleteKOStats {
  return { att: 0, totalDist: 0, distAtt: 0, totalHang: 0, hangAtt: 0, dirSum: 0, dirAtt: 0, endzones: 0, dirCounts: {} };
}

function addEntry(s: AthleteKOStats, e: KickoffEntry, directions?: { id: string; score?: number }[]): AthleteKOStats {
  const dir = dirToNum(e.direction, directions);
  const dirCounts = { ...s.dirCounts };
  if (e.direction) {
    dirCounts[e.direction] = (dirCounts[e.direction] || 0) + 1;
  }
  return {
    att: s.att + 1,
    totalDist: s.totalDist + (e.distance > 0 ? e.distance : 0),
    distAtt: s.distAtt + (e.distance > 0 ? 1 : 0),
    totalHang: s.totalHang + (e.hangTime > 0 ? e.hangTime : 0),
    hangAtt: s.hangAtt + (e.hangTime > 0 ? 1 : 0),
    dirSum: s.dirSum + (dir != null ? dir : 0),
    dirAtt: s.dirAtt + (dir != null ? 1 : 0),
    endzones: s.endzones + (e.endzone ? 1 : 0),
    dirCounts,
  };
}

function avgDist(s: AthleteKOStats): string {
  return s.distAtt > 0 ? (s.totalDist / s.distAtt).toFixed(1) : "—";
}

function avgHang(s: AthleteKOStats): string {
  return s.hangAtt > 0 ? (s.totalHang / s.hangAtt).toFixed(2) : "—";
}

function dirPct(s: AthleteKOStats): string {
  return s.dirAtt > 0 ? `${Math.round((s.dirSum / s.dirAtt) * 100)}%` : "—";
}

function ezPct(s: AthleteKOStats): string {
  return s.att > 0 ? `${Math.round((s.endzones / s.att) * 100)}%` : "—";
}

function StatTable({ athletes, statsMap, showEZ = true, metric, showHang }: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, AthleteKOStats>;
  showEZ?: boolean;
  metric?: "distance" | "yardline" | "none";
  showHang?: boolean;
}) {
  const isYL = metric === "yardline";
  const visible = athletes.filter((a) => (statsMap[a.name]?.att ?? 0) > 0);
  if (visible.length === 0) {
    return <p className="text-xs text-muted p-2">No data.</p>;
  }
  const hasHang = showHang ?? visible.some((a) => statsMap[a.name]?.hangAtt > 0);
  return (
    <table className="w-full text-xs sm:text-sm">
      <thead>
        <tr>
          <th className="table-header text-left">Athlete</th>
          <th className="table-header">KOs</th>
          <th className={clsx("table-header", isYL && "text-accent")}>{isYL ? "YL" : "Dist"}</th>
          {hasHang && <th className="table-header">Hang</th>}
          {showEZ && <th className="table-header">EZ %</th>}
          <th className="table-header">Dir %</th>
        </tr>
      </thead>
      <tbody>
        {visible.map((a) => {
          const s = statsMap[a.name];
          return (
            <tr key={a.id} className="hover:bg-surface/30">
              <td className="table-name">{a.name}</td>
              <td className="table-cell">{s.att}</td>
              <td className={clsx("table-cell", isYL ? "text-accent font-semibold" : "")}>{avgDist(s)}</td>
              {hasHang && <td className="table-cell text-muted">{avgHang(s)}{avgHang(s) !== "—" ? "s" : ""}</td>}
              {showEZ && <td className="table-cell text-make font-semibold">{ezPct(s)}</td>}
              <td className="table-cell text-accent font-semibold">{dirPct(s)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function computeCategoryStats(
  athletes: { id: string; name: string }[],
  history: { entries?: KickoffEntry[] }[],
  filter: (e: KickoffEntry) => boolean,
  directions?: { id: string; score?: number }[]
): Record<string, AthleteKOStats> {
  const map: Record<string, AthleteKOStats> = {};
  athletes.forEach((a) => { map[a.name] = emptyStats(); });
  history.forEach((session) => {
    (session.entries ?? []).forEach((e) => {
      if (!filter(e)) return;
      if (!map[e.athlete]) map[e.athlete] = emptyStats();
      map[e.athlete] = addEntry(map[e.athlete], e, directions);
    });
  });
  return map;
}

function CategorySection({
  title,
  athletes,
  catStats,
  catTypeIds,
  typeLabels,
  typeMetrics,
  allTypeStats,
  history,
  catFilter,
  directions,
  showEZ = true,
  catMetric,
}: {
  title: string;
  athletes: { id: string; name: string }[];
  catStats: Record<string, AthleteKOStats>;
  catTypeIds: string[];
  typeLabels: Record<string, string>;
  typeMetrics: Record<string, "distance" | "yardline" | "none">;
  allTypeStats: Record<string, Record<string, AthleteKOStats>>;
  history: { entries?: KickoffEntry[] }[];
  catFilter: (e: KickoffEntry) => boolean;
  directions?: { id: string; score?: number }[];
  showEZ?: boolean;
  catMetric?: "distance" | "yardline" | "none";
}) {
  const activeTypes = catTypeIds.filter((type) =>
    athletes.some((a) => (allTypeStats[type]?.[a.name]?.att ?? 0) > 0)
  );
  const hasMultipleTypes = activeTypes.length > 0;
  const [subTab, setSubTab] = useState<string>("type");

  // Compute per-type stats by hash for position breakdowns
  const typePositionStats = useMemo(() => {
    const result: Record<string, Record<KickoffHash, Record<string, AthleteKOStats>>> = {};
    activeTypes.forEach((type) => {
      const byHash: Record<string, Record<string, AthleteKOStats>> = {};
      KICKOFF_HASHES.forEach((hash) => {
        byHash[hash] = computeCategoryStats(
          athletes,
          history,
          (e) => e.type === type && e.hash === hash && catFilter(e),
          directions
        );
      });
      result[type] = byHash as Record<KickoffHash, Record<string, AthleteKOStats>>;
    });
    return result;
  }, [athletes, history, activeTypes, catFilter, directions]);

  // Overall position stats for this category
  const catPositionStats = useMemo(() => {
    const byHash: Record<string, Record<string, AthleteKOStats>> = {};
    KICKOFF_HASHES.forEach((hash) => {
      byHash[hash] = computeCategoryStats(
        athletes,
        history,
        (e) => e.hash === hash && catFilter(e),
        directions
      );
    });
    return byHash as Record<KickoffHash, Record<string, AthleteKOStats>>;
  }, [athletes, history, catFilter, directions]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</p>

      {/* Overall */}
      <section className="card-2">
        <StatTable athletes={athletes} statsMap={catStats} showEZ={showEZ} metric={catMetric} />
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
              <StatTable athletes={athletes} statsMap={allTypeStats[type] ?? {}} showEZ={showEZ} metric={typeMetrics[type]} />
            </div>
          ))}
        </div>
      )}

      {/* Per-type position breakdown */}
      {subTab !== "type" && typePositionStats[subTab] && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {KICKOFF_HASHES.map((hash) => {
            const hashStats = typePositionStats[subTab][hash];
            const hasHashData = athletes.some((a) => (hashStats[a.name]?.att ?? 0) > 0);
            if (!hasHashData) return null;
            return (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                <StatTable athletes={athletes} statsMap={hashStats} showEZ={showEZ} metric={typeMetrics[subTab]} />
              </div>
            );
          })}
        </div>
      )}

      {/* If only one type or none, show overall position breakdown */}
      {!hasMultipleTypes && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {KICKOFF_HASHES.map((hash) => {
            const hashStats = catPositionStats[hash];
            const hasHashData = athletes.some((a) => (hashStats[a.name]?.att ?? 0) > 0);
            if (!hasHashData) return null;
            return (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                <StatTable athletes={athletes} statsMap={hashStats} showEZ={showEZ} metric={catMetric} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function KickoffStatisticsPage() {
  const { athletes, history } = useKickoff();
  const dateFilter = useDateRangeFilter();
  const [koSettings, setKoSettings] = useState(() => loadKoSettings());
  const [gameMode, setGameMode] = useState<"practice" | "game">("practice");

  useEffect(() => {
    import("@/lib/settingsSync").then(({ loadSettingsFromCloud }) => {
      loadSettingsFromCloud<{ kickoffTypes?: Record<string, unknown>[]; kickoffCategories?: KOCategory[]; directionMode?: string; directionMetrics?: { id: string; label: string; score?: number }[] }>("kickoffSettings").then((cloud) => {
        if (cloud) {
          setKoSettings({
            types: cloud.kickoffTypes?.length ? (cloud.kickoffTypes as Record<string, unknown>[]).map(migrateType) : koSettings.types,
            categories: (cloud.kickoffCategories && cloud.kickoffCategories.length > 0) ? cloud.kickoffCategories : koSettings.categories,
            dirMode: cloud.directionMode === "field" ? "field" : "numeric",
            directions: cloud.directionMetrics?.length ? cloud.directionMetrics : koSettings.directions,
          });
        }
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const modeHistory = useMemo(() => {
    return history.filter((s) => gameMode === "game" ? s.mode === "game" : s.mode !== "game");
  }, [history, gameMode]);

  const filteredHistory = useMemo(() => {
    return dateFilter.filterByDate(modeHistory as { date?: string; entries?: KickoffEntry[] }[]);
  }, [modeHistory, dateFilter.mode, dateFilter.range]) as { entries?: KickoffEntry[] }[];

  // Map type to category (with legacy fallback)
  const typeToCategory = useMemo(() => {
    const map: Record<string, string> = {};
    koSettings.types.forEach((t) => { map[t.id] = t.category; });
    return (type: string): string => {
      if (map[type]) return map[type];
      const upper = type.toUpperCase();
      if (upper.includes("SQUIB")) return "SQUIB";
      if (upper.includes("SKY")) return "SKY";
      if (upper.includes("ONSIDE")) return "ONSIDE";
      return "DEEP";
    };
  }, [koSettings.types]);

  // Per-category stats
  const categoryStats = useMemo(() => {
    const result: Record<string, Record<string, AthleteKOStats>> = {};
    koSettings.categories.filter((c) => c.enabled).forEach((cat) => {
      result[cat.id] = computeCategoryStats(
        athletes,
        filteredHistory,
        (e) => typeToCategory(e.type) === cat.id,
        koSettings.directions
      );
    });
    return result;
  }, [athletes, filteredHistory, koSettings.categories, koSettings.directions, typeToCategory]);

  // Per-type stats
  const allTypeStats = useMemo(() => {
    const result: Record<string, Record<string, AthleteKOStats>> = {};
    // Discover all types with data
    const typeIds = new Set<string>();
    filteredHistory.forEach((session) => {
      (session.entries ?? []).forEach((e) => { if (e.type) typeIds.add(e.type); });
    });
    typeIds.forEach((type) => {
      result[type] = computeCategoryStats(
        athletes,
        filteredHistory,
        (e) => e.type === type,
        koSettings.directions
      );
    });
    return result;
  }, [athletes, filteredHistory, koSettings.directions]);

  // Group type IDs by category
  const typesByCategory = useMemo(() => {
    const result: Record<string, string[]> = {};
    const allTypeIds = new Set<string>();
    koSettings.types.forEach((t) => allTypeIds.add(t.id));
    filteredHistory.forEach((session) => {
      (session.entries ?? []).forEach((e) => { if (e.type) allTypeIds.add(e.type); });
    });
    allTypeIds.forEach((id) => {
      const cat = typeToCategory(id);
      if (!result[cat]) result[cat] = [];
      result[cat].push(id);
    });
    return result;
  }, [koSettings.types, filteredHistory, typeToCategory]);

  const typeLabel = (id: string): string => {
    const custom = koSettings.types.find((t) => t.id === id);
    if (custom) return custom.label;
    return LEGACY_TYPE_LABELS[id] ?? id;
  };

  // Type labels map
  const typeLabels = useMemo(() => {
    const map: Record<string, string> = {};
    koSettings.types.forEach((t) => { map[t.id] = t.label; });
    Object.keys(LEGACY_TYPE_LABELS).forEach((k) => { if (!map[k]) map[k] = LEGACY_TYPE_LABELS[k]; });
    return map;
  }, [koSettings.types]);

  // Type metrics map
  const typeMetrics = useMemo(() => {
    const map: Record<string, "distance" | "yardline" | "none"> = {};
    koSettings.types.forEach((t) => { map[t.id] = t.metric; });
    return map;
  }, [koSettings.types]);

  // Determine dominant metric for a category (if all types share the same metric)
  const getCatMetric = (catId: string): "distance" | "yardline" | "none" | undefined => {
    const catTypes = koSettings.types.filter((t) => t.category === catId);
    if (catTypes.length === 0) return undefined;
    const metrics = new Set(catTypes.map((t) => t.metric));
    return metrics.size === 1 ? catTypes[0].metric : undefined;
  };

  // Categories with data
  const activeCats = useMemo(() => {
    return koSettings.categories.filter((c) => {
      if (!c.enabled || !categoryStats[c.id]) return false;
      return athletes.some((a) => (categoryStats[c.id][a.name]?.att ?? 0) > 0);
    });
  }, [koSettings.categories, categoryStats, athletes]);

  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const selectedCatId = activeCatId && activeCats.some((c) => c.id === activeCatId) ? activeCatId : activeCats[0]?.id ?? null;
  const selectedCat = activeCats.find((c) => c.id === selectedCatId);

  const totalKOs = useMemo(() => {
    let total = 0;
    filteredHistory.forEach((session) => { total += (session.entries ?? []).length; });
    return total;
  }, [filteredHistory]);

  const modeToggle = (
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
  );

  if (totalKOs === 0) {
    return (
      <main className="p-4 lg:p-6 max-w-5xl space-y-4">
        {modeToggle}
        <DateRangeFilter {...dateFilter} />
        <p className="text-sm text-muted mt-4">No {gameMode} kickoff data yet.</p>
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-6 space-y-4 max-w-5xl overflow-y-auto">
      {modeToggle}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <DateRangeFilter {...dateFilter} />
        <button
          onClick={() => exportKickoffStats(athletes.map((a) => a.name), history as { date?: string; entries?: KickoffEntry[] }[])}
          className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
        >
          Export
        </button>
      </div>

      {/* Category toggle */}
      {activeCats.length > 1 && (
        <div className="flex flex-wrap rounded-input border border-border overflow-hidden w-fit">
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
          title={`${selectedCat.label}`}
          athletes={athletes}
          catStats={categoryStats[selectedCat.id]}
          catTypeIds={typesByCategory[selectedCat.id] ?? []}
          typeLabels={typeLabels}
          typeMetrics={typeMetrics}
          allTypeStats={allTypeStats}
          history={filteredHistory}
          catFilter={(e) => typeToCategory(e.type) === selectedCat.id}
          directions={koSettings.directions}
          showEZ={selectedCat.id === "DEEP"}
          catMetric={getCatMetric(selectedCat.id)}
        />
      )}
    </main>
  );
}
