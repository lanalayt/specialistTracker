"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct, getSnapBenchmark } from "@/lib/stats";
import type { LongSnapEntry, SnapAccuracy, SnapBenchmark } from "@/types";
import clsx from "clsx";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getTeamId } from "@/lib/teamData";
import { loadDraft, saveDraft, clearDraft } from "@/lib/draftStore";
import { loadSettingsFromCloud, getCachedSettings } from "@/lib/settingsSync";
import { LongSnapCommitModal } from "@/components/ui/LongSnapCommitModal";

const SNAP_TYPE = "PUNT" as const;
const DRAFT_SUFFIX = "punt";
const INIT_ROWS = 12;

const ACC_OPTIONS: { value: SnapAccuracy; label: string }[] = [
  { value: "ON_TARGET", label: "✓" },
  { value: "HIGH", label: "↑" },
  { value: "LOW", label: "↓" },
  { value: "LEFT", label: "←" },
  { value: "RIGHT", label: "→" },
];

interface LogRow {
  athlete: string;
  time: string;
  accuracy: string;
  spiral?: string; // "Good" = Tight, "Bad" = Open
}

const emptyRow = (): LogRow => ({ athlete: "", time: "", accuracy: "", spiral: "" });

export default function LongSnapPuntSessionPage() {
  const pathname = usePathname();
  const isAthleteMode = pathname.startsWith("/athlete");
  const { athletes, stats, commitPractice } = useLongSnap();
  const { isAthlete, isCoach, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;

  const [rows, setRows] = useState<LogRow[]>(Array.from({ length: INIT_ROWS }, emptyRow));
  const [weather, setWeather] = useState("");
  const [showCommit, setShowCommit] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [snapMarkers, setSnapMarkers] = useState<SnapMarker[]>([]);
  const [chartMode, setChartMode] = useState<"simple" | "detailed">(() =>
    getCachedSettings<{ chartMode?: string }>("snapSettings")?.chartMode === "detailed" ? "detailed" : "simple"
  );
  const [missMode, setMissMode] = useState<"simple" | "detailed">(() =>
    getCachedSettings<{ missMode?: string }>("snapSettings")?.missMode === "detailed" ? "detailed" : "simple"
  );

  // Load from cloud on mount to ensure correct settings
  useEffect(() => {
    loadSettingsFromCloud<{ chartMode?: string; missMode?: string }>("snapSettings").then((cloud) => {
      if (cloud) {
        if (cloud.chartMode === "detailed" || cloud.chartMode === "simple") setChartMode(cloud.chartMode);
        if (cloud.missMode === "detailed" || cloud.missMode === "simple") setMissMode(cloud.missMode);
      }
    });
  }, []);

  // Re-read settings when changed
  useEffect(() => {
    const reload = () => {
      const p = getCachedSettings<{ chartMode?: string; missMode?: string }>("snapSettings");
      if (p) {
        setChartMode(p.chartMode === "detailed" ? "detailed" : "simple");
        setMissMode(p.missMode === "detailed" ? "detailed" : "simple");
      }
    };
    window.addEventListener("focus", reload);
    window.addEventListener("settingsChanged", reload);
    return () => { window.removeEventListener("focus", reload); window.removeEventListener("settingsChanged", reload); };
  }, []);

  const athleteNames = athletes.map((a) => a.name);

  // Current session stats from the log rows
  const filledForStats = rows.filter((r) => r.accuracy);
  const sessionOnTarget = filledForStats.filter((r) => r.accuracy === "Strike" || r.accuracy === "ON_TARGET" || r.accuracy.startsWith("✓")).length;
  const sessionTimes = filledForStats.filter((r) => r.time && parseFloat(r.time) > 0);
  const sessionAvgTime = sessionTimes.length > 0 ? (sessionTimes.reduce((s, r) => s + parseFloat(r.time), 0) / sessionTimes.length).toFixed(2) : "—";
  const sessionPct = makePct(filledForStats.length, sessionOnTarget);

  const CLOUD_DRAFT_KEY = `longsnap_manual_draft_${DRAFT_SUFFIX}`;

  // Draft persistence in session_drafts (DB), not localStorage. Hydrate first so
  // the empty initial state can't clobber a saved draft.
  const draftHydrated = useRef(false);
  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (tid && tid !== "local-dev") {
        const d = await loadDraft<{ rows?: LogRow[]; weather?: string; snapMarkers?: SnapMarker[]; committed?: boolean }>(tid, CLOUD_DRAFT_KEY);
        if (d?.rows?.length) { setRows(d.rows); if (d.weather) setWeather(d.weather); }
        if (d?.snapMarkers?.length) setSnapMarkers(d.snapMarkers);
        if (d?.committed) setCommitted(true);
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

  const filledRows = rows.filter((r) => r.athlete || r.time || r.accuracy);

  // Find the next row that needs accuracy filled (skip manually filled rows)
  const nextSnapNum = (() => {
    const idx = rows.findIndex((r) => !r.accuracy);
    return idx >= 0 ? idx + 1 : rows.length + 1;
  })();

  const CELL_ARROWS: Record<string, string> = {
    TL: "✓↖", TC: "✓↑", TR: "✓↗",
    ML: "✓←", MC: "✓", MR: "✓→",
    BL: "✓↙", BC: "✓↓", BR: "✓↘",
  };

  const MISS_ARROWS: Record<string, string> = {
    HIGH_L: "✗↖", HIGH: "✗↑", HIGH_R: "✗↗",
    LEFT: "✗←", RIGHT: "✗→",
    LOW_L: "✗↙", LOW: "✗↓", LOW_R: "✗↘",
  };

  const handleSnapClick = (marker: SnapMarker) => {
    const rowIdx = marker.num - 1;
    if (rowIdx < rows.length) {
      let acc: string;
      if (marker.inZone) {
        if (chartMode === "detailed" && marker.zoneCell) {
          acc = CELL_ARROWS[marker.zoneCell] ?? "Strike";
        } else {
          acc = "Strike";
        }
      } else {
        if (missMode === "detailed" && marker.missCell) {
          acc = MISS_ARROWS[marker.missCell] ?? "Ball";
        } else {
          acc = "Ball";
        }
      }
      setRows((prev) => prev.map((r, i) => i === rowIdx ? { ...r, accuracy: acc } : r));
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

  const formatAutoDecimal = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    return `${whole}.${padded.slice(-2)}`;
  };

  const handleCommit = () => {
    const filled = rows.filter((r) => r.athlete && r.time);
    if (filled.length === 0) return;

    // Markers are keyed by row position (num = row index + 1); attach each
    // one to its snap so the diagram can be redrawn per athlete in history.
    const markerByRow = new Map(snapMarkers.map((m) => [m.num - 1, m]));
    const snaps: LongSnapEntry[] = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => filled.includes(r))
      .map(({ r, i }) => {
        const time = parseFloat(r.time) || 0;
        const accuracy: SnapAccuracy = r.accuracy === "Strike" || r.accuracy.startsWith("✓") ? "ON_TARGET" : r.accuracy === "Ball" || r.accuracy.startsWith("✗") ? "HIGH" : (r.accuracy || "ON_TARGET") as SnapAccuracy;
        const m = markerByRow.get(i);
        return {
          athleteId: r.athlete,
          athlete: r.athlete,
          snapType: SNAP_TYPE,
          time,
          accuracy,
          score: 0,
          benchmark: getSnapBenchmark(SNAP_TYPE, time),
          spiral: r.spiral || undefined,
          markerX: m?.x,
          markerY: m?.y,
          markerInZone: m?.inZone,
        };
      });

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

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left: Table */}
      <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">

        {/* Header */}
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
            Punt Snap Log
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
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Time</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Acc</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Spiral</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-b border-border/30 transition-colors">
                  <td className="text-center text-muted py-1 px-1">{idx + 1}</td>
                  <td className="py-1 px-1">
                    <select
                      value={row.athlete}
                      onChange={(e) => updateRow(idx, "athlete", e.target.value)}
                      disabled={viewOnly}
                      className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                    >
                      <option value="">—</option>
                      {athleteNames.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0.74"
                      value={row.time}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        updateRow(idx, "time", digits ? formatAutoDecimal(digits) : "");
                      }}
                      readOnly={viewOnly}
                      className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                    />
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
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Strike %" value={sessionPct} accent glow />
          <StatCard label="Avg Time" value={sessionAvgTime !== "—" ? `${sessionAvgTime}s` : "—"} />
          <StatCard label="Punt Snaps" value={filledForStats.length || "—"} />
        </div>
        <PunterStrikeZone markers={snapMarkers} onSnap={handleSnapClick} nextNum={nextSnapNum} chartMode={chartMode} missMode={missMode} editable />
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
