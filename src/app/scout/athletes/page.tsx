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
  loadScoutSessions,
  loadScoutNumbers,
  saveScoutNumbers,
  scoutDisplayName,
  type ScoutProfile,
  type ScoutSession,
} from "@/lib/scoutStore";
import { ScoutProfileModal } from "@/components/ui/ScoutProfileModal";
import { SnapChartDetail, type SnapDetailEntry } from "@/components/ui/SnapChartDetail";
import { Header } from "@/components/layout/Header";
import clsx from "clsx";

// Scout disciplines and their session sport keys, for pulling completed charts.
const CHART_SPORTS = [
  { sport: "SCOUT_FG", label: "FG" },
  { sport: "SCOUT_PUNT", label: "Punt" },
  { sport: "SCOUT_KO", label: "Kickoff" },
  { sport: "SCOUT_SNAP", label: "Snap" },
];

interface AthleteChart {
  label: string;       // discipline
  date: string;
  summary: string;     // headline stat
  reps: string[];      // per-rep detail lines (non-snap)
  isSnap?: boolean;
  is30Point?: boolean;
  snapEntries?: SnapDetailEntry[]; // raw entries for the snap "See Chart" view
}

function buildAthleteChart(sport: string, label: string, session: ScoutSession, name: string): AthleteChart | null {
  const ae = (session.entries as unknown as Record<string, unknown>[]).filter((e) => (e as { athlete?: string }).athlete === name);
  if (ae.length === 0) return null;
  const num = (e: Record<string, unknown>, k: string) => (typeof e[k] === "number" ? (e[k] as number) : 0);
  if (sport === "SCOUT_FG") {
    const makes = ae.filter((e) => e.result === "make").length;
    const pts = ae.reduce((s, e) => s + num(e, "score"), 0);
    return { label, date: session.date, summary: `${makes}/${ae.length} made · ${pts} pts`,
      reps: ae.map((e) => `${num(e, "distance")}${(e.hash as string) ?? ""} ${e.result === "make" ? "✓" : "✗"}`) };
  }
  if (sport === "SCOUT_KO" || sport === "SCOUT_PUNT") {
    const scores = ae.map((e) => num(e, "score"));
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    return { label, date: session.date, summary: `${avg.toFixed(1)} avg score`,
      reps: ae.map((e) => `${num(e, "distance")}yd · ${num(e, "hangTime").toFixed(2)}s${e.directionGood === false ? " · bad dir" : ""}`) };
  }
  // Snap
  const is30 = session.label.startsWith("Short Snaps") || session.label.startsWith("30 Point");
  const total = ae.reduce((s, e) => s + (typeof e.points === "number" ? (e.points as number) : num(e, "score")), 0);
  const max = is30 ? ae.length * 3 : ae.length;
  return {
    label: `Snap (${is30 ? "Short" : "Long"})`,
    date: session.date,
    summary: `${total}/${max}`,
    reps: [],
    isSnap: true,
    is30Point: is30,
    snapEntries: ae as unknown as SnapDetailEntry[],
  };
}

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
  const [chartSessions, setChartSessions] = useState<Record<string, ScoutSession[]>>({});
  const [chartModal, setChartModal] = useState<string | null>(null);
  const [snapDetail, setSnapDetail] = useState<AthleteChart | null>(null);
  const [scoutNumbers, setScoutNumbers] = useState<Record<string, string>>({});

  // All completed charts for an athlete, across every discipline, newest first.
  const getAthleteCharts = (name: string): AthleteChart[] => {
    const out: AthleteChart[] = [];
    for (const { sport, label } of CHART_SPORTS) {
      for (const s of chartSessions[sport] ?? []) {
        const c = buildAthleteChart(sport, label, s, name);
        if (c) out.push(c);
      }
    }
    return out.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const loadData = async () => {
    let tid = getTeamId();
    for (let i = 0; i < 15 && !tid; i++) {
      await new Promise((r) => setTimeout(r, 100));
      tid = getTeamId();
    }
    if (!tid) return;

    const [prof, fg, punt, kickoff, snap, sFg, sPunt, sKo, sSnap, nums] = await Promise.all([
      loadScoutProfiles(tid),
      loadScoutAthletes(tid, "fg"),
      loadScoutAthletes(tid, "punt"),
      loadScoutAthletes(tid, "kickoff"),
      loadScoutAthletes(tid, "snap"),
      loadScoutSessions(tid, "SCOUT_FG"),
      loadScoutSessions(tid, "SCOUT_PUNT"),
      loadScoutSessions(tid, "SCOUT_KO"),
      loadScoutSessions(tid, "SCOUT_SNAP"),
      loadScoutNumbers(tid, "fg"),
    ]);
    setScoutNumbers(nums);

    setSportAthletes({ fg, punt, kickoff, snap });
    setChartSessions({ SCOUT_FG: sFg, SCOUT_PUNT: sPunt, SCOUT_KO: sKo, SCOUT_SNAP: sSnap });

    // Merge all unique names (profiles + everyone in any charting list)
    const names = new Set([...Object.keys(prof), ...fg, ...punt, ...kickoff, ...snap]);

    // Backfill: anyone added while charting becomes a real profile here, with
    // their disciplines synced to charting membership (so a name added in FG shows
    // FG selected, and adding the same name in Kickoff just adds KO — no duplicate).
    const sportMap: Record<string, string[]> = { fg, punt, kickoff, snap };
    const profileUpdates: Record<string, ScoutProfile> = {};
    for (const name of names) {
      const desired = SPORTS.filter((s) => (sportMap[s.key] ?? []).includes(name)).map((s) => s.key);
      const existing = prof[name];
      const cur = existing?.disciplines ?? [];
      const inSync = !!existing && cur.length === desired.length && desired.every((d) => cur.includes(d));
      if (!inSync) profileUpdates[name] = { ...(existing ?? {}), name, disciplines: desired };
    }
    const mergedProfiles = Object.keys(profileUpdates).length > 0 ? { ...prof, ...profileUpdates } : prof;
    setProfiles(mergedProfiles);
    if (Object.keys(profileUpdates).length > 0) await saveScoutProfiles(tid, profileUpdates);

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

  const handleSaveProfile = async (profile: ScoutProfile, originalName?: string, jerseyNumber?: string) => {
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

    // Jersey number — shared across all disciplines, keyed by athlete name.
    if (jerseyNumber !== undefined) {
      const nextNums = { ...scoutNumbers };
      if (originalName && originalName !== profile.name) delete nextNums[originalName];
      if (jerseyNumber.trim()) nextNums[profile.name] = jerseyNumber.trim();
      else delete nextNums[profile.name];
      setScoutNumbers(nextNums);
      await saveScoutNumbers(tid, "fg", nextNums);
    }

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
                    const chartCount = getAthleteCharts(name).length;
                    return (
                      <div key={name} className="flex items-center justify-between py-3 px-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => setProfileOpen(name)}
                              className="text-sm font-semibold text-slate-100 hover:text-amber-400 transition-colors"
                            >
                              {scoutDisplayName(name, scoutNumbers)}
                            </button>
                            {chartCount > 0 && (
                              <button
                                onClick={() => setChartModal(name)}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-input border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors"
                              >
                                Charts ({chartCount})
                              </button>
                            )}
                          </div>
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
            number={scoutNumbers[profileOpen] ?? ""}
            onSave={handleSaveProfile}
            onClose={() => setProfileOpen(null)}
          />
        );
      })()}

      {chartModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setChartModal(null)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100">{scoutDisplayName(chartModal)} — Completed Charts</h3>
              <button onClick={() => setChartModal(null)} className="text-muted hover:text-white text-xs transition-colors">Close</button>
            </div>
            <div className="space-y-3">
              {getAthleteCharts(chartModal).map((c, i) => (
                <div key={i} className="card-2 p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">{c.label}</span>
                      <span className="text-[10px] text-muted ml-2">{new Date(c.date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-black text-slate-100">{c.summary}</span>
                      {c.isSnap && (
                        <button onClick={() => setSnapDetail(c)} className="text-[10px] px-2 py-0.5 rounded-input border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors font-semibold">See Chart</button>
                      )}
                    </div>
                  </div>
                  {!c.isSnap && c.reps.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.reps.map((r, j) => (
                        <span key={j} className="text-[10px] text-slate-300 bg-surface border border-border/50 rounded px-1.5 py-0.5">{r}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {snapDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSnapDetail(null)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{chartModal ? scoutDisplayName(chartModal) : ""}</h3>
                <p className="text-[10px] text-muted">{snapDetail.label} — {new Date(snapDetail.date).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setSnapDetail(null)} className="text-muted hover:text-white text-xs transition-colors">Close</button>
            </div>
            <SnapChartDetail entries={snapDetail.snapEntries ?? []} is30Point={!!snapDetail.is30Point} />
          </div>
        </div>
      )}
    </>
  );
}
