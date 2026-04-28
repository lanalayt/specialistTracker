"use client";

import { useState, useEffect, useCallback } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";
import { makePct, getSnapBenchmark } from "@/lib/stats";
import type { LongSnapEntry, SnapType, SnapAccuracy } from "@/types";
import clsx from "clsx";
import { teamGet, getTeamId } from "@/lib/teamData";

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
  snapType: string;
  time: string;
  accuracy: string;
  laces: string;
  critical?: boolean;
}

const emptyRow = (): LogRow => ({ athlete: "", snapType: "FG", time: "", accuracy: "", laces: "", critical: false });

export default function LongSnapFGSessionPage() {
  const { athletes, stats, commitPractice } = useLongSnap();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;

  const [rows, setRows] = useState<LogRow[]>(Array.from({ length: INIT_ROWS }, emptyRow));
  const [weather, setWeather] = useState("");
  const [weatherLocked, setWeatherLocked] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [snapMarkers, setSnapMarkers] = useState<ShortSnapMarker[]>([]);

  const nextSnapNum = snapMarkers.length + 1;

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

  const [showTime, setShowTime] = useState(() => {
    if (typeof window === "undefined") return false;
    try { const r = localStorage.getItem("snapSettings"); if (r) return JSON.parse(r).shortSnapTime === true; } catch {}
    return false;
  });

  useEffect(() => {
    const reload = () => {
      try { const r = localStorage.getItem("snapSettings"); if (r) setShowTime(JSON.parse(r).shortSnapTime === true); } catch {}
    };
    window.addEventListener("focus", reload);
    window.addEventListener("settingsChanged", reload);
    return () => { window.removeEventListener("focus", reload); window.removeEventListener("settingsChanged", reload); };
  }, []);

  const athleteNames = athletes.map((a) => a.name);

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
    return tid ? `longsnap_manual_draft_${DRAFT_SUFFIX}_${tid}` : `longsnap_manual_draft_${DRAFT_SUFFIX}`;
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey());
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.rows?.length) { setRows(draft.rows); if (draft.weather) setWeather(draft.weather); if (draft.snapMarkers?.length) setSnapMarkers(draft.snapMarkers); return; }
      }
    } catch {}
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<{ rows: LogRow[]; weather?: string }>(tid, `longsnap_manual_draft_${DRAFT_SUFFIX}`).then((d) => {
        if (d?.rows?.length) { setRows(d.rows); if (d.weather) setWeather(d.weather); }
      });
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(draftKey(), JSON.stringify({ rows, weather, snapMarkers })); } catch {}
  }, [rows, weather, snapMarkers]);

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
      const accuracy = (r.accuracy || "ON_TARGET") as SnapAccuracy;
      const snapType = (r.snapType || "FG") as SnapType;
      return {
        athleteId: r.athlete,
        athlete: r.athlete,
        snapType,
        time,
        accuracy,
        score: 0,
        benchmark: getSnapBenchmark(snapType, time),
        critical: !!r.critical,
        laces: r.laces || undefined,
      };
    });

    commitPractice(snaps, undefined, weather);
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setSnapMarkers([]);
    setWeather("");
    setCommitted(true);
    try { localStorage.removeItem(draftKey()); } catch {}
    setTimeout(() => setCommitted(false), 2000);
  };

  return (
    <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
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
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Type</th>
                {showTime && <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Time</th>}
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Acc</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Laces</th>
                <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-10 border-b border-border">Crit</th>
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
                  <td className="py-1 px-1">
                    <select value={row.snapType} onChange={(e) => updateRow(idx, "snapType", e.target.value)} disabled={viewOnly} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60">
                      <option value="FG">FG</option>
                      <option value="PAT">PAT</option>
                    </select>
                  </td>
                  {showTime && (
                  <td className="py-1 px-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="0.38"
                      value={row.time}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        updateRow(idx, "time", digits ? formatAutoDecimal(digits) : "");
                      }}
                      readOnly={viewOnly}
                      className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                    />
                  </td>
                  )}
                  <td className="py-1 px-1 text-center">
                    {row.accuracy === "Ball" || row.accuracy === "Strike" ? (
                      <span className={clsx("text-xs font-bold", row.accuracy === "Strike" ? "text-make" : "text-miss")}>{row.accuracy}</span>
                    ) : (
                      <select value={row.accuracy} onChange={(e) => updateRow(idx, "accuracy", e.target.value)} disabled={viewOnly} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60">
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
          <span className="text-xs text-muted flex-1">
            {filledRows.length === 0 ? "0 snaps entered" : `${filledRows.length} snap${filledRows.length !== 1 ? "s" : ""} entered`}
          </span>
          {!viewOnly && filledRows.length > 0 && (
            <button
              onClick={() => { setRows(Array.from({ length: INIT_ROWS }, emptyRow)); setSnapMarkers([]); try { localStorage.removeItem(draftKey()); } catch {} }}
              className="text-xs px-3 py-2 rounded-input border border-border text-muted hover:text-miss hover:border-miss/50 font-semibold transition-all"
            >
              Clear Log
            </button>
          )}
          {!viewOnly && (
            <button
              onClick={handleCommit}
              disabled={filledRows.length === 0}
              className={clsx("btn-primary text-xs py-2 px-5", committed && "bg-make/90")}
            >
              {committed ? "✓ Committed!" : `Commit Session${filledRows.length > 0 ? ` (${filledRows.length})` : ""}`}
            </button>
          )}
        </div>
      </div>

      {/* Right: Stats */}
      <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="On-Target%" value={onTargetPct} accent glow />
          <StatCard label="Avg Time" value={totals.att > 0 ? `${avgTime}s` : "—"} />
          <StatCard label="FG/PAT Snaps" value={totals.att || "—"} />
        </div>
        <HolderStrikeZone markers={snapMarkers} onSnap={handleSnapClick} nextNum={nextSnapNum} />
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
