"use client";

import { useEffect, useState, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { loadArchives, deleteArchive, type StatArchive } from "@/lib/archiveManager";
import { makePct, avgScore, processKick, emptyAthleteStats, processPunt, emptyPuntStats } from "@/lib/stats";
import type { FGKick, PuntEntry, KickoffEntry, AthleteStats, FGPosition, DistRange, PuntAthleteStats, PuntHash, PuntStatBucket } from "@/types";
import { POSITIONS, DIST_RANGES, PUNT_HASHES, KICKOFF_HASHES } from "@/types";
import type { KickoffHash } from "@/types";
import clsx from "clsx";
import { Tooltip } from "@/components/ui/Tooltip";

// ── Shared helpers ──────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between py-2 group">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">{title}</p>
        <span className={clsx("text-muted text-sm transition-transform", open && "rotate-180")}>▾</span>
      </button>
      {open && children}
    </section>
  );
}

type SimpleAthlete = { id: string; name: string };

// ── FG Helpers ──────────────────────────────────────────────────────────────

const POS_LABELS: Record<FGPosition, string> = { LH: "Left Hash", RH: "Right Hash", LM: "Left Middle", M: "Middle", RM: "Right Middle" };
const DIST_LABELS: Record<DistRange, string> = { "20-29": "20–29 yds", "30-39": "30–39 yds", "40-49": "40–49 yds", "50-60": "50–60 yds", "60+": "60+ yds" };

function FGStatTable({ athletes, statsMap, getValue, showScore = true, maxScore = 3 }: {
  athletes: SimpleAthlete[]; statsMap: Record<string, AthleteStats>;
  getValue: (s: AthleteStats) => { att: number; made: number; score: number };
  showScore?: boolean; maxScore?: number;
}) {
  return (
    <table className="w-full text-xs">
      <thead><tr>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Made</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">%</th>
        {showScore && <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5 whitespace-nowrap">KS<span className="text-[8px] font-normal"> /{maxScore}</span></th>}
      </tr></thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a.name]; if (!s) return null;
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

function FGArchiveStats({ athletes, statsMap }: { athletes: SimpleAthlete[]; statsMap: Record<string, AthleteStats> }) {
  return (
    <div className="space-y-4">
      {/* Overall */}
      <section className="card-2">
        <table className="w-full text-xs sm:text-sm">
          <thead><tr>
            <th className="table-header text-left">Athlete</th>
            <th className="table-header">Made</th>
            <th className="table-header">Att</th>
            <th className="table-header">%</th>
            <th className="table-header whitespace-nowrap">KS<span className="text-[8px] font-normal text-muted"> /3</span></th>
            <th className="table-header">Long</th>
            <th className="table-header">OT</th>
          </tr></thead>
          <tbody>
            {athletes.map((a) => {
              const s = statsMap[a.name]; if (!s) return null;
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
            <thead><tr>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Left</th>
              <th className="table-header">Short</th>
              <th className="table-header">Right</th>
              <th className="table-header">Total</th>
            </tr></thead>
            <tbody>
              {athletes.map((a) => {
                const s = statsMap[a.name]; if (!s) return null;
                const total = s.miss.XL + s.miss.XR + s.miss.XS + s.miss.X;
                return (
                  <tr key={a.id} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a.name}</td>
                    <td className="table-cell text-miss">{s.miss.XL || "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XS || "—"}</td>
                    <td className="table-cell text-miss">{s.miss.XR || "—"}</td>
                    <td className="table-cell text-miss font-semibold">{total || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>

      {/* Make Chart */}
      {athletes.some((a) => { const m = statsMap[a.name]?.make; return m && (m.YL > 0 || m.YC > 0 || m.YR > 0); }) && (
      <CollapsibleSection title="Make Chart">
        <div className="card-2">
          <table className="w-full text-xs sm:text-sm">
            <thead><tr>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Left</th>
              <th className="table-header">Middle</th>
              <th className="table-header">Right</th>
              <th className="table-header">Total</th>
            </tr></thead>
            <tbody>
              {athletes.map((a) => {
                const s = statsMap[a.name]; if (!s) return null;
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

      {/* By Position */}
      <CollapsibleSection title="By Hash / Position">
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["LH", "RH"] as FGPosition[]).map((pos) => (
              <div key={pos} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[pos]}</p>
                <FGStatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.position[pos]} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["LM", "M", "RM"] as FGPosition[]).map((pos) => (
              <div key={pos} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[pos]}</p>
                <FGStatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.position[pos]} />
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
                <FGStatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.distance[range]} maxScore={maxScore} />
              </div>
            );
          })}
        </div>
      </CollapsibleSection>

      {/* PAT */}
      <CollapsibleSection title="PAT">
        <div className="card-2">
          <FGStatTable athletes={athletes} statsMap={statsMap} getValue={(s) => s.pat ?? { att: 0, made: 0, score: 0 }} showScore={false} />
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ── Punt Helpers ─────────────────────────────────────────────────────────────

const PUNT_POS_LABELS: Record<PuntHash, string> = { LH: "Left Hash", LM: "Left Middle", M: "Middle", RM: "Right Middle", RH: "Right Hash" };

function avgYds(b: PuntStatBucket): string { const c = b.yardsAtt ?? b.att; return c === 0 ? "—" : (b.totalYards / c).toFixed(1); }
function avgHT(b: PuntStatBucket): string { const c = b.hangAtt ?? b.att; return c === 0 ? "—" : (b.totalHang / c).toFixed(2); }
function avgOT(b: PuntStatBucket): string { const c = b.opTimeAtt ?? b.att; return c === 0 ? "—" : (b.totalOpTime / c).toFixed(2); }
function avgDA(b: PuntStatBucket): string { const c = b.daAtt ?? b.att; return c === 0 ? "—" : `${Math.round((b.totalDirectionalAccuracy / c) * 100)}%`; }

function PuntStatTable({ athletes, statsMap, getBucket, metric }: {
  athletes: SimpleAthlete[]; statsMap: Record<string, PuntAthleteStats>;
  getBucket: (s: PuntAthleteStats) => PuntStatBucket;
  metric?: "distance" | "yardline";
}) {
  const isYL = metric === "yardline";
  return (
    <table className="w-full text-xs">
      <thead><tr>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-left py-1.5 px-1.5">Athlete</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Att</th>
        <th className={clsx("text-[10px] font-semibold uppercase tracking-wider text-right py-1.5 px-1.5", isYL ? "text-accent" : "text-muted")}>{isYL ? "YL" : "Dist"}</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">HT</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">OT</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">DA</th>
        <th className="text-[10px] font-semibold text-muted uppercase tracking-wider text-right py-1.5 px-1.5">Crit<Tooltip text="Critical Direction — Any punt with a direction score of 0" /></th>
      </tr></thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a.name]; if (!s) return null;
          const b = getBucket(s); if (!b) return null;
          return (
            <tr key={a.id} className="hover:bg-surface/30 transition-colors">
              <td className="text-xs font-medium text-slate-100 text-left py-1.5 px-1.5 border-t border-border/50 truncate max-w-[80px]">{a.name}</td>
              <td className="text-xs text-slate-200 text-right py-1.5 px-1.5 border-t border-border/50">{b.att || "—"}</td>
              <td className={clsx("text-xs text-right py-1.5 px-1.5 border-t border-border/50", isYL ? "text-accent font-semibold" : "text-slate-200")}>{avgYds(b)}</td>
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

function PuntArchiveStats({ athletes, statsMap }: { athletes: SimpleAthlete[]; statsMap: Record<string, PuntAthleteStats> }) {
  // Discover types with data
  const activeTypes = useMemo(() => {
    const types = new Set<string>();
    athletes.forEach((a) => {
      const s = statsMap[a.name];
      if (s) Object.keys(s.byType).forEach((t) => { if (s.byType[t]?.att > 0) types.add(t); });
    });
    return [...types];
  }, [athletes, statsMap]);

  return (
    <div className="space-y-4">
      {/* Overall */}
      <section className="card-2">
        <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.overall} />
      </section>

      {/* By Type */}
      {activeTypes.length > 0 && (
        <CollapsibleSection title="By Type">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeTypes.map((type) => (
              <div key={type} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{type}</p>
                <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byType[type]} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* By Position */}
      <CollapsibleSection title="By Position">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PUNT_HASHES.map((hash) => {
            const hasData = athletes.some((a) => (statsMap[a.name]?.byHash[hash]?.att ?? 0) > 0);
            if (!hasData) return null;
            return (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{PUNT_POS_LABELS[hash]}</p>
                <PuntStatTable athletes={athletes} statsMap={statsMap} getBucket={(s) => s.byHash[hash]} />
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ── Kickoff Helpers ─────────────────────────────────────────────────────────

const KO_POS_LABELS: Record<KickoffHash, string> = { LH: "Left Hash", LM: "Left Middle", M: "Middle", RM: "Right Middle", RH: "Right Hash" };

interface KOBucket { att: number; totalDist: number; distAtt: number; totalHang: number; hangAtt: number; dirSum: number; dirAtt: number; endzones: number; fairCatches: number; dirCounts: Record<string, number> }

function emptyKOBucket(): KOBucket {
  return { att: 0, totalDist: 0, distAtt: 0, totalHang: 0, hangAtt: 0, dirSum: 0, dirAtt: 0, endzones: 0, fairCatches: 0, dirCounts: {} };
}

function addKOEntry(s: KOBucket, e: KickoffEntry): KOBucket {
  const dirNum = e.direction === "1" ? 1 : e.direction === "0.5" ? 0.5 : e.direction === "0" ? 0 : e.direction === "-1" || e.direction === "OB" ? -1 : null;
  const dirCounts = { ...s.dirCounts };
  if (e.direction) dirCounts[e.direction] = (dirCounts[e.direction] || 0) + 1;
  return {
    att: s.att + 1,
    totalDist: s.totalDist + (e.distance > 0 ? e.distance : 0),
    distAtt: s.distAtt + (e.distance > 0 ? 1 : 0),
    totalHang: s.totalHang + (e.hangTime > 0 ? e.hangTime : 0),
    hangAtt: s.hangAtt + (e.hangTime > 0 ? 1 : 0),
    dirSum: s.dirSum + (dirNum != null ? dirNum : 0),
    dirAtt: s.dirAtt + (dirNum != null ? 1 : 0),
    endzones: s.endzones + (e.endzone ? 1 : 0),
    fairCatches: s.fairCatches + (e.fairCatch ? 1 : 0),
    dirCounts,
  };
}

function koAvgDist(s: KOBucket): string { return s.distAtt > 0 ? (s.totalDist / s.distAtt).toFixed(1) : "—"; }
function koAvgHang(s: KOBucket): string { return s.hangAtt > 0 ? (s.totalHang / s.hangAtt).toFixed(2) : "—"; }
function koDirPct(s: KOBucket): string { return s.dirAtt > 0 ? `${Math.round((s.dirSum / s.dirAtt) * 100)}%` : "—"; }
function koEzPct(s: KOBucket): string { return s.att > 0 ? `${Math.round((s.endzones / s.att) * 100)}%` : "—"; }

function KOStatTable({ athletes, statsMap, showEZ = true }: {
  athletes: SimpleAthlete[]; statsMap: Record<string, KOBucket>; showEZ?: boolean;
}) {
  const visible = athletes.filter((a) => (statsMap[a.name]?.att ?? 0) > 0);
  if (visible.length === 0) return <p className="text-xs text-muted p-2">No data.</p>;
  const hasFC = visible.some((a) => statsMap[a.name]?.fairCatches > 0);
  return (
    <table className="w-full text-xs sm:text-sm">
      <thead><tr>
        <th className="table-header text-left">Athlete</th>
        <th className="table-header">KOs</th>
        <th className="table-header">Dist</th>
        <th className="table-header">Hang</th>
        {showEZ && <th className="table-header">EZ %</th>}
        {hasFC && <th className="table-header">FC</th>}
        <th className="table-header">Dir %</th>
      </tr></thead>
      <tbody>
        {visible.map((a) => {
          const s = statsMap[a.name];
          return (
            <tr key={a.id} className="hover:bg-surface/30">
              <td className="table-name">{a.name}</td>
              <td className="table-cell">{s.att}</td>
              <td className="table-cell">{koAvgDist(s)}</td>
              <td className="table-cell text-muted">{koAvgHang(s)}{koAvgHang(s) !== "—" ? "s" : ""}</td>
              {showEZ && <td className="table-cell text-make font-semibold">{koEzPct(s)}</td>}
              {hasFC && <td className="table-cell">{s.fairCatches || "—"}</td>}
              <td className="table-cell text-accent font-semibold">{koDirPct(s)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function computeKOStats(athletes: SimpleAthlete[], entries: KickoffEntry[], filter?: (e: KickoffEntry) => boolean): Record<string, KOBucket> {
  const map: Record<string, KOBucket> = {};
  athletes.forEach((a) => { map[a.name] = emptyKOBucket(); });
  entries.forEach((e) => {
    if (filter && !filter(e)) return;
    if (!map[e.athlete]) map[e.athlete] = emptyKOBucket();
    map[e.athlete] = addKOEntry(map[e.athlete], e);
  });
  return map;
}

function KOArchiveStats({ athletes, entries }: { athletes: SimpleAthlete[]; entries: KickoffEntry[] }) {
  const overallStats = useMemo(() => computeKOStats(athletes, entries), [athletes, entries]);

  // Discover types with data
  const activeTypes = useMemo(() => {
    const types = new Set<string>();
    entries.forEach((e) => { if (e.type) types.add(e.type); });
    return [...types];
  }, [entries]);

  const typeStats = useMemo(() => {
    const result: Record<string, Record<string, KOBucket>> = {};
    activeTypes.forEach((type) => {
      result[type] = computeKOStats(athletes, entries, (e) => e.type === type);
    });
    return result;
  }, [athletes, entries, activeTypes]);

  // By hash
  const hashStats = useMemo(() => {
    const result: Record<string, Record<string, KOBucket>> = {};
    KICKOFF_HASHES.forEach((hash) => {
      result[hash] = computeKOStats(athletes, entries, (e) => e.hash === hash);
    });
    return result;
  }, [athletes, entries]);

  return (
    <div className="space-y-4">
      {/* Overall */}
      <section className="card-2">
        <KOStatTable athletes={athletes} statsMap={overallStats} />
      </section>

      {/* By Type */}
      {activeTypes.length > 0 && (
        <CollapsibleSection title="By Type">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeTypes.map((type) => (
              <div key={type} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{type}</p>
                <KOStatTable athletes={athletes} statsMap={typeStats[type] ?? {}} />
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* By Position */}
      <CollapsibleSection title="By Position">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {KICKOFF_HASHES.map((hash) => {
            const hasData = athletes.some((a) => (hashStats[hash]?.[a.name]?.att ?? 0) > 0);
            if (!hasData) return null;
            return (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{KO_POS_LABELS[hash]}</p>
                <KOStatTable athletes={athletes} statsMap={hashStats[hash] ?? {}} />
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function ArchivesPage() {
  const [archives, setArchives] = useState<StatArchive[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    loadArchives().then((list) => {
      setArchives(list);
      if (list.length > 0) setSelectedId(list[list.length - 1].id);
      setLoading(false);
    });
  }, []);

  const selected = archives.find((a) => a.id === selectedId);

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    await deleteArchive(id);
    const fresh = await loadArchives();
    setArchives(fresh);
    setSelectedId(fresh[fresh.length - 1]?.id ?? null);
    setConfirmDelete(null);
  };

  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0 flex-1">
        <Header title="Archived Stats" />
        <main className="p-4 lg:p-6 max-w-6xl space-y-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Archived Stats</h1>
            <p className="text-sm text-muted mt-1">Historical stat snapshots saved from the Settings page.</p>
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading...</p>
          ) : archives.length === 0 ? (
            <div className="card text-sm text-muted">
              No archives yet. To create one, go to Settings &rarr; Archive Stats, enter a name and confirm.
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Archive list */}
              <div className="lg:w-64 shrink-0 space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Archives ({archives.length})</p>
                <div className="space-y-1">
                  {[...archives].reverse().map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={clsx(
                        "w-full text-left px-3 py-2 rounded-input border transition-all",
                        selectedId === a.id ? "border-accent/50 bg-accent/10" : "border-border hover:bg-surface-2"
                      )}
                    >
                      <p className="text-sm font-semibold text-slate-100 truncate">{a.name}</p>
                      <p className="text-[10px] text-muted mt-0.5">{formatDate(a.createdAt)}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected archive detail */}
              <div className="flex-1 min-w-0 space-y-4">
                {selected && <ArchiveDetail archive={selected} onDelete={handleDelete} confirmDelete={confirmDelete === selected.id} />}
              </div>
            </div>
          )}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function ArchiveDetail({ archive, onDelete, confirmDelete }: {
  archive: StatArchive; onDelete: (id: string) => void; confirmDelete: boolean;
}) {
  const [sportTab, setSportTab] = useState<"fg" | "punt" | "kickoff">("fg");

  // Recompute FG stats from entries
  const fgAthletes: SimpleAthlete[] = useMemo(() => archive.fg.athletes.map((n) => ({ id: n, name: n })), [archive]);
  const fgStats = useMemo(() => {
    let statsMap: Record<string, AthleteStats> = {};
    fgAthletes.forEach((a) => { statsMap[a.name] = emptyAthleteStats(); });
    archive.fg.history.forEach((session) => {
      const kicks = (session.entries ?? []) as FGKick[];
      kicks.forEach((k) => { statsMap = processKick(k, statsMap); });
    });
    return statsMap;
  }, [archive, fgAthletes]);

  // Recompute punt stats from entries
  const puntAthletes: SimpleAthlete[] = useMemo(() => archive.punt.athletes.map((n) => ({ id: n, name: n })), [archive]);
  const puntStats = useMemo(() => {
    let statsMap: Record<string, PuntAthleteStats> = {};
    puntAthletes.forEach((a) => { statsMap[a.name] = emptyPuntStats(); });
    archive.punt.history.forEach((session) => {
      const punts = (session.entries ?? []) as PuntEntry[];
      punts.forEach((p) => { statsMap = processPunt(p, statsMap); });
    });
    return statsMap;
  }, [archive, puntAthletes]);

  // Collect kickoff entries
  const koAthletes: SimpleAthlete[] = useMemo(() => archive.kickoff.athletes.map((n) => ({ id: n, name: n })), [archive]);
  const koEntries: KickoffEntry[] = useMemo(() => {
    const entries: KickoffEntry[] = [];
    archive.kickoff.history.forEach((session) => {
      (session.entries as KickoffEntry[] ?? []).forEach((e) => entries.push(e));
    });
    return entries;
  }, [archive]);

  const fgTotal = fgAthletes.reduce((n, a) => n + (fgStats[a.name]?.overall.att ?? 0), 0);
  const puntTotal = puntAthletes.reduce((n, a) => n + (puntStats[a.name]?.overall.att ?? 0), 0);
  const koTotal = koEntries.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="card-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-accent uppercase tracking-wider">Archived</p>
            <h2 className="text-xl font-bold text-slate-100 mt-1">{archive.name}</h2>
            <p className="text-xs text-muted mt-0.5">Created {new Date(archive.createdAt).toLocaleString()}</p>
          </div>
          <RoleGuard coachOnly>
            <button
              onClick={() => onDelete(archive.id)}
              className={clsx(
                "text-xs px-3 py-1.5 rounded-input border transition-all",
                confirmDelete ? "bg-miss/20 border-miss/50 text-miss" : "border-border text-muted hover:text-miss hover:border-miss/50"
              )}
            >
              {confirmDelete ? "Confirm Delete" : "Delete"}
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* Sport tabs */}
      <div className="flex rounded-input border border-border overflow-hidden w-fit">
        {([
          { id: "fg" as const, label: "FG Kicking", count: fgTotal },
          { id: "punt" as const, label: "Punting", count: puntTotal },
          { id: "kickoff" as const, label: "Kickoff", count: koTotal },
        ]).map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setSportTab(tab.id)}
            className={clsx(
              "px-4 py-1.5 text-xs font-semibold transition-colors",
              sportTab === tab.id ? "bg-accent text-slate-900" : "text-muted hover:text-white",
              i > 0 && "border-l border-border"
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Sport stats */}
      {sportTab === "fg" && (
        fgTotal > 0 ? <FGArchiveStats athletes={fgAthletes} statsMap={fgStats} /> : <p className="text-sm text-muted">No FG data in this archive.</p>
      )}
      {sportTab === "punt" && (
        puntTotal > 0 ? <PuntArchiveStats athletes={puntAthletes} statsMap={puntStats} /> : <p className="text-sm text-muted">No punt data in this archive.</p>
      )}
      {sportTab === "kickoff" && (
        koTotal > 0 ? <KOArchiveStats athletes={koAthletes} entries={koEntries} /> : <p className="text-sm text-muted">No kickoff data in this archive.</p>
      )}
    </div>
  );
}
