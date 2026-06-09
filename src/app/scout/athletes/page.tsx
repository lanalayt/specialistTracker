"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getTeamId } from "@/lib/teamData";
import {
  loadScoutAthletes,
  saveScoutAthletes,
  removeScoutAthlete,
  loadScoutProfiles,
  saveScoutProfiles,
  deleteScoutProfile,
  applyScoutDisciplines,
  type ScoutProfile,
} from "@/lib/scoutStore";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { Header } from "@/components/layout/Header";
import clsx from "clsx";

const SPORTS = [
  { key: "fg", label: "FG" },
  { key: "punt", label: "Punt" },
  { key: "kickoff", label: "Kickoff" },
  { key: "snap", label: "Snap" },
];

// Discipline filter options (KO is the short label for kickoff).
const DISCIPLINE_FILTERS = [
  { key: "fg", label: "FG" },
  { key: "kickoff", label: "KO" },
  { key: "punt", label: "Punt" },
  { key: "snap", label: "Snap" },
];

export default function ScoutAthletesPage() {
  const [profiles, setProfiles] = useState<Record<string, ScoutProfile>>({});
  const [allNames, setAllNames] = useState<string[]>([]);
  const [sportAthletes, setSportAthletes] = useState<Record<string, string[]>>({});
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "year" | "discipline">("all");
  const [filterValue, setFilterValue] = useState("");

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

  const handleAddAthlete = () => {
    const trimmed = newName.trim();
    if (!trimmed || allNames.includes(trimmed)) return;
    // Open the profile modal for the new athlete so position + info can be set
    setNewName("");
    setProfileOpen(trimmed);
  };

  const toggleAthleteSport = async (name: string, sportKey: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const list = sportAthletes[sportKey] ?? [];
    const isRemoving = list.includes(name);
    const updated = isRemoving ? list.filter((n) => n !== name) : [...list, name];
    setSportAthletes((prev) => ({ ...prev, [sportKey]: updated }));
    if (isRemoving) await removeScoutAthlete(tid, sportKey, name);
    else await saveScoutAthletes(tid, sportKey, [name]);
  };

  const handleDeleteAthlete = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}'s profile? This does not remove their ranking data.`)) return;
    const tid = getTeamId();
    if (!tid) return;

    const updatedProfiles = { ...profiles };
    delete updatedProfiles[name];
    setProfiles(updatedProfiles);
    await deleteScoutProfile(tid, name);

    // Remove from all sport lists (safe per-list delete)
    for (const sport of SPORTS) {
      const list = sportAthletes[sport.key] ?? [];
      if (list.includes(name)) {
        setSportAthletes((prev) => ({ ...prev, [sport.key]: (prev[sport.key] ?? []).filter((n) => n !== name) }));
        await removeScoutAthlete(tid, sport.key, name);
      }
    }

    setAllNames((prev) => prev.filter((n) => n !== name));
  };

  const handleSaveProfile = async (profile: ScoutProfile, originalName?: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = { ...profiles };
    if (originalName && originalName !== profile.name) {
      delete updated[originalName];
      // Rename in all sport athlete lists: drop the old name, add the new (safe per-list ops)
      for (const sport of SPORTS) {
        const list = sportAthletes[sport.key] ?? [];
        if (list.includes(originalName)) {
          const newList = list.map((n) => n === originalName ? profile.name : n);
          setSportAthletes((prev) => ({ ...prev, [sport.key]: newList }));
          await removeScoutAthlete(tid, sport.key, originalName);
          await saveScoutAthletes(tid, sport.key, [profile.name]);
        }
      }
      setAllNames((prev) => prev.map((n) => n === originalName ? profile.name : n).sort((a, b) => a.localeCompare(b)));
    }
    updated[profile.name] = profile;
    setProfiles(updated);
    await saveScoutProfiles(tid, updated);
    if (originalName && originalName !== profile.name) await deleteScoutProfile(tid, originalName);

    // Ensure the athlete appears in the list (covers newly added profiles)
    setAllNames((prev) => prev.includes(profile.name) ? prev : [...prev, profile.name].sort((a, b) => a.localeCompare(b)));

    // Sync charting membership to the selected disciplines (full reconcile — the
    // modal was seeded from current membership, so unselected ones are removed).
    const disciplines = profile.disciplines ?? [];
    setSportAthletes((prev) => {
      const next = { ...prev };
      for (const sport of SPORTS) {
        const has = (next[sport.key] ?? []).includes(profile.name);
        const want = disciplines.includes(sport.key);
        if (want && !has) next[sport.key] = [...(next[sport.key] ?? []), profile.name];
        else if (!want && has) next[sport.key] = (next[sport.key] ?? []).filter((n) => n !== profile.name);
      }
      return next;
    });
    await applyScoutDisciplines(tid, profile.name, disciplines, true);

    setProfileOpen(null);
  };

  return (
    <>
      <Header title="Athlete Profiles" />
      <Link href="/scout" className="text-xs text-muted hover:text-white transition-colors px-4 pt-3 block">&larr; Back to Scout Home</Link>
      <main className="p-4 lg:p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-xl font-extrabold text-slate-100">Scout Athletes</h1>
          <p className="text-xs text-muted mt-1">Manage athlete profiles across all scout sports. Click a name to edit their profile. Tap a discipline below each athlete to make them selectable in that discipline&apos;s charting.</p>
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

        {/* Filters */}
        {(() => {
          const years = [...new Set(allNames.map((n) => profiles[n]?.schoolYear).filter(Boolean))] as string[];
          const filtered = allNames.filter((name) => {
            if (filterType === "all") return true;
            const p = profiles[name];
            if (filterType === "year") return filterValue ? p?.schoolYear === filterValue : true;
            if (filterType === "discipline") return filterValue ? (sportAthletes[filterValue] ?? []).includes(name) : true;
            return true;
          });

          return (
            <>
              <div className="space-y-2">
                <div className="flex rounded-input border border-border overflow-hidden w-fit">
                  <button onClick={() => { setFilterType("all"); setFilterValue(""); }} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors", filterType === "all" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>All</button>
                  <button onClick={() => { setFilterType("year"); setFilterValue(""); }} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors border-l border-border", filterType === "year" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Year</button>
                  <button onClick={() => { setFilterType("discipline"); setFilterValue(""); }} className={clsx("px-3 py-1 text-[10px] font-semibold transition-colors border-l border-border", filterType === "discipline" ? "bg-amber-500 text-slate-900" : "text-muted hover:text-white")}>Discipline</button>
                </div>
                {filterType === "year" && years.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setFilterValue("")} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-semibold transition-all", !filterValue ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-surface-2 text-muted border border-border")}>All Years</button>
                    {years.sort().map((y) => (
                      <button key={y} onClick={() => setFilterValue(y)} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-semibold transition-all", filterValue === y ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-surface-2 text-muted border border-border")}>{y}</button>
                    ))}
                  </div>
                )}
                {filterType === "discipline" && (
                  <div className="flex flex-wrap gap-1">
                    <button onClick={() => setFilterValue("")} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-semibold transition-all", !filterValue ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-surface-2 text-muted border border-border")}>All</button>
                    {DISCIPLINE_FILTERS.map((d) => (
                      <button key={d.key} onClick={() => setFilterValue(d.key)} className={clsx("px-2.5 py-1 rounded-input text-[10px] font-semibold transition-all", filterValue === d.key ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-surface-2 text-muted border border-border")}>{d.label}</button>
                    ))}
                  </div>
                )}
              </div>

              {/* Athlete list */}
              {loading ? (
                <p className="text-sm text-muted py-8 text-center">Loading...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted py-8 text-center">{allNames.length === 0 ? "No athletes yet. Add one above or from any chart setup page." : "No athletes match this filter."}</p>
              ) : (
                <div className="card-2 divide-y divide-border/30">
                  <div className="px-3 py-2 text-[10px] text-muted">{filtered.length} athlete{filtered.length !== 1 ? "s" : ""}</div>
                  {filtered.map((name) => {
                    const profile = profiles[name];
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
                            {profile?.school && <span className="text-[10px] text-muted">{profile.school}{profile?.schoolState ? `, ${profile.schoolState}` : ""}</span>}
                            {profile?.schoolYear && <span className="text-[10px] text-muted">{profile.schoolYear}</span>}
                          </div>
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {SPORTS.map((s) => {
                              const inSport = (sportAthletes[s.key] ?? []).includes(name);
                              return (
                                <button
                                  key={s.key}
                                  onClick={() => toggleAthleteSport(name, s.key)}
                                  className={clsx(
                                    "px-2 py-0.5 rounded-input text-[10px] font-semibold transition-all border",
                                    inSport
                                      ? "bg-amber-500 text-slate-900 border-amber-500"
                                      : "bg-surface-2 text-muted border-border hover:text-white hover:border-slate-500"
                                  )}
                                  title={inSport ? `Remove ${name} from ${s.label} charting` : `Add ${name} to ${s.label} charting`}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
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
            </>
          );
        })()}
      </main>

      {profileOpen && (() => {
        const base = profiles[profileOpen] ?? { name: profileOpen };
        // Seed disciplines from current charting membership so the modal reflects reality.
        const disciplines = SPORTS.filter((s) => (sportAthletes[s.key] ?? []).includes(profileOpen)).map((s) => s.key);
        return (
          <ScoutProfileModal
            profile={{ ...base, disciplines }}
            onSave={handleSaveProfile}
            onClose={() => setProfileOpen(null)}
          />
        );
      })()}
    </>
  );
}
