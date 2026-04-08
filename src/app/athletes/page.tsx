"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import clsx from "clsx";

function AthletesContent() {
  const fg = useFG();
  const punt = usePunt();
  const kickoff = useKickoff();
  const [newName, setNewName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // Master list = union of all sports' athletes, preserving order
  const allAthletes = Array.from(
    new Set([...fg.athletes, ...punt.athletes, ...kickoff.athletes])
  );

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    fg.addAthletes([trimmed]);
    punt.addAthletes([trimmed]);
    kickoff.addAthletes([trimmed]);
    setNewName("");
  };

  const handleRemove = (name: string) => {
    if (confirmRemove === name) {
      fg.removeAthlete(name);
      punt.removeAthlete(name);
      kickoff.removeAthlete(name);
      setConfirmRemove(null);
    } else {
      setConfirmRemove(name);
    }
  };

  const inSports = (name: string): string[] => {
    const sports: string[] = [];
    if (fg.athletes.includes(name)) sports.push("FG");
    if (punt.athletes.includes(name)) sports.push("Punt");
    if (kickoff.athletes.includes(name)) sports.push("KO");
    return sports;
  };

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Athletes" />

      <main className="p-4 lg:p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Athletes</h1>
          <p className="text-sm text-muted mt-1">
            Master list across all phases. Adding adds to every phase; removing removes from every phase.
          </p>
        </div>

        {/* Add athlete */}
        <RoleGuard coachOnly fallback={
          <div className="card-2 text-xs text-muted">Athlete management is coach-only.</div>
        }>
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Add Athlete
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Athlete name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
              <button onClick={handleAdd} disabled={!newName.trim()} className="btn-primary">
                Add
              </button>
            </div>
          </div>
        </RoleGuard>

        {/* Athlete list */}
        <div className="card space-y-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            Athletes ({allAthletes.length})
          </p>
          {allAthletes.length === 0 ? (
            <p className="text-sm text-muted py-2">No athletes yet</p>
          ) : (
            allAthletes.map((a) => {
              const sports = inSports(a);
              return (
                <div
                  key={a}
                  className="flex items-center gap-3 px-3 py-3 rounded-input hover:bg-surface-2 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
                    {a[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{a}</p>
                    <div className="flex gap-1 mt-1">
                      {sports.length === 0 ? (
                        <span className="text-[10px] text-muted italic">not on any roster</span>
                      ) : sports.map((sp) => (
                        <span key={sp} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold border border-accent/20">
                          {sp}
                        </span>
                      ))}
                    </div>
                  </div>
                  <RoleGuard coachOnly>
                    <button
                      onClick={() => handleRemove(a)}
                      onBlur={() => confirmRemove === a && setTimeout(() => setConfirmRemove(null), 200)}
                      className={clsx(
                        "text-xs px-3 py-1 rounded-input border transition-all",
                        confirmRemove === a
                          ? "bg-miss/20 border-miss/40 text-miss"
                          : "border-border text-muted hover:text-white hover:bg-surface-2"
                      )}
                    >
                      {confirmRemove === a ? "Confirm Remove" : "Remove"}
                    </button>
                  </RoleGuard>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-muted">
          Removing an athlete takes them off every phase roster but preserves their historical stats in session history.
        </p>
      </main>
    </div>
  );
}

export default function AthletesPage() {
  return (
    <FGProvider>
      <PuntProvider>
        <KickoffProvider>
          <div className="flex overflow-x-hidden max-w-[100vw]">
            <Sidebar />
            <AthletesContent />
            <MobileNav />
          </div>
        </KickoffProvider>
      </PuntProvider>
    </FGProvider>
  );
}
