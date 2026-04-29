"use client";

import { useState, useEffect } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { useLongSnap } from "@/lib/longSnapContext";
import { getSnapBenchmark } from "@/lib/stats";
import type { LongSnapEntry, SnapType, SnapAccuracy } from "@/types";
import clsx from "clsx";

interface SnapOverlayProps {
  snapType: SnapType; // "PUNT" or "FG"
  entryCount: number; // how many punts/kicks in the log
  onClose: () => void;
}

interface SnapRow {
  time: string;
  accuracy: string;
}

const STORAGE_PREFIX = "snapOverlay_";

function loadSnapSettings(): { chartMode: "simple" | "detailed"; missMode: "simple" | "detailed" } {
  try {
    const raw = localStorage.getItem("snapSettings");
    if (raw) {
      const p = JSON.parse(raw);
      return { chartMode: p.chartMode === "detailed" ? "detailed" : "simple", missMode: p.missMode === "detailed" ? "detailed" : "simple" };
    }
  } catch {}
  return { chartMode: "simple", missMode: "simple" };
}

export function SnapOverlay({ snapType, entryCount, onClose }: SnapOverlayProps) {
  const { athletes, commitPractice } = useLongSnap();
  const athleteNames = athletes.map((a) => a.name);

  const [chartMode] = useState(() => loadSnapSettings().chartMode);
  const [missMode] = useState(() => loadSnapSettings().missMode);

  const storageKey = `${STORAGE_PREFIX}${snapType}`;

  const [rows, setRows] = useState<SnapRow[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const [snapMarkers, setSnapMarkers] = useState<SnapMarker[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey + "_markers");
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  });

  const [athlete, setAthlete] = useState<string>(() => athleteNames[0] ?? "");
  const [committed, setCommitted] = useState(false);

  // Update athlete when athletes load asynchronously
  useEffect(() => {
    if (!athlete && athleteNames.length > 0) setAthlete(athleteNames[0]);
  }, [athleteNames, athlete]);

  // Ensure rows match entry count
  useEffect(() => {
    setRows((prev) => {
      if (prev.length >= entryCount) return prev.slice(0, entryCount);
      const extra = Array.from({ length: entryCount - prev.length }, () => ({ time: "", accuracy: "" }));
      return [...prev, ...extra];
    });
  }, [entryCount]);

  // Auto-save
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(rows)); } catch {}
  }, [rows, storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey + "_markers", JSON.stringify(snapMarkers)); } catch {}
  }, [snapMarkers, storageKey]);

  const formatAutoDecimal = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    return `${whole}.${padded.slice(-2)}`;
  };

  const updateRow = (idx: number, field: keyof SnapRow, value: string) => {
    setRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const nextSnapNum = snapMarkers.length + 1;

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
        acc = chartMode === "detailed" && marker.zoneCell ? (CELL_ARROWS[marker.zoneCell] ?? "Strike") : "Strike";
      } else {
        acc = missMode === "detailed" && marker.missCell ? (MISS_ARROWS[marker.missCell] ?? "Ball") : "Ball";
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

  const filledRows = rows.filter((r) => r.time || r.accuracy);

  const handleCommit = () => {
    if (filledRows.length === 0) return;
    const snapAthlete = athlete || "Unknown";
    const snaps: LongSnapEntry[] = rows
      .filter((r) => r.time || r.accuracy)
      .map((r) => {
        const time = parseFloat(r.time) || 0;
        const accuracy: SnapAccuracy = r.accuracy === "Ball" ? "HIGH" : r.accuracy === "Strike" ? "ON_TARGET" : "ON_TARGET";
        return {
          athleteId: snapAthlete,
          athlete: snapAthlete,
          snapType,
          time,
          accuracy,
          score: 0,
          benchmark: getSnapBenchmark(snapType, time),
        };
      });
    commitPractice(snaps);
    setRows(Array.from({ length: entryCount }, () => ({ time: "", accuracy: "" })));
    setSnapMarkers([]);
    try { localStorage.removeItem(storageKey); localStorage.removeItem(storageKey + "_markers"); } catch {}
    setCommitted(true);
    setTimeout(() => setCommitted(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-2xl shadow-accent-lg my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <button onClick={onClose} className="text-muted hover:text-white text-lg font-bold transition-colors">✕</button>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
            {snapType === "PUNT" ? "Punt" : "FG"} Snap Data
          </h2>
          <div className="w-6" />
        </div>

        <div className="flex flex-col lg:flex-row">
          {/* Left: Table */}
          <div className="lg:w-[55%] p-4 space-y-3 border-b lg:border-b-0 lg:border-r border-border">
            {/* Athlete selector */}
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Snapper</p>
              <div className="flex flex-wrap gap-1.5">
                {athleteNames.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAthlete(a)}
                    className={clsx(
                      "px-3 py-1.5 rounded-input text-xs font-medium transition-all",
                      athlete === a ? "bg-accent text-slate-900 font-bold" : "bg-surface-2 text-slate-300 border border-border hover:bg-surface-2/80"
                    )}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Snap table */}
            <div className="overflow-y-auto max-h-[300px]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 z-10">
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border">#</th>
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">Time</th>
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Acc</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border/30">
                      <td className="text-center text-muted py-1 px-1">{idx + 1}</td>
                      <td className="py-1 px-1">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder={snapType === "PUNT" ? "0.74" : "0.38"}
                          value={row.time}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "");
                            updateRow(idx, "time", digits ? formatAutoDecimal(digits) : "");
                          }}
                          className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                        />
                      </td>
                      <td className="py-1 px-1 text-center">
                        {row.accuracy === "Ball" || row.accuracy === "Strike" || row.accuracy.startsWith("✓") || row.accuracy.startsWith("✗") ? (
                          <span className={clsx("text-xs font-bold", row.accuracy === "Ball" || row.accuracy.startsWith("✗") ? "text-miss" : "text-make")}>{row.accuracy}</span>
                        ) : (
                          <select
                            value={row.accuracy}
                            onChange={(e) => updateRow(idx, "accuracy", e.target.value)}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
                          >
                            <option value="">—</option>
                            <option value="Ball">Ball</option>
                            <option value="Strike">Strike</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">{filledRows.length} of {entryCount} snaps</span>
              <button
                onClick={handleCommit}
                disabled={filledRows.length === 0}
                className={clsx("btn-primary text-xs py-1.5 px-4", committed && "bg-make/90")}
              >
                {committed ? "✓ Saved!" : "Save to Snapping"}
              </button>
            </div>
          </div>

          {/* Right: Strike zone */}
          <div className="lg:w-[45%] p-4 space-y-2">
            <PunterStrikeZone markers={snapMarkers} onSnap={handleSnapClick} nextNum={nextSnapNum} chartMode={chartMode} missMode={missMode} />
            {snapMarkers.length > 0 && (
              <button
                onClick={handleUndoSnap}
                className="w-full text-xs py-1.5 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all"
              >
                Undo Snap #{snapMarkers.length}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
