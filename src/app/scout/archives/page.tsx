"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import {
  loadScoutSessions,
  loadScoutArchives,
  saveScoutArchives,
  deleteAllScoutSessions,
  type ScoutSession,
  type ScoutArchive,
} from "@/lib/scoutStore";
import { Header } from "@/components/layout/Header";
import clsx from "clsx";

const SCOUT_SPORTS = [
  { key: "SCOUT_FG", label: "FG" },
  { key: "SCOUT_PUNT", label: "Punt" },
  { key: "SCOUT_KO", label: "Kickoff" },
  { key: "SCOUT_SNAP", label: "Snapping" },
];

export default function ScoutArchivesPage() {
  const [archives, setArchives] = useState<ScoutArchive[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [archiveName, setArchiveName] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Current session counts for archive creation
  const [currentCounts, setCurrentCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) {
      await new Promise((r) => setTimeout(r, 100));
      tid = getTeamId();
    }
    if (!tid) { setLoading(false); return; }

    const [arch, fgSess, puntSess, koSess, snapSess] = await Promise.all([
      loadScoutArchives(tid),
      loadScoutSessions(tid, "SCOUT_FG"),
      loadScoutSessions(tid, "SCOUT_PUNT"),
      loadScoutSessions(tid, "SCOUT_KO"),
      loadScoutSessions(tid, "SCOUT_SNAP"),
    ]);

    setArchives(arch);
    setCurrentCounts({
      SCOUT_FG: fgSess.length,
      SCOUT_PUNT: puntSess.length,
      SCOUT_KO: koSess.length,
      SCOUT_SNAP: snapSess.length,
    });
    setLoading(false);
  }

  const handleArchive = async () => {
    const tid = getTeamId();
    if (!tid) return;
    setArchiving(true);

    const [fgSess, puntSess, koSess, snapSess] = await Promise.all([
      loadScoutSessions(tid, "SCOUT_FG"),
      loadScoutSessions(tid, "SCOUT_PUNT"),
      loadScoutSessions(tid, "SCOUT_KO"),
      loadScoutSessions(tid, "SCOUT_SNAP"),
    ]);

    const archive: ScoutArchive = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: archiveName.trim() || `Scout Archive ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      fg: fgSess,
      punt: puntSess,
      kickoff: koSess,
      snap: snapSess,
    };

    const updated = [...archives, archive];
    await saveScoutArchives(tid, updated);

    // Clear all scout sessions
    await Promise.all([
      deleteAllScoutSessions(tid, "SCOUT_FG"),
      deleteAllScoutSessions(tid, "SCOUT_PUNT"),
      deleteAllScoutSessions(tid, "SCOUT_KO"),
      deleteAllScoutSessions(tid, "SCOUT_SNAP"),
    ]);

    setArchives(updated);
    setCurrentCounts({ SCOUT_FG: 0, SCOUT_PUNT: 0, SCOUT_KO: 0, SCOUT_SNAP: 0 });
    setArchiveName("");
    setArchiving(false);
    setMessage("Scout rankings archived and cleared.");
    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteArchive = async (id: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = archives.filter((a) => a.id !== id);
    await saveScoutArchives(tid, updated);
    setArchives(updated);
    if (selectedId === id) setSelectedId(null);
  };

  const selected = archives.find((a) => a.id === selectedId);
  const totalCurrentSessions = Object.values(currentCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Scout Archives" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        {message && (
          <div className="card bg-amber-500/10 border-amber-500/30 text-amber-400 text-sm p-3">
            {message}
          </div>
        )}

        {/* Archive creation */}
        <div className="card space-y-3">
          <h2 className="text-sm font-bold text-slate-100">Create Archive</h2>
          <p className="text-xs text-muted">
            Archive current scout rankings and start fresh. Currently {totalCurrentSessions} scout session{totalCurrentSessions !== 1 ? "s" : ""} across all sports.
          </p>
          <div className="flex gap-2">
            {SCOUT_SPORTS.map((s) => (
              <span key={s.key} className="text-[10px] text-muted">
                {s.label}: {currentCounts[s.key] ?? 0}
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={archiveName}
              onChange={(e) => setArchiveName(e.target.value)}
              placeholder="Archive name (optional)"
              className="input flex-1 text-sm py-2"
            />
            <button
              onClick={handleArchive}
              disabled={archiving || totalCurrentSessions === 0}
              className="btn-primary px-5 py-2 text-sm font-bold disabled:opacity-40"
            >
              {archiving ? "Archiving..." : "Archive"}
            </button>
          </div>
        </div>

        {/* Archive list */}
        {loading ? (
          <p className="text-sm text-muted py-8 text-center">Loading...</p>
        ) : archives.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No scout archives yet.</p>
        ) : (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-100">Past Archives</h2>
            <div className="grid gap-2">
              {[...archives].reverse().map((arch) => {
                const isSelected = selectedId === arch.id;
                const totalSessions = arch.fg.length + arch.punt.length + arch.kickoff.length + arch.snap.length;
                return (
                  <div key={arch.id}>
                    <button
                      onClick={() => setSelectedId(isSelected ? null : arch.id)}
                      className={clsx(
                        "w-full text-left card-2 py-3 px-4 transition-all",
                        isSelected && "ring-2 ring-amber-500"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-slate-100">{arch.name}</p>
                          <p className="text-[10px] text-muted">{new Date(arch.createdAt).toLocaleDateString()} — {totalSessions} session{totalSessions !== 1 ? "s" : ""}</p>
                        </div>
                        <span className="text-xs text-muted">{isSelected ? "▼" : "▶"}</span>
                      </div>
                    </button>

                    {isSelected && (
                      <div className="mt-2 space-y-3 pl-2">
                        {[
                          { label: "FG", sessions: arch.fg },
                          { label: "Punt", sessions: arch.punt },
                          { label: "Kickoff", sessions: arch.kickoff },
                          { label: "Snapping", sessions: arch.snap },
                        ].map(({ label, sessions }) =>
                          sessions.length > 0 ? (
                            <div key={label} className="card-2 p-3 space-y-2">
                              <p className="text-xs font-bold text-amber-400">{label} — {sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
                              {sessions.map((s) => (
                                <div key={s.id} className="text-xs text-slate-300 flex items-center justify-between">
                                  <span>{s.label}</span>
                                  <span className="text-muted">{new Date(s.date).toLocaleDateString()}</span>
                                </div>
                              ))}
                            </div>
                          ) : null
                        )}
                        <button
                          onClick={() => handleDeleteArchive(arch.id)}
                          className="text-xs text-miss hover:underline"
                        >
                          Delete Archive
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
