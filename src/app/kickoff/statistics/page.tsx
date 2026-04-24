"use client";

import { useMemo, useState, useEffect } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import { StatCard } from "@/components/ui/StatCard";
import type { KickoffEntry } from "@/types";
import clsx from "clsx";
import { DateRangeFilter, useDateRangeFilter } from "@/components/ui/DateRangeFilter";
import { exportKickoffStats } from "@/lib/exportStats";

const DEFAULT_KO_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "SQUIB", label: "Squib" },
  { id: "SKY", label: "Sky" },
  { id: "ONSIDE", label: "Onside" },
];

const LEGACY_TYPE_LABELS: Record<string, string> = {
  REG: "Regular",
  ONSIDE: "Onside",
  SQUIB: "Squib",
  FREE: "Free",
};

type DirectionMode = "numeric" | "field";

interface KOTypeConfig { id: string; label: string; metric: "distance" | "yardline" | "none"; hangTime: boolean }

function loadKoSettings(): { types: KOTypeConfig[]; dirMode: DirectionMode; directions: { id: string; label: string }[] } {
  const defaultTypes: KOTypeConfig[] = DEFAULT_KO_TYPES.map((t) => ({ ...t, metric: "distance" as const, hangTime: true }));
  const defaults = { types: defaultTypes, dirMode: "numeric" as DirectionMode, directions: [{ id: "1", label: "1.0" }, { id: "0.5", label: "0.5" }, { id: "OB", label: "OB" }] };
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem("kickoffSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawTypes = parsed.kickoffTypes?.length > 0 ? parsed.kickoffTypes : DEFAULT_KO_TYPES;
      return {
        types: rawTypes.map((t: Record<string, unknown>) => ({
          id: t.id as string,
          label: t.label as string,
          metric: (t.metric as string) ?? "distance",
          hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
        })),
        dirMode: parsed.directionMode === "field" ? "field" : "numeric",
        directions: parsed.directionMetrics?.length > 0 ? parsed.directionMetrics : defaults.directions,
      };
    }
  } catch {}
  return defaults;
}

/** Returns true if a kickoff type tracks both distance and hang time (qualifies for overall stats) */
function isOverallType(typeId: string, types: KOTypeConfig[]): boolean {
  const tc = types.find((t) => t.id === typeId);
  if (!tc) return true; // unknown types default to overall
  return tc.metric === "distance" && tc.hangTime;
}

function dirToNum(d: string): number | null {
  if (d === "1") return 1;
  if (d === "0.5") return 0.5;
  if (d === "OB") return 0;
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
  /** Count per direction id (for field-based breakdown) */
  dirCounts: Record<string, number>;
}

function emptyStats(): AthleteKOStats {
  return { att: 0, totalDist: 0, distAtt: 0, totalHang: 0, hangAtt: 0, dirSum: 0, dirAtt: 0, endzones: 0, dirCounts: {} };
}

function addEntry(s: AthleteKOStats, e: KickoffEntry): AthleteKOStats {
  const dir = dirToNum(e.direction);
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

function StatTable({ athletes, statsMap, dirMode, dirOptions }: {
  athletes: { id: string; name: string }[];
  statsMap: Record<string, AthleteKOStats>;
  dirMode: DirectionMode;
  dirOptions: { id: string; label: string }[];
}) {
  const visible = athletes.filter((a) => (statsMap[a.name]?.att ?? 0) > 0);
  if (visible.length === 0) {
    return <p className="text-xs text-muted p-2">No data.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="table-header text-left">Athlete</th>
            <th className="table-header">KOs</th>
            <th className="table-header">Dist</th>
            <th className="table-header">Hang</th>
            <th className="table-header">EZ %</th>
            {dirMode === "numeric" ? (
              <th className="table-header">Dir %</th>
            ) : (
              dirOptions.map((d) => (
                <th key={d.id} className="table-header text-[10px]">{d.label}</th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((a) => {
            const s = statsMap[a.name];
            return (
              <tr key={a.id} className="hover:bg-surface/30">
                <td className="table-name">{a.name}</td>
                <td className="table-cell">{s.att}</td>
                <td className="table-cell">{avgDist(s)}</td>
                <td className="table-cell text-muted">{avgHang(s)}{avgHang(s) !== "—" ? "s" : ""}</td>
                <td className="table-cell text-make font-semibold">{ezPct(s)}</td>
                {dirMode === "numeric" ? (
                  <td className="table-cell text-accent font-semibold">{dirPct(s)}</td>
                ) : (
                  dirOptions.map((d) => {
                    const count = s.dirCounts[d.id] || 0;
                    const pct = s.att > 0 ? Math.round((count / s.att) * 100) : 0;
                    return (
                      <td key={d.id} className="table-cell text-accent">
                        {s.att > 0 ? `${pct}%` : "—"}
                      </td>
                    );
                  })
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          {title} <span className="text-muted ml-1">({count})</span>
        </p>
        <span className={clsx("text-muted text-sm transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && <div className="mt-3">{children}</div>}
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
      loadSettingsFromCloud<{ kickoffTypes?: Record<string, unknown>[]; directionMode?: string; directionMetrics?: { id: string; label: string }[] }>("kickoffSettings").then((cloud) => {
        if (cloud) {
          setKoSettings({
            types: cloud.kickoffTypes?.length ? cloud.kickoffTypes.map((t) => ({
              id: t.id as string,
              label: t.label as string,
              metric: (t.metric as "distance" | "yardline" | "none") ?? "distance",
              hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
            })) : koSettings.types,
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

  // Compute overall per-athlete stats (only types with both distance + hang time)
  const overallStats = useMemo(() => {
    const map: Record<string, AthleteKOStats> = {};
    athletes.forEach((a) => { map[a.name] = emptyStats(); });
    filteredHistory.forEach((session) => {
      (session.entries ?? []).forEach((e) => {
        if (!isOverallType(e.type, koSettings.types)) return;
        if (!map[e.athlete]) map[e.athlete] = emptyStats();
        map[e.athlete] = addEntry(map[e.athlete], e);
      });
    });
    return map;
  }, [athletes, filteredHistory, koSettings.types]);

  // Compute per-type per-athlete stats
  const statsByType = useMemo(() => {
    const result: Record<string, { total: number; map: Record<string, AthleteKOStats> }> = {};
    filteredHistory.forEach((session) => {
      (session.entries ?? []).forEach((e) => {
        const type = e.type || "UNKNOWN";
        if (!result[type]) {
          result[type] = { total: 0, map: {} };
          athletes.forEach((a) => { result[type].map[a.name] = emptyStats(); });
        }
        if (!result[type].map[e.athlete]) result[type].map[e.athlete] = emptyStats();
        result[type].map[e.athlete] = addEntry(result[type].map[e.athlete], e);
        result[type].total += 1;
      });
    });
    return result;
  }, [athletes, filteredHistory]);

  const typeLabel = (id: string): string => {
    const custom = koSettings.types.find((t) => t.id === id);
    if (custom) return custom.label;
    return LEGACY_TYPE_LABELS[id] ?? id;
  };

  const totalKOs = Object.values(overallStats).reduce((s, a) => s + a.att, 0);

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
      <main className="p-4 lg:p-6 max-w-4xl space-y-4">
        {modeToggle}
        <DateRangeFilter {...dateFilter} />
        <p className="text-sm text-muted mt-4">No {gameMode} kickoff data yet.</p>
      </main>
    );
  }

  // Overall totals for top cards
  const totalDistAtt = Object.values(overallStats).reduce((s, a) => s + a.distAtt, 0);
  const totalDist = Object.values(overallStats).reduce((s, a) => s + a.totalDist, 0);
  const totalHangAtt = Object.values(overallStats).reduce((s, a) => s + a.hangAtt, 0);
  const totalHang = Object.values(overallStats).reduce((s, a) => s + a.totalHang, 0);
  const overallAvgDist = totalDistAtt > 0 ? (totalDist / totalDistAtt).toFixed(1) : "—";
  const overallAvgHang = totalHangAtt > 0 ? (totalHang / totalHangAtt).toFixed(2) : "—";
  const totalEndzones = Object.values(overallStats).reduce((s, a) => s + a.endzones, 0);
  const overallEzPct = totalKOs > 0 ? `${Math.round((totalEndzones / totalKOs) * 100)}%` : "—";

  // Direction summary for stat cards
  const totalDirAtt = Object.values(overallStats).reduce((s, a) => s + a.dirAtt, 0);
  const totalDirSum = Object.values(overallStats).reduce((s, a) => s + a.dirSum, 0);
  const overallDirPct = totalDirAtt > 0 ? `${Math.round((totalDirSum / totalDirAtt) * 100)}%` : "—";

  // Aggregate direction counts across all athletes for field-based breakdown
  const totalDirCounts: Record<string, number> = {};
  Object.values(overallStats).forEach((s) => {
    Object.entries(s.dirCounts).forEach(([k, v]) => {
      totalDirCounts[k] = (totalDirCounts[k] || 0) + v;
    });
  });

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-4xl overflow-y-auto">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Avg Dist" value={overallAvgDist !== "—" ? `${overallAvgDist} yd` : "—"} accent glow />
        <StatCard label="Avg Hang" value={overallAvgHang !== "—" ? `${overallAvgHang}s` : "—"} />
        <StatCard label="Endzone %" value={overallEzPct} />
        {koSettings.dirMode === "numeric" ? (
          <StatCard label="Direction %" value={overallDirPct} />
        ) : (
          <StatCard label="Kicks" value={String(totalKOs)} />
        )}
      </div>

      {/* Field-based direction breakdown */}
      {koSettings.dirMode === "field" && totalKOs > 0 && (
        <div className="card-2">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Direction Breakdown</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {koSettings.directions.map((d) => {
              const count = totalDirCounts[d.id] || 0;
              const pct = totalKOs > 0 ? Math.round((count / totalKOs) * 100) : 0;
              return (
                <div key={d.id} className="bg-surface-2/50 border border-border rounded-input p-3 text-center">
                  <p className="text-lg font-extrabold text-accent">{pct}%</p>
                  <p className="text-[10px] text-muted font-semibold uppercase tracking-wider mt-0.5">{d.label}</p>
                  <p className="text-[10px] text-muted">{count} / {totalKOs}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overall Deep Kickoffs */}
      <div className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Overall Deep Kickoffs</p>
        <StatTable athletes={athletes} statsMap={overallStats} dirMode={koSettings.dirMode} dirOptions={koSettings.directions} />
      </div>

      {/* By Kick Type */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">By Kick Type</p>
        {Object.keys(statsByType).length === 0 ? (
          <p className="text-xs text-muted">No kick type data yet.</p>
        ) : (
          Object.entries(statsByType).map(([typeId, { total, map }]) => (
            <CollapsibleSection key={typeId} title={typeLabel(typeId)} count={total}>
              <StatTable athletes={athletes} statsMap={map} dirMode={koSettings.dirMode} dirOptions={koSettings.directions} />
            </CollapsibleSection>
          ))
        )}
      </div>
    </main>
  );
}
