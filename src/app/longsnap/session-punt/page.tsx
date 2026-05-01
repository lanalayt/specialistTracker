"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct, getSnapBenchmark } from "@/lib/stats";
import type { LongSnapEntry, SnapAccuracy, SnapBenchmark } from "@/types";
import clsx from "clsx";
import { teamSet, teamGet, getTeamId } from "@/lib/teamData";

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
  critical?: boolean;
}

const emptyRow = (): LogRow => ({ athlete: "", time: "", accuracy: "", critical: false });

export default function LongSnapPuntSessionPage() {
  const { athletes, stats, commitPractice } = useLongSnap();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;

  const [rows, setRows] = useState<LogRow[]>(Array.from({ length: INIT_ROWS }, emptyRow));
  const [weather, setWeather] = useState("");
  const [weatherLocked, setWeatherLocked] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [snapMarkers, setSnapMarkers] = useState<SnapMarker[]>([]);
  const [chartMode, setChartMode] = useState<"simple" | "detailed">(() => {
    if (typeof window === "undefined") return "simple";
    try { const r = localStorage.getItem("snapSettings"); if (r) return JSON.parse(r).chartMode === "detailed" ? "detailed" : "simple"; } catch {}
    return "simple";
  });
  const [missMode, setMissMode] = useState<"simple" | "detailed">(() => {
    if (typeof window === "undefined") return "simple";
    try { const r = localStorage.getItem("snapSettings"); if (r) return JSON.parse(r).missMode === "detailed" ? "detailed" : "simple"; } catch {}
    return "simple";
  });

  // Load from cloud on mount to ensure correct settings
  useEffect(() => {
    import("@/lib/settingsSync").then(({ loadSettingsFromCloud }) => {
      loadSettingsFromCloud<{ chartMode?: string; missMode?: string }>("snapSettings").then((cloud) => {
        if (cloud) {
          if (cloud.chartMode === "detailed" || cloud.chartMode === "simple") setChartMode(cloud.chartMode);
          if (cloud.missMode === "detailed" || cloud.missMode === "simple") setMissMode(cloud.missMode);
          try { localStorage.setItem("snapSettings", JSON.stringify({ chartMode: cloud.chartMode, missMode: cloud.missMode })); } catch {}
        }
      });
    });
  }, []);

  // Re-read settings when changed
  useEffect(() => {
    const reload = () => {
      try {
        const r = localStorage.getItem("snapSettings");
        if (r) {
          const p = JSON.parse(r);
          setChartMode(p.chartMode === "detailed" ? "detailed" : "simple");
          setMissMode(p.missMode === "detailed" ? "detailed" : "simple");
        }
      } catch {}
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

  const draftKey = () => {
    const tid = getTeamId();
    return tid ? `longsnap_manual_draft_${DRAFT_SUFFIX}_${tid}` : `longsnap_manual_draft_${DRAFT_SUFFIX}`;
  };

  // Load draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey());
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.rows?.length) { setRows(draft.rows); if (draft.weather) setWeather(draft.weather); }
        if (draft.snapMarkers?.length) setSnapMarkers(draft.snapMarkers);
        if (draft.committed) setCommitted(true);
        if (draft.rows?.length || draft.snapMarkers?.length) return;
      }
    } catch {}
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<{ rows: LogRow[]; weather?: string; snapMarkers?: SnapMarker[] }>(tid, `longsnap_manual_draft_${DRAFT_SUFFIX}`).then((d) => {
        if (d?.rows?.length) { setRows(d.rows); if (d.weather) setWeather(d.weather); }
        if (d?.snapMarkers?.length) setSnapMarkers(d.snapMarkers);
      });
    }
  }, []);

  // Auto-save draft locally
  useEffect(() => {
    try { localStorage.setItem(draftKey(), JSON.stringify({ rows, weather, snapMarkers })); } catch {}
  }, [rows, weather, snapMarkers]);

  const [draftSaved, setDraftSaved] = useState(false);
  const handleSaveDraft = () => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamSet(tid, `longsnap_manual_draft_${DRAFT_SUFFIX}`, { rows, weather, snapMarkers });
    }
    try { localStorage.setItem(draftKey(), JSON.stringify({ rows, weather, snapMarkers })); } catch {}
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

    const snaps: LongSnapEntry[] = filled.map((r) => {
      const time = parseFloat(r.time) || 0;
      const accuracy: SnapAccuracy = r.accuracy === "Strike" || r.accuracy.startsWith("✓") ? "ON_TARGET" : r.accuracy === "Ball" || r.accuracy.startsWith("✗") ? "HIGH" : (r.accuracy || "ON_TARGET") as SnapAccuracy;
      return {
        athleteId: r.athlete,
        athlete: r.athlete,
        snapType: SNAP_TYPE,
        time,
        accuracy,
        score: 0,
        benchmark: getSnapBenchmark(SNAP_TYPE, time),
        critical: !!r.critical,
      };
    });

    commitPractice(snaps, undefined, weather);
    setCommitted(true);
    // Keep data in draft but mark as committed
    try { localStorage.setItem(draftKey(), JSON.stringify({ rows, weather, snapMarkers, committed: true })); } catch {}
  };

  const handleNewSession = () => {
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setSnapMarkers([]);
    setWeather("");
    setCommitted(false);
    try { localStorage.removeItem(draftKey()); } catch {}
  };

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
      {/* Left: Table */}
      <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
        {/* Weather */}
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
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-10 border-b border-border">Crit</th>
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
                    <input
                      type="checkbox"
                      checked={!!row.critical}
                      disabled={viewOnly}
                      onChange={(e) => updateRow(idx, "critical", e.target.checked)}
                      className="w-4 h-4 accent-miss cursor-pointer disabled:cursor-not-allowed"
                    />
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
                  onClick={() => { setRows(Array.from({ length: INIT_ROWS }, emptyRow)); setSnapMarkers([]); try { localStorage.removeItem(draftKey()); const tid = getTeamId(); if (tid && tid !== "local-dev") teamSet(tid, `longsnap_manual_draft_${DRAFT_SUFFIX}`, null); } catch {} }}
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
                  onClick={handleCommit}
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
    </main>
  );
}
