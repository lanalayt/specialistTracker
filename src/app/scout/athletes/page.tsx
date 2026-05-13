"use client";

import { useState, useEffect } from "react";
import { getTeamId } from "@/lib/teamData";
import {
  loadScoutAthletes,
  saveScoutAthletes,
  loadScoutProfiles,
  saveScoutProfiles,
  type ScoutProfile,
} from "@/lib/scoutStore";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { Header } from "@/components/layout/Header";

const SPORTS = [
  { key: "fg", label: "FG" },
  { key: "punt", label: "Punt" },
  { key: "kickoff", label: "Kickoff" },
  { key: "snap", label: "Snap" },
];

export default function ScoutAthletesPage() {
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [allNames, setAllNames] = useState<string[]>([]);
  const [sportAthletes, setSportAthletes] = useState<Record<string, string[]>>({});
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) {
      await new Promise((r) => setTimeout(r, 100));
      tid = getTeamId();
    }
    if (!tid) return;

    const [prof, fg, punt, kickoff, snap] = await Promise.all([
      loadScoutProfiles(tid),
      loadScoutAthletes(tid, "fg"),
      loadScoutAthletes(tid, "punt"),
      loadScoutAthletes(tid, "kickoff"),
      loadScoutAthletes(tid, "snap"),
    ]);

    setProfiles(prof);
    setSportAthletes({ fg, punt, kickoff, snap });

    // Merge all unique names
    const names = new Set([...Object.keys(prof), ...fg, ...punt, ...kickoff, ...snap]);
    setAllNames([...names].sort((a, b) => a.localeCompare(b)));
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleAddAthlete = async () => {
    const trimmed = newName.trim();
    if (!trimmed || allNames.includes(trimmed)) return;
    const tid = getTeamId();
    if (!tid) return;

    // Add to profiles
    const updatedProfiles = { ...profiles, [trimmed]: { name: trimmed } };
    setProfiles(updatedProfiles);
    await saveScoutProfiles(tid, updatedProfiles);

    setAllNames((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b)));
    setNewName("");
  };

  const handleDeleteAthlete = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}'s profile? This does not remove their ranking data.`)) return;
    const tid = getTeamId();
    if (!tid) return;

    const updatedProfiles = { ...profiles };
    delete updatedProfiles[name];
    setProfiles(updatedProfiles);
    await saveScoutProfiles(tid, updatedProfiles);

    // Remove from all sport lists
    for (const sport of SPORTS) {
      const list = sportAthletes[sport.key] ?? [];
      if (list.includes(name)) {
        const updated = list.filter((n) => n !== name);
        setSportAthletes((prev) => ({ ...prev, [sport.key]: updated }));
        await saveScoutAthletes(tid, sport.key, updated);
      }
    }

    setAllNames((prev) => prev.filter((n) => n !== name));
  };

  const handleSaveProfile = async (profile: ScoutProfile) => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = { ...profiles, [profile.name]: profile };
    setProfiles(updated);
    await saveScoutProfiles(tid, updated);
    setProfileOpen(null);
  };

  return (
    <>
      <Header title="Athlete Profiles" />
      <main className="p-4 lg:p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-extrabold text-slate-100">Scout Athletes</h1>
          <p className="text-xs text-muted mt-1">Manage athlete profiles across all scout sports. Click a name to edit their profile.</p>
        </div>

        {/* Add athlete */}
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddAthlete(); }}
            placeholder="Add new athlete..."
            className="input flex-1 text-sm py-2"
          />
          <button
            onClick={handleAddAthlete}
            disabled={!newName.trim()}
            className="btn-primary px-5 py-2 text-sm font-bold disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {/* Athlete list */}
        {loading ? (
          <p className="text-sm text-muted py-8 text-center">Loading...</p>
        ) : allNames.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No athletes yet. Add one above or from any chart setup page.</p>
        ) : (
          <div className="card-2 divide-y divide-border/30">
            {allNames.map((name) => {
              const profile = profiles[name];
              const inSports = SPORTS.filter((s) => (sportAthletes[s.key] ?? []).includes(name)).map((s) => s.label);
              return (
                <div key={name} className="flex items-center justify-between py-3 px-3">
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => setProfileOpen(name)}
                      className="text-sm font-semibold text-slate-100 hover:text-amber-400 transition-colors"
                    >
                      {name}
                    </button>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {profile?.school && <span className="text-[10px] text-muted">{profile.school}</span>}
                      {profile?.position && <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted font-semibold">{profile.position}</span>}
                      {profile?.schoolYear && <span className="text-[10px] text-muted">{profile.schoolYear}</span>}
                      {inSports.length > 0 && (
                        <span className="text-[10px] text-amber-400/70">{inSports.join(", ")}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setProfileOpen(name)}
                      className="text-[10px] text-muted hover:text-amber-400 transition-colors px-2 py-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteAthlete(name)}
                      className="text-[10px] text-muted hover:text-miss transition-colors px-1 py-1"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {profileOpen && (
        <ScoutProfileModal
          profile={profiles[profileOpen] ?? { name: profileOpen }}
          onSave={handleSaveProfile}
          onClose={() => setProfileOpen(null)}
        />
      )}
    </>
  );
}
