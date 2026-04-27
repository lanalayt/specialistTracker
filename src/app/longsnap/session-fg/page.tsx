"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { SnapEntryCard } from "@/components/ui/SnapEntryCard";
import { SnapTimeBars } from "@/components/ui/SnapTimeBars";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct } from "@/lib/stats";
import type { LongSnapEntry, SnapBenchmark } from "@/types";
import clsx from "clsx";
import { teamSet, teamGet, getTeamId } from "@/lib/teamData";

const BM_COLORS: Record<SnapBenchmark, string> = { excellent: "text-make", good: "text-accent", needsWork: "text-miss" };
const BM_LABELS: Record<SnapBenchmark, string> = { excellent: "Exc", good: "Good", needsWork: "NW" };
const ACC_LABEL: Record<string, string> = { ON_TARGET: "✓", HIGH: "↑", LOW: "↓", LEFT: "←", RIGHT: "→" };

const SNAP_TYPE = "FG" as const;
const DRAFT_SUFFIX = "fg";

export default function LongSnapFGSessionPage() {
  const { athletes, stats, commitPractice } = useLongSnap();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;
  const [sessionSnaps, setSessionSnaps] = useState<LongSnapEntry[]>([]);
  const [committed, setCommitted] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [weather, setWeather] = useState("");
  const [weatherLocked, setWeatherLocked] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [fgOrPat, setFgOrPat] = useState<"FG" | "PAT">("FG");

  const athleteNames = athletes.map((a) => a.name);

  // Stats filtered to FG + PAT
  const totals = athletes.reduce(
    (acc, a) => {
      const fg = stats[a.name]?.byType?.FG;
      const pat = stats[a.name]?.byType?.PAT;
      return {
        att: acc.att + (fg?.att ?? 0) + (pat?.att ?? 0),
        onTarget: acc.onTarget + (fg?.onTarget ?? 0) + (pat?.onTarget ?? 0),
        totalTime: acc.totalTime + (fg?.totalTime ?? 0) + (pat?.totalTime ?? 0),
      };
    },
    { att: 0, onTarget: 0, totalTime: 0 }
  );
  const avgTime = totals.att > 0 ? (totals.totalTime / totals.att).toFixed(2) : "—";
  const onTargetPct = makePct(totals.att, totals.onTarget);

  const draftKey = () => {
    const tid = getTeamId();
    return tid ? `longsnap_session_draft_${DRAFT_SUFFIX}_${tid}` : `longsnap_session_draft_${DRAFT_SUFFIX}`;
  };

  const saveDraftLocal = useCallback((snaps: LongSnapEntry[]) => {
    try { localStorage.setItem(draftKey(), JSON.stringify({ sessionSnaps: snaps, sessionStarted: true, weather })); } catch {}
  }, [weather]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey());
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.sessionSnaps?.length > 0) {
          setSessionSnaps(draft.sessionSnaps);
          setSessionStarted(draft.sessionStarted ?? false);
          if (draft.weather) setWeather(draft.weather);
          return;
        }
      }
    } catch {}
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<{ sessionSnaps: LongSnapEntry[]; sessionStarted: boolean; weather?: string }>(tid, `longsnap_session_draft_${DRAFT_SUFFIX}`).then((d) => {
        if (d?.sessionSnaps?.length) { setSessionSnaps(d.sessionSnaps); setSessionStarted(d.sessionStarted ?? false); if (d.weather) setWeather(d.weather); }
      });
    }
  }, []);

  const saveDraftToCloud = useCallback(() => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamSet(tid, `longsnap_session_draft_${DRAFT_SUFFIX}`, { sessionSnaps, sessionStarted, weather });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }
  }, [sessionSnaps, sessionStarted, weather]);

  const handleAddSnap = (snap: LongSnapEntry) => {
    // Override snap type with FG/PAT toggle
    const entry = { ...snap, snapType: fgOrPat };
    setSessionSnaps((prev) => { const next = [...prev, entry]; saveDraftLocal(next); return next; });
  };
  const handleDeleteSnap = (idx: number) => {
    setSessionSnaps((prev) => { const next = prev.filter((_, i) => i !== idx); saveDraftLocal(next); return next; });
  };
  const handleCommit = () => {
    if (sessionSnaps.length === 0) return;
    commitPractice(sessionSnaps, undefined, weather);
    setSessionSnaps([]);
    setCommitted(true);
    setWeather("");
    try { localStorage.removeItem(draftKey()); } catch {}
    setTimeout(() => setCommitted(false), 2000);
  };

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      <div className="lg:w-[55%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
        <div className="px-4 py-2 border-b border-border shrink-0">
          {weatherLocked || viewOnly ? (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <p className="text-[10px] text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</p>
                {weather && <p className="text-xs text-slate-300">{weather}</p>}
              </div>
              {!viewOnly && <button onClick={() => setWeatherLocked(false)} className="text-muted hover:text-white transition-colors p-1" title="Edit weather"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" /></svg></button>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
              <input type="text" value={weather} onChange={(e) => setWeather(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setWeatherLocked(true); } }} placeholder="e.g. 72F, Sunny" className="flex-1 bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted" autoFocus={weather === ""} />
            </div>
          )}
        </div>
        {/* FG / PAT toggle */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="flex rounded-input border border-border overflow-hidden w-fit">
            <button onClick={() => setFgOrPat("FG")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors", fgOrPat === "FG" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>FG</button>
            <button onClick={() => setFgOrPat("PAT")} className={clsx("px-4 py-1.5 text-xs font-semibold transition-colors border-l border-border", fgOrPat === "PAT" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}>PAT</button>
          </div>
        </div>
        <div className="overflow-y-auto border-b border-border">
          <div className={viewOnly ? "pointer-events-none opacity-60" : ""}>
            <SnapEntryCard athletes={athleteNames} snapCount={sessionSnaps.length} onAdd={handleAddSnap} lockedType={fgOrPat} />
          </div>
        </div>
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Session Log{sessionSnaps.length > 0 && <span className="text-accent ml-2">({sessionSnaps.length})</span>}</p>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border/30">
          {sessionSnaps.length === 0 ? (
            <div className="flex items-center justify-center h-16 text-xs text-muted">No snaps logged yet</div>
          ) : (
            [...sessionSnaps].reverse().map((s, ri) => {
              const idx = sessionSnaps.length - 1 - ri;
              const bm = s.benchmark;
              return (
                <div key={idx} className="flex items-center px-4 py-2.5 hover:bg-surface-2/30 transition-colors">
                  <span className="text-xs text-muted w-6 shrink-0">#{idx + 1}</span>
                  <span className="text-sm font-medium text-slate-200 w-20 shrink-0 truncate">{s.athlete}</span>
                  <span className="text-xs text-muted w-12 shrink-0">{s.snapType}</span>
                  <span className="text-xs font-bold text-slate-100 w-16 shrink-0">{s.time.toFixed(3)}s</span>
                  <span className={clsx("text-xs font-semibold w-8 shrink-0", s.accuracy === "ON_TARGET" ? "text-make" : "text-warn")}>{ACC_LABEL[s.accuracy] ?? s.accuracy}</span>
                  {bm && <span className={clsx("text-xs font-bold flex-1", BM_COLORS[bm])}>{BM_LABELS[bm]}</span>}
                  {!viewOnly && <button onClick={() => handleDeleteSnap(idx)} className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm ml-2">×</button>}
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-border p-3 flex items-center gap-2 shrink-0">
          {!viewOnly && sessionSnaps.length > 0 && <button onClick={saveDraftToCloud} className={`btn-ghost text-xs py-1.5 px-3 ${draftSaved ? "text-make" : ""}`}>{draftSaved ? "Saved!" : "Save Draft"}</button>}
          <div className="flex-1" />
          {!viewOnly && <button onClick={handleCommit} disabled={sessionSnaps.length === 0} className={clsx("btn-primary text-xs py-2 px-5", committed && "bg-make/90")}>{committed ? "Committed!" : `Commit Session${sessionSnaps.length > 0 ? ` (${sessionSnaps.length})` : ""}`}</button>}
        </div>
      </div>
      <div className="lg:w-[45%] overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="On-Target%" value={onTargetPct} accent glow />
          <StatCard label="Avg Time" value={totals.att > 0 ? `${avgTime}s` : "—"} />
          <StatCard label="FG/PAT Snaps" value={totals.att || "—"} />
        </div>
        <SnapTimeBars entries={sessionSnaps} athletes={athleteNames} />
      </div>
    </main>
  );
}
