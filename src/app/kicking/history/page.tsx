"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { useFG } from "@/lib/fgContext";
import { useAuth } from "@/lib/auth";
import { makePct } from "@/lib/stats";
import { exportFGSession, exportSessionPDF } from "@/lib/exportStats";
import { ExportButton } from "@/components/ui/ExportButton";
import { loadSettingsFromCloud, getCachedSettings } from "@/lib/settingsSync";
import { FGFieldView } from "@/components/ui/FGFieldView";
import { loadAthletes as loadAthleteList } from "@/lib/athleteStore";
import { getTeamId } from "@/lib/teamData";
import type { FGKick, Session } from "@/types";
import clsx from "clsx";

// Auto-decimal: raw digits become a time with the last two as hundredths
// (e.g. "132" -> "1.32", "5" -> "0.05"). A typed dot is ignored.
function formatAutoDecimal(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  return `${whole}.${padded.slice(-2)}`;
}

/** Compress a name to initials for the compact holder column, e.g. "John Smith" → "JS".
 *  Returns "" when there's no holder — a blank cell, not a placeholder. */
function toInitials(name?: string): string {
  if (!name || !name.trim()) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatResult(result: string, makeMode: "simple" | "detailed"): string {
  if (result.startsWith("Y")) {
    if (makeMode === "simple") return "✓";
    if (result === "YL") return "✓L";
    if (result === "YR") return "✓R";
    return "✓M"; // YC
  }
  // Misses
  if (result === "XL") return "✗L";
  if (result === "XR") return "✗R";
  if (result === "XS") return "✗ Short";
  if (result === "X") return "✗ Miss";
  return result;
}

function formatDateForInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

export default function KickingHistoryPage() {
  return <Suspense><KickingHistoryContent /></Suspense>;
}

function KickingHistoryContent() {
  const pathname = usePathname();
  const isAthleteMode = pathname.startsWith("/athlete");
  const hideScore = isAthleteMode;
  const { history, updateSessionDate, updateSessionWeather, updateSessionOpponent, updateSessionEntries, deleteSession } = useFG();
  const [makeMode, setMakeMode] = useState<"simple" | "detailed">(() =>
    getCachedSettings<{ makeMode?: string }>("fgSettings")?.makeMode === "simple" ? "simple" : "detailed"
  );

  useEffect(() => {
    loadSettingsFromCloud<{ makeMode?: string }>("fgSettings").then((cloud) => {
      if (cloud?.makeMode === "simple" || cloud?.makeMode === "detailed") {
        setMakeMode(cloud.makeMode);
      }
    });
  }, []);
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session");
  const [modeFilter, setModeFilter] = useState<"practice" | "game">(() => {
    // If a specific session is linked, auto-detect its mode
    if (sessionParam) {
      const s = history.find((h) => h.id === sessionParam);
      if (s?.mode === "game") return "game";
    }
    return "practice";
  });
  const [historyTab, setHistoryTab] = useState<"sessions" | "charting">("sessions");

  const isChartingSession = (s: Session) => s.label?.startsWith("Line Golf");

  const filteredHistory = historyTab === "charting"
    ? history.filter((s) => isChartingSession(s))
    : history.filter((s) => !isChartingSession(s) && (modeFilter === "game" ? s.mode === "game" : s.mode !== "game"));
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [selectedId, setSelectedId] = useState<string | null>(
    sessionParam && filteredHistory.some((s) => s.id === sessionParam)
      ? sessionParam
      : isMobile ? null : (filteredHistory[filteredHistory.length - 1]?.id ?? null)
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeatherId, setEditingWeatherId] = useState<string | null>(null);
  // Team holders, for reassigning a kick's holder after the fact.
  const [holders, setHolders] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const h = await loadAthleteList(tid, "HOLDING");
      setHolders(h.map((a) => a.name));
    })();
  }, []);

  // Re-select when history loads (context async) and a session param is present
  useEffect(() => {
    if (sessionParam && history.length > 0 && !filteredHistory.some((s) => s.id === selectedId)) {
      const target = history.find((h) => h.id === sessionParam);
      if (target) {
        if (target.mode === "game" && modeFilter !== "game") setModeFilter("game");
        else if (target.mode !== "game" && modeFilter !== "practice") setModeFilter("practice");
        setSelectedId(sessionParam);
      }
    }
  }, [history, sessionParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = filteredHistory.find((s) => s.id === selectedId);
  const [editing, setEditing] = useState(false);
  const [editEntries, setEditEntries] = useState<FGKick[]>([]);
  // Raw text for decimal inputs while editing, so "1." / "1.0" survive typing.
  const [rawTimes, setRawTimes] = useState<Record<string, string>>({});
  const startEditing = () => { setEditEntries((selected?.entries ?? []) as FGKick[]); setRawTimes({}); setEditing(true); };
  const cancelEditing = () => { setEditing(false); setEditEntries([]); setRawTimes({}); };
  // Drop any blank rows added but never filled in (no athlete) before saving.
  const saveEditing = () => { if (selected) { updateSessionEntries(selected.id, editEntries.filter((k) => k.athlete)); setEditing(false); setEditEntries([]); setRawTimes({}); } };
  // Append a blank kick in edit mode so the coach can log one after the fact.
  const addEntry = () => {
    const sole = athleteOptions.length === 1 ? athleteOptions[0] : "";
    setEditEntries((prev) => [...prev, { athleteId: sole ? (athleteIdByName[sole] ?? "") : "", athlete: sole, dist: 0, pos: "M", result: "YC", score: 0, kickNum: prev.length + 1 }]);
  };
  const setEntryAthlete = (idx: number, name: string) => {
    setEditEntries((prev) => prev.map((k, i) => i === idx ? { ...k, athlete: name, athleteId: athleteIdByName[name] ?? "" } : k));
  };
  const updateEntry = (idx: number, field: keyof FGKick, value: unknown) => { setEditEntries((prev) => prev.map((k, i) => i === idx ? { ...k, [field]: value } : k)); };
  const updateTime = (idx: number, field: "opTime", rawInput: string) => {
    const digits = rawInput.replace(/\D/g, "").slice(0, 4);
    setRawTimes((prev) => ({ ...prev, [`${idx}-${field}`]: digits }));
    updateEntry(idx, field, digits ? parseFloat(formatAutoDecimal(digits)) : 0);
  };
  const timeValue = (idx: number, field: "opTime", num: number) => {
    const digits = rawTimes[`${idx}-${field}`] ?? (num > 0 ? String(Math.round(num * 100)) : "");
    return digits ? formatAutoDecimal(digits) : "";
  };
  // Reassign a kick's holder. During a bulk edit it goes into the draft; otherwise
  // it's a standalone quick fix that persists immediately.
  const changeHolder = (idx: number, value: string) => {
    if (editing) { updateEntry(idx, "holder", value || undefined); return; }
    if (!selected) return;
    const next = kicks.map((k, i) => (i === idx ? { ...k, holder: value || undefined } : k));
    updateSessionEntries(selected.id, next);
  };
  // Add/remove a kick's live-rep star. During a bulk edit it goes into the
  // draft; otherwise it's a standalone quick fix that persists immediately —
  // no need to unlock the session first.
  const toggleStar = (idx: number, current: boolean | undefined) => {
    const nextVal = current ? undefined : true;
    if (editing) { updateEntry(idx, "starred", nextVal); return; }
    if (!selected) return;
    const next = kicks.map((k, i) => (i === idx ? { ...k, starred: nextVal } : k));
    updateSessionEntries(selected.id, next);
  };
  const kicks = (selected?.entries ?? []) as FGKick[];
  const makes = kicks.filter((k) => k.result.startsWith("Y")).length;
  // Athletes already in this session, for the Athlete dropdown when editing/adding.
  const athleteIdByName: Record<string, string> = {};
  kicks.forEach((k) => { if (k.athlete && !(k.athlete in athleteIdByName)) athleteIdByName[k.athlete] = k.athleteId; });
  const athleteOptions = Object.keys(athleteIdByName).sort((a, b) => a.localeCompare(b));

  return (
    <main className="flex flex-col lg:flex-row h-[calc(100vh-100px)] overflow-hidden">
      {/* Session list — hidden on mobile when a session is selected */}
      <div className={clsx("lg:w-64 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto shrink-0", selectedId && "hidden lg:block")}>
        <div className="p-4 border-b border-border space-y-2">
          <div className="flex rounded-input border border-border overflow-hidden">
            <button
              onClick={() => { setHistoryTab("sessions"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors",
                historyTab === "sessions" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              Sessions
            </button>
            <button
              onClick={() => { setHistoryTab("charting"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border",
                historyTab === "charting" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              Charting Games
            </button>
          </div>
          {historyTab === "sessions" && !isAthleteMode && (
          <div className="flex rounded-input border border-border overflow-hidden">
            <button
              onClick={() => { setModeFilter("practice"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors",
                modeFilter === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
              )}
            >
              Practice
            </button>
            <button
              onClick={() => { setModeFilter("game"); setSelectedId(null); }}
              className={clsx(
                "flex-1 px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border",
                modeFilter === "game" ? "bg-red-500 text-white" : "text-red-400/60 hover:text-red-400"
              )}
            >
              GAME
            </button>
          </div>
          )}
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Sessions ({filteredHistory.length})
          </p>
        </div>
        {filteredHistory.length === 0 ? (
          <p className="text-xs text-muted p-4">No {modeFilter} sessions yet</p>
        ) : (
          <div className="divide-y divide-border/30">
            {[...filteredHistory].reverse().map((s: Session) => {
              const sk = (s.entries ?? []) as FGKick[];
              const sm = sk.filter((k) => k.result.startsWith("Y")).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors hover:bg-surface-2",
                    selectedId === s.id && (modeFilter === "game" ? "bg-red-500/10 border-l-2 border-red-500" : "bg-accent/10 border-l-2 border-accent")
                  )}
                >
                  <p className="text-sm font-semibold text-slate-200">
                    {s.mode === "game" && s.opponent ? `vs ${s.opponent}` : s.label}
                  </p>
                  {s.mode === "game" && s.opponent && (
                    <p className="text-[10px] text-muted">{s.label}{s.gameTime ? ` · ${s.gameTime}` : ""}</p>
                  )}
                  <p className="text-xs text-muted mt-0.5">
                    {sk.length} kick{sk.length !== 1 ? "s" : ""} ·{" "}
                    <span className={modeFilter === "game" ? "text-red-400" : "text-accent"}>{makePct(sk.length, sm)}</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Session detail — hidden on mobile when no session selected */}
      <div className={clsx("flex-1 overflow-y-auto p-4", !selectedId && "hidden lg:block")}>
        {!selected ? (
          <div className="flex items-center justify-center h-40 text-muted text-sm">
            Select a session to view kicks
          </div>
        ) : (
          <>
            {/* Mobile back button */}
            <button
              onClick={() => setSelectedId(null)}
              className="lg:hidden flex items-center gap-1 text-xs text-accent font-semibold mb-3 hover:underline"
            >
              ← All Sessions
            </button>
            {isChartingSession(selected) ? (() => {
              // Line Golf history detail
              const byAthlete: Record<string, FGKick[]> = {};
              kicks.forEach((k) => { if (!byAthlete[k.athlete]) byAthlete[k.athlete] = []; byAthlete[k.athlete].push(k); });
              const athleteNames = Object.keys(byAthlete);
              const isMulti = athleteNames.length > 1;
              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                      <p className="text-xs text-muted mt-0.5">{kicks.length} kicks</p>
                    </div>
                    {!viewOnly && (
                      <button
                        onClick={() => { if (window.confirm(`Delete "${selected.label}"? You can restore it within 7 days.`)) { deleteSession(selected.id); setSelectedId(null); } }}
                        className="text-xs px-2.5 py-1.5 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                      >Delete</button>
                    )}
                  </div>
                  <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                    {athleteNames.map((name) => {
                      const ak = byAthlete[name];
                      const totalScore = hideScore ? 0 : ak.reduce((s, k) => s + k.score, 0);
                      return (
                        <div key={name} className="space-y-3">
                          {isMulti && <p className="text-sm font-bold text-slate-200 text-center">{name}</p>}
                          {!isMulti && <p className="text-sm font-bold text-slate-200">{name}</p>}
                          <div className="card-2 py-3 text-center">
                            {!hideScore && <p className="text-3xl font-black text-accent">{totalScore}</p>}
                            <p className="text-[10px] text-muted mt-1">Total yards off</p>
                          </div>
                          {/* Field view */}
                          <div className="card-2 py-4">
                            <div className="relative mx-auto" style={{ height: 100 }}>
                              <div className="absolute inset-0 rounded bg-green-900/40" />
                              {Array.from({ length: 21 }, (_, i) => i - 10).map((offset) => {
                                const pct = ((offset + 10) / 20) * 100;
                                const isCtr = offset === 0;
                                return (
                                  <div key={offset} className="absolute top-0 bottom-0" style={{ left: `${pct}%` }}>
                                    <div className={clsx("h-full w-px", isCtr ? "bg-yellow-400" : offset % 5 === 0 ? "bg-white/30" : "bg-white/10")} />
                                    {offset % 2 === 0 && <span className={clsx("absolute -bottom-4 -translate-x-1/2 text-[8px]", isCtr ? "text-yellow-400 font-bold" : "text-white/40")}>{Math.abs(offset)}</span>}
                                  </div>
                                );
                              })}
                              {ak.map((k, i) => {
                                const dir = k.result === "YL" ? "left" : k.result === "YR" ? "right" : "center";
                                const off = dir === "left" ? -k.score : dir === "right" ? k.score : 0;
                                const pct = ((off + 10) / 20) * 100;
                                const samePosBefore = ak.slice(0, i).filter((p) => {
                                  const pd = p.result === "YL" ? "left" : p.result === "YR" ? "right" : "center";
                                  const po = pd === "left" ? -p.score : pd === "right" ? p.score : 0;
                                  return po === off;
                                }).length;
                                return (
                                  <div key={i} className="absolute -translate-x-1/2" style={{ left: `${Math.max(2, Math.min(98, pct))}%`, top: `${15 + samePosBefore * 24}%` }}>
                                    <div className={clsx("w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black text-white", k.score === 0 ? "bg-green-500" : k.score <= 2 ? "bg-accent" : "bg-red-500")}>{i + 1}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* Kick table */}
                          <div className="card-2 text-xs">
                            <table className="w-full">
                              <thead><tr>
                                <th className="text-[10px] text-muted text-left py-1 px-1">#</th>
                                <th className="text-[10px] text-muted text-center py-1 px-1">Dir</th>
                                <th className="text-[10px] text-muted text-right py-1 px-1">Off</th>
                              </tr></thead>
                              <tbody>
                                {ak.map((k, i) => {
                                  const dir = k.result === "YL" ? "left" : k.result === "YR" ? "right" : "center";
                                  return (
                                    <tr key={i} className="border-t border-border/30">
                                      <td className="text-muted py-1 px-1">{i + 1}</td>
                                      <td className={clsx("text-center py-1 px-1", dir === "center" ? "text-make" : "text-slate-300")}>{dir === "center" ? "✓" : dir === "left" ? (hideScore ? "←" : `← ${k.score}`) : (hideScore ? "→" : `${k.score} →`)}</td>
                                      {!hideScore && <td className={clsx("text-right py-1 px-1 font-bold", k.score === 0 ? "text-make" : k.score <= 2 ? "text-accent" : "text-miss")}>+{k.score}</td>}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })() : (<>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                {!viewOnly && editingId === selected.id ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="date"
                      defaultValue={formatDateForInput(selected.date)}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateSessionDate(
                            selected.id,
                            new Date(e.target.value + "T12:00:00").toISOString(),
                            formatLabel(e.target.value)
                          );
                        }
                      }}
                      className="input text-sm px-2 py-1 w-auto"
                    />
                    {selected.mode === "game" && (
                      <input
                        type="text"
                        defaultValue={selected.opponent ?? ""}
                        placeholder="Opponent"
                        onBlur={(e) => updateSessionOpponent(selected.id, e.target.value.trim())}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        className="input text-sm px-2 py-1 w-32"
                      />
                    )}
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-accent hover:underline"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selected.mode === "game" && selected.opponent && (
                      <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 text-[10px] font-black uppercase tracking-wider">
                        GAME vs {selected.opponent}
                      </span>
                    )}
                    <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                    {selected.mode === "game" && selected.gameTime && (
                      <span className="text-xs text-muted">· {selected.gameTime}</span>
                    )}
                    {!viewOnly && (
                      <button
                        onClick={() => setEditingId(selected.id)}
                        className="text-xs text-muted hover:text-accent transition-colors"
                        title="Change date"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted mt-0.5">
                  {kicks.length} kicks · {makes} makes ·{" "}
                  <span className="text-accent font-semibold">{makePct(kicks.length, makes)}</span>
                </p>
              </div>
              <div className="flex gap-2 ml-3 shrink-0">
                {!viewOnly && editing ? (
                  <>
                    <button onClick={saveEditing} className="text-xs px-2.5 py-1.5 rounded-input border border-make/50 text-make hover:bg-make/10 transition-all font-semibold">Save Changes</button>
                    <button onClick={cancelEditing} className="text-xs px-2.5 py-1.5 rounded-input border border-border text-muted hover:text-white transition-all">Cancel</button>
                  </>
                ) : (
                  <>
                    {!viewOnly && <button onClick={startEditing} className="text-xs px-2.5 py-1.5 rounded-input border border-accent/50 text-accent hover:bg-accent/10 transition-all font-semibold">Edit</button>}
                    <ExportButton
                      onExcel={() => exportFGSession(selected.label, kicks)}
                      onPDF={() => {
                        const fgK = kicks.filter((k) => !k.isPAT);
                        const m = fgK.filter((k) => k.result.startsWith("Y")).length;
                        const athleteNames = [...new Set(kicks.map((k) => k.athlete))];
                        const athleteBreakdowns = athleteNames.map((name) => {
                          const ak = kicks.filter((k) => k.athlete === name);
                          const fg = ak.filter((k) => !k.isPAT);
                          const made = fg.filter((k) => k.result.startsWith("Y")).length;
                          const madeK = fg.filter((k) => k.result.startsWith("Y"));
                          const long = madeK.length > 0 ? Math.max(...madeK.map((k) => k.dist)) : 0;
                          const pats = ak.filter((k) => k.isPAT);
                          const patMade = pats.filter((k) => k.result.startsWith("Y")).length;
                          const stats: Record<string, string> = {
                            "FG": `${made}/${fg.length}`,
                            "%": fg.length > 0 ? `${Math.round((made / fg.length) * 100)}%` : "—",
                            "Long": long > 0 ? `${long}` : "—",
                          };
                          if (pats.length > 0) stats["PAT"] = `${patMade}/${pats.length}`;
                          return { name, stats };
                        });
                        const hasScore = kicks.some((k) => k.score > 0);
                        const hasOT = kicks.some((k) => k.opTime && k.opTime > 0);
                        const hdrs = ["#", "Athlete", "Dist", "Pos", "Result"];
                        if (hasScore) hdrs.push("Score");
                        if (hasOT) hdrs.push("OT");
                        exportSessionPDF(
                          `FG Session — ${selected.label}`,
                          hdrs,
                          kicks.map((k, i) => {
                            const row = [String(k.kickNum ?? i + 1), k.athlete, k.isPAT ? "PAT" : `${k.dist}`, k.pos, k.result.startsWith("Y") ? "GOOD" : k.result === "XL" ? "MISS LEFT" : k.result === "XR" ? "MISS RIGHT" : k.result === "XS" ? "MISS SHORT" : "MISS"];
                            if (hasScore) row.push(String(k.score));
                            if (hasOT) row.push(k.opTime && k.opTime > 0 ? k.opTime.toFixed(2) : "—");
                            return row;
                          }),
                          { Made: `${m}/${fgK.length}`, Pct: fgK.length > 0 ? `${Math.round((m / fgK.length) * 100)}%` : "—" },
                          athleteBreakdowns
                        );
                      }}
                    />
                    {!viewOnly && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete session "${selected.label}"? You can restore it from Deleted Sessions within 7 days.`)) {
                            deleteSession(selected.id);
                            setSelectedId(history.find((s) => s.id !== selected.id)?.id ?? null);
                          }
                        }}
                        className="text-xs px-2.5 py-1.5 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                      >Delete</button>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Weather display / edit */}
            <div className="mb-4">
              {!viewOnly && editingWeatherId === selected.id ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
                  <input
                    type="text"
                    value={selected.weather ?? ""}
                    onChange={(e) => updateSessionWeather(selected.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditingWeatherId(null); } }}
                    placeholder="Add weather notes..."
                    className="flex-1 max-w-xs bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {selected.weather ? (
                    <p className="text-xs text-slate-300">{selected.weather}</p>
                  ) : (
                    <p className="text-xs text-muted italic">No weather set</p>
                  )}
                  {!viewOnly && (
                    <button
                      onClick={() => setEditingWeatherId(selected.id)}
                      className="text-muted hover:text-white transition-colors p-1"
                      title="Edit weather"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Game field view */}
            {selected.mode === "game" && kicks.length > 0 && (
              <div className="mb-4">
                <FGFieldView kicks={kicks} />
              </div>
            )}
            {/* Per-athlete recap stats */}
            {(() => {
              const byAthlete: Record<string, FGKick[]> = {};
              kicks.forEach((k) => {
                if (!byAthlete[k.athlete]) byAthlete[k.athlete] = [];
                byAthlete[k.athlete].push(k);
              });
              const athleteNames = Object.keys(byAthlete);
              if (athleteNames.length === 0) return null;
              return (
                <div className="mb-4 grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                  {athleteNames.map((name) => {
                    const ak = byAthlete[name];
                    const fgKicks = ak.filter((k) => !k.isPAT);
                    const patKicks = ak.filter((k) => k.isPAT);
                    const fgAtt = fgKicks.length;
                    const fgMade = fgKicks.filter((k) => k.result.startsWith("Y")).length;
                    const fgPct = fgAtt > 0 ? `${Math.round((fgMade / fgAtt) * 100)}%` : "—";
                    const fgAvgSc = fgAtt > 0 ? (fgKicks.reduce((s, k) => s + k.score, 0) / fgAtt).toFixed(1) : "—";
                    const fgMadeKicks = fgKicks.filter((k) => k.result.startsWith("Y"));
                    const long = fgMadeKicks.length > 0 ? Math.max(...fgMadeKicks.map((k) => k.dist)) : 0;
                    const otKicks = fgKicks.filter((k) => k.opTime && k.opTime > 0);
                    const avgOT = otKicks.length > 0 ? (otKicks.reduce((s, k) => s + (k.opTime ?? 0), 0) / otKicks.length).toFixed(2) : null;
                    const patAtt = patKicks.length;
                    const patMade = patKicks.filter((k) => k.result.startsWith("Y")).length;
                    const patPct = patAtt > 0 ? `${Math.round((patMade / patAtt) * 100)}%` : "—";
                    return (
                      <div key={name} className="card-2 p-3">
                        <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">FG</p>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                          <div><span className="text-muted">Made</span> <span className="text-make font-medium ml-1">{fgMade}</span></div>
                          <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{fgAtt}</span></div>
                          <div><span className="text-muted">Pct</span> <span className="text-accent font-medium ml-1">{fgPct}</span></div>
                          {!hideScore && <div><span className="text-muted">Score</span> <span className="text-slate-200 font-medium ml-1">{fgAvgSc}</span></div>}
                          <div><span className="text-muted">Long</span> <span className="text-slate-200 font-medium ml-1">{long > 0 ? `${long}` : "—"}</span></div>
                          {avgOT && <div><span className="text-muted">OT</span> <span className="text-slate-200 font-medium ml-1">{avgOT}s</span></div>}
                        </div>
                        {patAtt > 0 && (
                          <>
                            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mt-2.5 mb-1">PAT</p>
                            <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                              <div><span className="text-muted">Made</span> <span className="text-make font-medium ml-1">{patMade}</span></div>
                              <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{patAtt}</span></div>
                              <div><span className="text-muted">Pct</span> <span className="text-accent font-medium ml-1">{patPct}</span></div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            {(() => { const sessionHasOT = kicks.some((k) => k.opTime && k.opTime > 0) || editing; return (
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Holder</th>
                    <th className="table-header">Dist</th>
                    <th className="table-header">Pos</th>
                    <th className="table-header">Result</th>
                    {!hideScore && <th className="table-header">Score</th>}
                    {sessionHasOT && <th className="table-header">OT</th>}
                  </tr>
                </thead>
                <tbody>
                  {(editing ? editEntries : kicks).map((k, i) => (
                    <tr key={i} className="hover:bg-surface/30 transition-colors">
                      <td className="table-cell text-left text-muted">
                        {k.kickNum ?? i + 1}
                        {viewOnly ? (
                          k.starred ? <span className="text-amber-400"> ★</span> : ""
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleStar(i, k.starred)}
                            className={clsx("ml-1 transition-colors", k.starred ? "text-amber-400" : "text-muted/40 hover:text-amber-400")}
                            title={k.starred ? "Live rep (starred) — click to unstar" : "Mark as live rep"}
                          >
                            {k.starred ? "★" : "☆"}
                          </button>
                        )}
                      </td>
                      <td className="table-name p-1">
                        {editing ? (
                          <select value={k.athlete} onChange={(e) => setEntryAthlete(i, e.target.value)} className="bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-slate-200 max-w-[110px]">
                            <option value="">—</option>
                            {[...new Set([...athleteOptions, ...(k.athlete ? [k.athlete] : [])])].sort((a, b) => a.localeCompare(b)).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                        ) : k.athlete}
                      </td>
                      <td className="table-cell p-1">
                        {viewOnly ? (
                          <span className="text-xs text-muted" title={k.holder || "No holder"}>{toInitials(k.holder)}</span>
                        ) : (
                          <div className="relative inline-flex">
                            <span
                              className={clsx(
                                "inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded text-xs font-bold",
                                k.holder ? "border border-accent/40 text-accent" : "text-transparent"
                              )}
                              title={k.holder || "Set holder"}
                            >
                              {k.holder ? toInitials(k.holder) : " "}
                            </span>
                            <select
                              value={k.holder ?? ""}
                              onChange={(e) => changeHolder(i, e.target.value)}
                              aria-label="Change holder"
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            >
                              <option value="">— None</option>
                              {[...new Set([...holders, ...(k.holder ? [k.holder] : [])])]
                                .sort((a, b) => a.localeCompare(b))
                                .map((h) => <option key={h} value={h}>{h}</option>)}
                            </select>
                          </div>
                        )}
                      </td>
                      {editing ? (
                        <>
                          <td className="table-cell p-1"><input type="text" inputMode="numeric" value={k.dist || ""} onChange={(e) => updateEntry(i, "dist", parseInt(e.target.value) || 0)} className="w-12 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-slate-200" /></td>
                          <td className="table-cell p-1">
                            <select value={k.pos} onChange={(e) => updateEntry(i, "pos", e.target.value)} className="bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-slate-200">
                              {["LH","LM","M","RM","RH","PAT"].map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </td>
                          <td className="table-cell p-1">
                            <select value={k.result} onChange={(e) => updateEntry(i, "result", e.target.value)} className="bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-slate-200">
                              {["YL","YC","YR","XL","XS","XR","X"].map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          </td>
                          {!hideScore && <td className="table-cell p-1"><input type="text" inputMode="numeric" value={k.score || ""} onChange={(e) => updateEntry(i, "score", parseInt(e.target.value) || 0)} className="w-10 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-slate-200" /></td>}
                          {sessionHasOT && <td className="table-cell p-1"><input type="text" inputMode="numeric" value={timeValue(i, "opTime", k.opTime || 0)} onChange={(e) => updateTime(i, "opTime", e.target.value)} className="w-12 bg-surface-2 border border-accent/40 rounded px-1 py-0.5 text-xs text-center text-slate-200" /></td>}
                        </>
                      ) : (
                        <>
                          <td className="table-cell">{k.dist} yd</td>
                          <td className="table-cell text-muted">{k.pos}</td>
                          <td className="table-cell">
                            <span className={clsx("text-xs font-semibold", k.result.startsWith("Y") ? "text-make" : "text-miss")}>
                              {formatResult(k.result, makeMode)}
                            </span>
                          </td>
                          {!hideScore && <td className="table-cell">{k.score}</td>}
                          {sessionHasOT && <td className="table-cell text-muted">{k.opTime && k.opTime > 0 ? `${k.opTime.toFixed(2)}s` : "—"}</td>}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {editing && (
                <button onClick={addEntry} className="mt-2 text-xs px-2.5 py-1.5 rounded-input border border-accent/50 text-accent hover:bg-accent/10 transition-all font-semibold">+ Add Kick</button>
              )}
            </div>
            ); })()}
          </>)}
          </>
        )}
      </div>
    </main>
  );
}
