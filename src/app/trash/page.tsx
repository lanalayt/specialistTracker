"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { getTrash, removeFromTrash, clearTrash, type TrashedSession } from "@/lib/trashBin";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import clsx from "clsx";
import React from "react";

const SPORT_INFO: Record<string, { label: string; iconEl: React.ReactNode }> = {
  KICKING: { label: "FG", iconEl: <GoalpostIcon size={16} /> },
  PUNTING: { label: "Punt", iconEl: <PuntFootIcon size={16} /> },
  KICKOFF: { label: "KO", iconEl: <KickoffTeeIcon size={16} /> },
};

function TrashContent() {
  const fg = useFG();
  const punt = usePunt();
  const ko = useKickoff();
  const [items, setItems] = useState<TrashedSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      getTrash().then((t) => { setItems(t); setLoading(false); });
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleRestore = async (session: TrashedSession) => {
    if (session.sport === "KICKING") fg.restoreSession(session);
    else if (session.sport === "PUNTING") punt.restoreSession(session);
    else if (session.sport === "KICKOFF") ko.restoreSession(session);
    await removeFromTrash(session.id);
    setItems((prev) => prev.filter((s) => s.id !== session.id));
  };

  const handlePermanentDelete = async (sessionId: string) => {
    if (!window.confirm("Permanently delete this session? This cannot be undone.")) return;
    await removeFromTrash(sessionId);
    setItems((prev) => prev.filter((s) => s.id !== sessionId));
  };

  const handleClearAll = async () => {
    if (!window.confirm("Permanently delete all trashed sessions? This cannot be undone.")) return;
    await clearTrash();
    setItems([]);
  };

  const daysLeft = (deletedAt: string) => {
    const ms = 7 * 24 * 60 * 60 * 1000 - (Date.now() - new Date(deletedAt).getTime());
    return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  };

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Deleted Sessions" />
      <main className="p-4 lg:p-6 max-w-3xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Deleted Sessions</h1>
            <p className="text-sm text-muted mt-1">Sessions auto-delete after 7 days</p>
          </div>
          {items.length > 0 && (
            <button
              onClick={handleClearAll}
              className="text-xs px-3 py-1.5 rounded-input border border-miss/40 text-miss hover:bg-miss/10 font-semibold transition-all"
            >
              Empty Trash
            </button>
          )}
        </div>

        {loading ? (
          <div className="card flex items-center justify-center h-32 text-muted text-sm">Loading...</div>
        ) : items.length === 0 ? (
          <div className="card flex items-center justify-center h-32 text-muted text-sm">
            Trash is empty
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((s) => {
              const info = SPORT_INFO[s.sport] ?? { label: s.sport, iconEl: null };
              const entries = (s.entries ?? []) as unknown[];
              const days = daysLeft(s.deletedAt);
              return (
                <div key={s.id} className="card flex items-center gap-3 py-3 px-4">
                  <div className="shrink-0">{info.iconEl}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-200 truncate">{s.label}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted font-semibold shrink-0">
                        {info.label}
                      </span>
                      {s.mode === "game" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 font-bold shrink-0">
                          GAME
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {entries.length} {entries.length === 1 ? "entry" : "entries"} · deleted {new Date(s.deletedAt).toLocaleDateString()} · {days}d left
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleRestore(s)}
                      className="text-xs px-3 py-1.5 rounded-input border border-accent/50 text-accent hover:bg-accent/10 font-semibold transition-all"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(s.id)}
                      className="text-xs px-2 py-1.5 rounded-input text-muted hover:text-miss transition-colors"
                      title="Delete permanently"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default function TrashPage() {
  return (
    <FGProvider>
      <PuntProvider>
        <KickoffProvider>
          <div className="flex overflow-x-hidden max-w-[100vw]">
            <Sidebar />
            <TrashContent />
            <MobileNav />
          </div>
        </KickoffProvider>
      </PuntProvider>
    </FGProvider>
  );
}
