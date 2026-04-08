"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { loadArchives, deleteArchive, type StatArchive } from "@/lib/archiveManager";
import { makePct } from "@/lib/stats";
import type { FGKick, PuntEntry, KickoffEntry } from "@/types";
import clsx from "clsx";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

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
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
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
            <p className="text-sm text-muted">Loading…</p>
          ) : archives.length === 0 ? (
            <div className="card text-sm text-muted">
              No archives yet. To create one, go to Settings → Archive Stats, enter a name and confirm.
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
                        selectedId === a.id
                          ? "border-accent/50 bg-accent/10"
                          : "border-border hover:bg-surface-2"
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

function ArchiveDetail({
  archive,
  onDelete,
  confirmDelete,
}: {
  archive: StatArchive;
  onDelete: (id: string) => void;
  confirmDelete: boolean;
}) {
  // FG totals
  const fgTotals = archive.fg.athletes.reduce(
    (acc, a) => {
      const s = archive.fg.stats[a];
      if (!s) return acc;
      return {
        att: acc.att + (s.overall?.att ?? 0),
        made: acc.made + (s.overall?.made ?? 0),
        longFG: Math.max(acc.longFG, s.overall?.longFG ?? 0),
      };
    },
    { att: 0, made: 0, longFG: 0 }
  );

  // Punt totals
  const puntTotals = archive.punt.athletes.reduce(
    (acc, a) => {
      const s = archive.punt.stats[a];
      if (!s) return acc;
      return {
        att: acc.att + (s.overall?.att ?? 0),
        totalYards: acc.totalYards + (s.overall?.totalYards ?? 0),
        yardsAtt: acc.yardsAtt + (s.overall?.yardsAtt ?? s.overall?.att ?? 0),
        totalHang: acc.totalHang + (s.overall?.totalHang ?? 0),
        hangAtt: acc.hangAtt + (s.overall?.hangAtt ?? s.overall?.att ?? 0),
        long: Math.max(acc.long, s.overall?.long ?? 0),
      };
    },
    { att: 0, totalYards: 0, yardsAtt: 0, totalHang: 0, hangAtt: 0, long: 0 }
  );
  const puntAvgYds = puntTotals.yardsAtt > 0 ? (puntTotals.totalYards / puntTotals.yardsAtt).toFixed(1) : "—";
  const puntAvgHang = puntTotals.hangAtt > 0 ? (puntTotals.totalHang / puntTotals.hangAtt).toFixed(2) : "—";

  // Kickoff totals
  const koTotals = archive.kickoff.athletes.reduce(
    (acc, a) => {
      const s = archive.kickoff.stats[a];
      if (!s) return acc;
      return {
        att: acc.att + (s.overall?.att ?? 0),
        totalDist: acc.totalDist + (s.overall?.totalDist ?? 0),
        distAtt: acc.distAtt + ((s.overall?.distAtt ?? s.overall?.att) ?? 0),
        totalHang: acc.totalHang + (s.overall?.totalHang ?? 0),
        hangAtt: acc.hangAtt + ((s.overall?.hangAtt ?? s.overall?.att) ?? 0),
        touchbacks: acc.touchbacks + (s.overall?.touchbacks ?? 0),
      };
    },
    { att: 0, totalDist: 0, distAtt: 0, totalHang: 0, hangAtt: 0, touchbacks: 0 }
  );
  const koAvgDist = koTotals.distAtt > 0 ? (koTotals.totalDist / koTotals.distAtt).toFixed(1) : "—";
  const koAvgHang = koTotals.hangAtt > 0 ? (koTotals.totalHang / koTotals.hangAtt).toFixed(2) : "—";

  return (
    <div className="space-y-4">
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
                confirmDelete
                  ? "bg-miss/20 border-miss/50 text-miss"
                  : "border-border text-muted hover:text-miss hover:border-miss/50"
              )}
            >
              {confirmDelete ? "Confirm Delete" : "Delete"}
            </button>
          </RoleGuard>
        </div>
      </div>

      {/* FG section */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">FG Kicking</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <MiniStat label="Attempts" value={fgTotals.att || "—"} />
          <MiniStat label="Made" value={fgTotals.made || "—"} />
          <MiniStat label="Pct" value={makePct(fgTotals.att, fgTotals.made)} highlight />
        </div>
        {archive.fg.athletes.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Att</th>
                <th className="table-header">Made</th>
                <th className="table-header">%</th>
                <th className="table-header">Long</th>
              </tr>
            </thead>
            <tbody>
              {archive.fg.athletes.map((a) => {
                const s = archive.fg.stats[a];
                const o = s?.overall;
                if (!o || o.att === 0) return null;
                return (
                  <tr key={a} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a}</td>
                    <td className="table-cell">{o.att}</td>
                    <td className="table-cell">{o.made}</td>
                    <td className="table-cell make-pct">{makePct(o.att, o.made)}</td>
                    <td className="table-cell">{o.longFG > 0 ? `${o.longFG} yd` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-[10px] text-muted text-right mt-2">
          {archive.fg.history.length} session{archive.fg.history.length !== 1 ? "s" : ""} ({archive.fg.history.reduce((n, s) => n + ((s.entries as FGKick[])?.length ?? 0), 0)} kicks)
        </p>
      </section>

      {/* Punt section */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Punting</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <MiniStat label="Punts" value={puntTotals.att || "—"} />
          <MiniStat label="Avg Yds" value={puntAvgYds} highlight />
          <MiniStat label="Avg Hang" value={puntAvgHang !== "—" ? `${puntAvgHang}s` : "—"} />
          <MiniStat label="Long" value={puntTotals.long > 0 ? `${puntTotals.long}` : "—"} />
        </div>
        {archive.punt.athletes.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Att</th>
                <th className="table-header">Avg</th>
                <th className="table-header">Hang</th>
                <th className="table-header">Long</th>
              </tr>
            </thead>
            <tbody>
              {archive.punt.athletes.map((a) => {
                const s = archive.punt.stats[a];
                const o = s?.overall;
                if (!o || o.att === 0) return null;
                const yCount = o.yardsAtt ?? o.att;
                const hCount = o.hangAtt ?? o.att;
                const avgY = yCount > 0 ? (o.totalYards / yCount).toFixed(1) : "—";
                const avgH = hCount > 0 ? (o.totalHang / hCount).toFixed(2) : "—";
                return (
                  <tr key={a} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a}</td>
                    <td className="table-cell">{o.att}</td>
                    <td className="table-cell">{avgY}</td>
                    <td className="table-cell">{avgH !== "—" ? `${avgH}s` : "—"}</td>
                    <td className="table-cell">{o.long > 0 ? `${o.long}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-[10px] text-muted text-right mt-2">
          {archive.punt.history.length} session{archive.punt.history.length !== 1 ? "s" : ""} ({archive.punt.history.reduce((n, s) => n + ((s.entries as PuntEntry[])?.length ?? 0), 0)} punts)
        </p>
      </section>

      {/* Kickoff section */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Kickoff</p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          <MiniStat label="KOs" value={koTotals.att || "—"} />
          <MiniStat label="Avg Dist" value={koAvgDist} highlight />
          <MiniStat label="Avg Hang" value={koAvgHang !== "—" ? `${koAvgHang}s` : "—"} />
          <MiniStat label="TB" value={koTotals.touchbacks || "—"} />
        </div>
        {archive.kickoff.athletes.length > 0 && (
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">KOs</th>
                <th className="table-header">Dist</th>
                <th className="table-header">Hang</th>
                <th className="table-header">TB</th>
              </tr>
            </thead>
            <tbody>
              {archive.kickoff.athletes.map((a) => {
                const s = archive.kickoff.stats[a];
                const o = s?.overall;
                if (!o || o.att === 0) return null;
                const dCount = o.distAtt ?? o.att;
                const hCount = o.hangAtt ?? o.att;
                const avgD = dCount > 0 ? (o.totalDist / dCount).toFixed(1) : "—";
                const avgH = hCount > 0 ? (o.totalHang / hCount).toFixed(2) : "—";
                return (
                  <tr key={a} className="hover:bg-surface/30 transition-colors">
                    <td className="table-name">{a}</td>
                    <td className="table-cell">{o.att}</td>
                    <td className="table-cell">{avgD}</td>
                    <td className="table-cell">{avgH !== "—" ? `${avgH}s` : "—"}</td>
                    <td className="table-cell">{o.touchbacks || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-[10px] text-muted text-right mt-2">
          {archive.kickoff.history.length} session{archive.kickoff.history.length !== 1 ? "s" : ""} ({archive.kickoff.history.reduce((n, s) => n + ((s.entries as KickoffEntry[])?.length ?? 0), 0)} kickoffs)
        </p>
      </section>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-input p-2">
      <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
      <p className={clsx("text-lg font-bold mt-0.5", highlight ? "text-accent" : "text-slate-100")}>{value}</p>
    </div>
  );
}
