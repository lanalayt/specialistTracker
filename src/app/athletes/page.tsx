"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { LongSnapProvider, useLongSnap } from "@/lib/longSnapContext";
import { loadAthletes, insertAthlete, removeAthlete as removeAthleteById, type StoredAthlete } from "@/lib/athleteStore";
import { getTeamId } from "@/lib/teamData";
import { useState as useStateReact, useEffect } from "react";
import clsx from "clsx";

function AthletesContent() {
  const fg = useFG();
  const punt = usePunt();
  const kickoff = useKickoff();
  const snap = useLongSnap();
  const [newName, setNewName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [popupAthlete, setPopupAthlete] = useState<string | null>(null);
  const [popupName, setPopupName] = useState("");
  const [holders, setHolders] = useState<StoredAthlete[]>([]);

  useEffect(() => {
    async function loadHolders() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const h = await loadAthletes(tid, "HOLDING");
      setHolders(h);
    }
    loadHolders();
  }, []);

  // Master list = union of all sports' athlete names, preserving order
  const allNames = Array.from(
    new Set([
      ...fg.athletes.map((a) => a.name),
      ...punt.athletes.map((a) => a.name),
      ...kickoff.athletes.map((a) => a.name),
      ...snap.athletes.map((a) => a.name),
      ...holders.map((a) => a.name),
    ])
  );

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    fg.addAthletes([trimmed]);
    punt.addAthletes([trimmed]);
    kickoff.addAthletes([trimmed]);
    snap.addAthletes([trimmed]);
    setNewName("");
  };

  const handleRemove = (name: string) => {
    if (confirmRemove === name) {
      // Find the athlete ID in each sport and remove by ID
      const fgAthlete = fg.athletes.find((a) => a.name === name);
      const puntAthlete = punt.athletes.find((a) => a.name === name);
      const koAthlete = kickoff.athletes.find((a) => a.name === name);
      const snapAthlete = snap.athletes.find((a) => a.name === name);
      if (fgAthlete) fg.removeAthlete(fgAthlete.id);
      if (puntAthlete) punt.removeAthlete(puntAthlete.id);
      if (koAthlete) kickoff.removeAthlete(koAthlete.id);
      if (snapAthlete) snap.removeAthlete(snapAthlete.id);
      setConfirmRemove(null);
    } else {
      setConfirmRemove(name);
    }
  };

  const handleRename = async (oldName: string, newNameVal: string) => {
    const trimmed = newNameVal.trim();
    if (!trimmed || trimmed === oldName || allNames.includes(trimmed)) { setPopupAthlete(null); return; }
    const tid = getTeamId();
    if (!tid) return;
    // Update in all sessions across all sports
    const { createClient } = await import("@/lib/supabase");
    const supabase = createClient();
    const { data: sessions } = await supabase.from("sessions").select("id, entries").eq("team_id", tid);
    if (sessions) {
      for (const s of sessions) {
        const entries = s.entries as { athlete?: string; athleteId?: string }[];
        if (entries?.some((e) => e.athlete === oldName || e.athleteId === oldName)) {
          const updated = entries.map((e) => ({
            ...e,
            athlete: e.athlete === oldName ? trimmed : e.athlete,
            athleteId: e.athleteId === oldName ? trimmed : e.athleteId,
          }));
          await supabase.from("sessions").update({ entries: updated, updated_at: new Date().toISOString() }).eq("team_id", tid).eq("id", s.id);
        }
      }
    }
    // Update athlete name in each sport's athlete table
    const sports = ["KICKING", "PUNTING", "KICKOFF", "LONGSNAP", "HOLDING"];
    for (const sport of sports) {
      const athletes = await loadAthletes(tid, sport);
      const found = athletes.find((a) => a.name === oldName);
      if (found) {
        await removeAthleteById(tid, found.id);
        await insertAthlete(tid, sport, trimmed);
      }
    }
    setPopupAthlete(null);
    // Force reload
    window.location.reload();
  };

  const toggleSport = async (name: string, sport: string, sportKey: string, isIn: boolean) => {
    const tid = getTeamId();
    if (!tid) return;
    if (isIn) {
      // Remove from sport
      const athletes = await loadAthletes(tid, sportKey);
      const found = athletes.find((a) => a.name === name);
      if (found) await removeAthleteById(tid, found.id);
    } else {
      // Add to sport
      await insertAthlete(tid, sportKey, name);
    }
    window.location.reload();
  };

  const fgNames = new Set(fg.athletes.map((a) => a.name));
  const puntNames = new Set(punt.athletes.map((a) => a.name));
  const koNames = new Set(kickoff.athletes.map((a) => a.name));
  const snapNames = new Set(snap.athletes.map((a) => a.name));
  const holderNames = new Set(holders.map((a) => a.name));

  const inSports = (name: string): string[] => {
    const sports: string[] = [];
    if (fgNames.has(name)) sports.push("FG");
    if (puntNames.has(name)) sports.push("Punt");
    if (koNames.has(name)) sports.push("KO");
    if (snapNames.has(name)) sports.push("Snap");
    if (holderNames.has(name)) sports.push("H");
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
            Athletes ({allNames.length})
          </p>
          {allNames.length === 0 ? (
            <p className="text-sm text-muted py-2">No athletes yet</p>
          ) : (
            allNames.map((name) => {
              const sports = inSports(name);
              return (
                <div
                  key={name}
                  className="flex items-center gap-3 px-3 py-3 rounded-input hover:bg-surface-2 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm flex-shrink-0">
                    {name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <button onClick={() => { setPopupAthlete(name); setPopupName(name); }} className="text-sm font-semibold text-slate-100 hover:text-accent transition-colors text-left">{name}</button>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {sports.map((sp) => (
                        <span key={sp} className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold border border-accent/20">{sp}</span>
                      ))}
                      {sports.length === 0 && <span className="text-[10px] text-muted italic">no phases</span>}
                    </div>
                  </div>
                  <RoleGuard coachOnly>
                    <button
                      onClick={() => handleRemove(name)}
                      onBlur={() => confirmRemove === name && setTimeout(() => setConfirmRemove(null), 200)}
                      className={clsx(
                        "text-xs px-3 py-1 rounded-input border transition-all",
                        confirmRemove === name
                          ? "bg-miss/20 border-miss/40 text-miss"
                          : "border-border text-muted hover:text-white hover:bg-surface-2"
                      )}
                    >
                      {confirmRemove === name ? "Confirm Remove" : "Remove"}
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

        {/* Athlete edit popup */}
        {popupAthlete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPopupAthlete(null)} />
            <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-100">Edit Athlete</h3>
                <button onClick={() => setPopupAthlete(null)} className="text-muted hover:text-white text-xs">Close</button>
              </div>

              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Name</p>
                <input type="text" value={popupName} onChange={(e) => setPopupName(e.target.value)} className="input w-full text-sm py-1.5" />
              </div>

              <div>
                <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Phases</p>
                <div className="space-y-2">
                  {[
                    { label: "FG Kicking", key: "KICKING", isIn: fgNames.has(popupAthlete) },
                    { label: "Punting", key: "PUNTING", isIn: puntNames.has(popupAthlete) },
                    { label: "Kickoff", key: "KICKOFF", isIn: koNames.has(popupAthlete) },
                    { label: "Long Snap", key: "LONGSNAP", isIn: snapNames.has(popupAthlete) },
                    { label: "Holder", key: "HOLDING", isIn: holderNames.has(popupAthlete) },
                  ].map((sp) => (
                    <label key={sp.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sp.isIn}
                        onChange={() => toggleSport(popupAthlete, sp.label, sp.key, sp.isIn)}
                        className="w-4 h-4 rounded border-border accent-accent"
                      />
                      <span className="text-xs text-slate-200">{sp.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {popupName.trim() && popupName.trim() !== popupAthlete && (
                <button onClick={() => handleRename(popupAthlete, popupName)} className="btn-primary w-full py-2 text-sm font-bold">
                  Save Name Change
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AthletesPage() {
  return (
    <FGProvider>
      <PuntProvider>
        <KickoffProvider>
          <LongSnapProvider>
            <div className="flex overflow-x-hidden max-w-[100vw]">
              <Sidebar />
              <AthletesContent />
              <MobileNav />
            </div>
          </LongSnapProvider>
        </KickoffProvider>
      </PuntProvider>
    </FGProvider>
  );
}
