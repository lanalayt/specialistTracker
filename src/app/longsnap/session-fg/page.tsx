"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct } from "@/lib/stats";
import type { LongSnapEntry, SnapType, SnapAccuracy } from "@/types";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getTeamId } from "@/lib/teamData";
import { loadDraft, saveDraft, clearDraft } from "@/lib/draftStore";
import { LongSnapCommitModal } from "@/components/ui/LongSnapCommitModal";
import { SnapSessionSummary } from "@/components/ui/SnapSessionSummary";

const DRAFT_SUFFIX = "fg";
const INIT_ROWS = 12;

const ACC_OPTIONS: { value: SnapAccuracy; label: string }[] = [
  { value: "ON_TARGET", label: "✓" },
  { value: "HIGH", label: "↑" },
  { value: "LOW", label: "↓" },
  { value: "LEFT", label: "←" },
  { value: "RIGHT", label: "→" },
];

const LACES_OPTIONS = ["Good", "1/4 Out", "1/4 In", "Back"];

interface LogRow {
  athlete: string;
  accuracy: string;
  laces: string;
  spiral: string;
}

const emptyRow = (): LogRow => ({ athlete: "", accuracy: "", laces: "", spiral: "" });

export default function LongSnapFGSessionPage() {
  const pathname = usePathname();
  const isAthleteMode = pathname.startsWith("/athlete");
  const { athletes, stats, commitPractice } = useLongSnap();
  const { isAthlete, isCoach, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;

  const [rows, setRows] = useState<LogRow[]>(Array.from({ length: INIT_ROWS }, emptyRow));
  const [weather, setWeather] = useState("");
  const [showCommit, setShowCommit] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [snapMarkers, setSnapMarkers] = useState<ShortSnapMarker[]>([]);

  const nextSnapNum = (() => {
    const idx = rows.findIndex((r) => !r.accuracy);
    return idx >= 0 ? idx + 1 : rows.length + 1;
  })();

  const handleSnapClick = (marker: ShortSnapMarker) => {
    const rowIdx = marker.num - 1;
    if (rowIdx < rows.length) {
      setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, accuracy: marker.inZone ? "Strike" : "Ball" } : r));
    }
    setSnapMarkers((prev) => [...prev, marker]);
  };

  const handleUndoSnap = () => {
    if (snapMarkers.length === 0) return;
    const last = snapMarkers[snapMarkers.length - 1];
    const rowIdx = last.num - 1;
    if (rowIdx < rows.length) {
      setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, accuracy: "" } : r));
    }
    setSnapMarkers((prev) => prev.slice(0, -1));
  };

  const athleteNames = athletes.map((a) => a.name);

  // Current session stats from the log rows
  const filledForStats = rows.filter((r) => r.accuracy);
  const sessionOnTarget = filledForStats.filter((r) => r.accuracy === "Strike" || r.accuracy === "ON_TARGET" || r.accuracy.startsWith("✓")).length;
  const onTargetPct = makePct(filledForStats.length, sessionOnTarget);

  const CLOUD_DRAFT_KEY = `longsnap_manual_draft_${DRAFT_SUFFIX}`;

  // Draft persistence in session_drafts (DB), not localStorage. Hydrate first so
  // the empty initial state can't clobber a saved draft.
  const draftHydrated = useRef(false);
  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (tid && tid !== "local-dev") {
        const d = await loadDraft<{ rows?: LogRow[]; weather?: string; snapMarkers?: ShortSnapMarker[]; committed?: boolean }>(tid, CLOUD_DRAFT_KEY);
        if (d?.rows?.length) {
          setRows(d.rows);
          if (d.weather) setWeather(d.weather);
          if (d.snapMarkers?.length) setSnapMarkers(d.snapMarkers);
          if (d.committed) setCommitted(true);
        }
      }
      draftHydrated.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!draftHydrated.current) return;
    const tid = getTeamId();
    if (tid && tid !== "local-dev") saveDraft(tid, CLOUD_DRAFT_KEY, { rows, weather, snapMarkers, committed });
  }, [rows, weather, snapMarkers, committed]);

  const [draftSaved, setDraftSaved] = useState(false);
  const handleSaveDraft = () => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") saveDraft(tid, CLOUD_DRAFT_KEY, { rows, weather, snapMarkers, committed });
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2000);
  };

  const updateRow = (idx: number, field: keyof LogRow, value: string | boolean) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const deleteRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const filledRows = rows.filter((r) => r.athlete || r.accuracy || r.laces || r.spiral);


  // Build the committed snap entries from the current rows + diagram markers.
  // Derived (not stored) so the post-commit summary survives a page reload —
  // rows and markers are persisted in the draft, committedSnaps state isn't.
  const buildSnaps = (): LongSnapEntry[] => {
    // Markers are keyed by row position (num = row index + 1); attach each
    // one to its snap so the diagram can be redrawn per athlete.
    const markerByRow = new Map(snapMarkers.map((m) => [m.num - 1, m]));
    return rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.athlete || r.accuracy || r.laces || r.spiral)
      .map(({ r, i }) => {
        const accuracy: SnapAccuracy = r.accuracy === "Strike" || r.accuracy.startsWith("✓") ? "ON_TARGET" : r.accuracy === "Ball" || r.accuracy.startsWith("✗") ? "HIGH" : (r.accuracy || "ON_TARGET") as SnapAccuracy;
        const m = markerByRow.get(i);
        // 30-point FG snap scoring, same as the FG snap popup: strike +1,
        // laces Good +1 (any 1/4 turn +0.5), spiral Good +1 — max 3.
        let score = 0;
        if (accuracy === "ON_TARGET") score += 1;
        if (r.laces === "Good") score += 1;
        else if (r.laces && r.laces.startsWith("1/4")) score += 0.5;
        if (r.spiral === "Good") score += 1;
        return {
          athleteId: r.athlete,
          athlete: r.athlete,
          snapType: "FG" as SnapType,
          time: 0,
          accuracy,
          score,
          laces: r.laces || undefined,
          spiral: r.spiral || undefined,
          markerX: m?.x,
          markerY: m?.y,
          markerInZone: m?.inZone,
        };
      });
  };

  const handleCommit = () => {
    const snaps = buildSnaps();
    if (snaps.length === 0) return;
    commitPractice(snaps, undefined, weather);
    setShowCommit(false);
    setCommitted(true); // auto-save effect persists committed=true to the DB draft
  };

  const handleNewSession = () => {
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setSnapMarkers([]);
    setWeather("");
    setCommitted(false);
    { const tid = getTeamId(); if (tid && tid !== "local-dev") clearDraft(tid, CLOUD_DRAFT_KEY); }
  };

  // After committing, show a per-athlete summary instead of staying on the log.
  if (committed) {
    const summarySnaps = buildSnaps();
    return (
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Session Summary</h2>
              <p className="text-xs text-make font-semibold mt-0.5">Committed · {summarySnaps.length} snap{summarySnaps.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/longsnap/history" className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all self-center">View in History</Link>
              {!viewOnly && <button onClick={handleNewSession} className="btn-primary text-xs py-2 px-5">New Session</button>}
            </div>
          </div>
          <SnapSessionSummary snaps={summarySnaps} />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
            FG / PAT Snap Log
            {filledRows.length > 0 && <span className="text-accent">({filledRows.length})</span>}
          </h2>
          {!viewOnly && (
            <button onClick={addRow} className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all">+ Row</button>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="sticky top-0 z-10">
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border">#</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center border-b border-border">Athlete</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Acc</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-24 border-b border-border">Laces</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Spiral</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border/30 transition-colors">
                  <td className="text-center text-muted py-1 px-1">{idx + 1}</td>
                  <td className="py-1 px-1">
                    <select value={row.athlete} onChange={(e) => updateRow(idx, "athlete", e.target.value)} disabled={viewOnly} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60">
                      <option value="">—</option>
                      {athleteNames.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="py-1 px-1 text-center">
                    {row.accuracy.startsWith("✓") || row.accuracy.startsWith("✗") ? (
                      <span className={clsx("text-xs font-bold", row.accuracy.startsWith("✗") ? "text-miss" : "text-make")}>{row.accuracy}</span>
                    ) : (
                      <select
                        value={row.accuracy}
                        onChange={(e) => updateRow(idx, "accuracy", e.target.value)}
                        disabled={viewOnly}
                        className={clsx("w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs font-bold focus:outline-none focus:border-accent/60 disabled:opacity-60",
                          row.accuracy === "Strike" ? "text-make" : row.accuracy === "Ball" ? "text-miss" : "text-slate-200"
                        )}
                      >
                        <option value="">—</option>
                        <option value="Ball">Ball</option>
                        <option value="Strike">Strike</option>
                      </select>
                    )}
                  </td>
                  <td className="py-1 px-1">
                    <select value={row.laces} onChange={(e) => updateRow(idx, "laces", e.target.value)} disabled={viewOnly} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60">
                      <option value="">—</option>
                      {LACES_OPTIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </td>
                  <td className="py-1 px-1 text-center">
                    <select
                      value={row.spiral ?? ""}
                      onChange={(e) => updateRow(idx, "spiral", e.target.value)}
                      disabled={viewOnly}
                      className={clsx("w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs font-semibold focus:outline-none focus:border-accent/60 disabled:opacity-60",
                        row.spiral === "Good" ? "text-make" : row.spiral === "Bad" ? "text-miss" : "text-slate-200"
                      )}
                    >
                      <option value="">—</option>
                      <option value="Good">Tight</option>
                      <option value="Bad">Open</option>
                    </select>
                  </td>
                  <td className="py-1 px-1 text-center">
                    {!viewOnly && (
                      <button onClick={() => deleteRow(idx)} className="text-border hover:text-miss transition-colors text-sm leading-none px-1" title="Delete row">×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-3 flex items-center gap-2 shrink-0">
          {committed ? (
            <>
              <span className="text-xs text-make font-semibold flex-1">Session Committed ({filledRows.length} snaps)</span>
              <button onClick={handleNewSession} className="btn-primary text-xs py-2 px-5">← Back to Log</button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted flex-1">
                {filledRows.length === 0 ? "0 snaps entered" : `${filledRows.length} snap${filledRows.length !== 1 ? "s" : ""} entered`}
              </span>
              {!viewOnly && filledRows.length > 0 && (
                <button
                  onClick={() => { setRows(Array.from({ length: INIT_ROWS }, emptyRow)); setSnapMarkers([]); const tid = getTeamId(); if (tid && tid !== "local-dev") clearDraft(tid, CLOUD_DRAFT_KEY); }}
                  className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-miss hover:border-miss/50 font-semibold transition-all"
                >
                  Clear Log
                </button>
              )}
              {!viewOnly && filledRows.length > 0 && (
                <button
                  onClick={handleSaveDraft}
                  className={clsx("text-xs px-3 py-2 rounded-input border font-semibold transition-all", draftSaved ? "border-make/50 text-make" : "border-accent/50 text-accent hover:bg-accent/10")}
                >
                  {draftSaved ? "✓ Draft Saved" : "Save Draft"}
                </button>
              )}
              {!viewOnly && (
                <button
                  onClick={() => setShowCommit(true)}
                  disabled={filledRows.length === 0}
                  className="btn-primary text-xs py-2 px-5"
                >
                  Commit Session{filledRows.length > 0 ? ` (${filledRows.length})` : ""}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right: Stats */}
      <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Strike %" value={onTargetPct} accent glow />
          <StatCard label="FG/PAT Snaps" value={filledForStats.length || "—"} />
        </div>
        <HolderStrikeZone markers={snapMarkers} onSnap={handleSnapClick} nextNum={nextSnapNum} editable />
        {snapMarkers.length > 0 && (
          <button
            onClick={handleUndoSnap}
            className="w-full text-xs py-1.5 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all"
          >
            Undo Snap #{snapMarkers.length}
          </button>
        )}
      </div>

      {showCommit && (
        <LongSnapCommitModal
          count={filledRows.length}
          label={new Date().toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })}
          weather={weather}
          onWeatherChange={setWeather}
          onConfirm={handleCommit}
          onCancel={() => setShowCommit(false)}
        />
      )}
    </main>
  );
}
