"use client";

import { useState, useEffect } from "react";
import { PunterStrikeZone, type SnapMarker } from "@/components/ui/PunterStrikeZone";
import { HolderStrikeZone, type ShortSnapMarker } from "@/components/ui/HolderStrikeZone";
import { getTeamId } from "@/lib/teamData";
import type { SnapType } from "@/types";
import clsx from "clsx";

interface KickInfo {
  dist: string;
  pos: string;
}

interface SnapOverlayProps {
  snapType: SnapType; // "PUNT" or "FG"
  entryCount: number; // how many punts/kicks in the log
  onClose: () => void;
  kickInfos?: KickInfo[]; // FG only — distance + position per kick
}

interface SnapRow {
  snapper: string;
  time: string;
  accuracy: string;
  laces: string;
  spiral: string;
}

const STORAGE_PREFIX = "snapOverlay_";

/** Call this to clear snap overlay data when the parent log is cleared */
export function clearSnapOverlayData(snapType: "PUNT" | "FG") {
  const key = `${STORAGE_PREFIX}${snapType}`;
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(key + "_markers");
    localStorage.removeItem(key + "_savedCount");
  } catch {}
}

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

export function SnapOverlay({ snapType, entryCount, onClose, kickInfos }: SnapOverlayProps) {
  // Load snapping athletes from localStorage (same source as longSnapContext)
  const [athleteNames, setAthleteNames] = useState<string[]>([]);

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

  const [athlete, setAthlete] = useState<string>("");
  const [committed, setCommitted] = useState(false);

  // Load snapping athletes
  useEffect(() => {
    import("@/lib/athleteStore").then(({ loadAthletes }) => {
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        loadAthletes(tid, "LONGSNAP").then((a) => {
          const names = a.map((x) => x.name);
          setAthleteNames(names);
          if (!athlete && names.length > 0) setAthlete(names[0]);
        });
      }
    });
  }, []);

  // Ensure rows grow to match entry count (never shrink — preserve saved data)
  useEffect(() => {
    setRows((prev) => {
      if (prev.length >= entryCount) return prev;
      const extra = Array.from({ length: entryCount - prev.length }, () => ({ snapper: "", time: "", accuracy: "", laces: "", spiral: "" }));
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

  const filledRows = rows.filter((r) => r.snapper || r.time || r.accuracy || r.laces || r.spiral);

  const handleSaveToDraft = () => {
    const allFilled = rows.map((r, i) => ({ ...r, idx: i })).filter((r) => r.snapper || r.time || r.accuracy || r.laces || r.spiral);
    if (allFilled.length === 0) return;

    const draftSuffix = snapType === "PUNT" ? "punt" : "fg";
    const tid = getTeamId();
    const draftKey = tid ? `longsnap_manual_draft_${draftSuffix}_${tid}` : `longsnap_manual_draft_${draftSuffix}`;

    // Build all filled rows (overwrite draft entirely)
    const draftRows = allFilled.map((r) => ({
      athlete: r.snapper || athlete || "Unknown",
      time: r.time,
      accuracy: r.accuracy,
      critical: false,
      ...(snapType === "FG" ? { snapType: "FG", laces: r.laces, spiral: r.spiral, dist: kickInfos?.[r.idx]?.dist || "", pos: kickInfos?.[r.idx]?.pos || "" } : {}),
    }));

    // Pad with empty rows to INIT_ROWS
    const INIT = 12;
    const emptySnapRow = snapType === "FG"
      ? { athlete: "", accuracy: "", laces: "", spiral: "", dist: "", pos: "", critical: false, snapType: "FG" }
      : { athlete: "", time: "", accuracy: "", critical: false };
    while (draftRows.length < INIT) draftRows.push({ ...emptySnapRow } as typeof draftRows[0]);

    try { localStorage.setItem(draftKey, JSON.stringify({ rows: draftRows, weather: "", snapMarkers })); } catch {}

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
            {/* Snap table */}
            <div className="overflow-y-auto max-h-[300px]">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 z-10">
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-5 border-b border-border"></th>
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border">#</th>
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-8 border-b border-border">LS</th>
                    {snapType === "PUNT" && <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Time</th>}
                    {snapType === "FG" && <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-12 border-b border-border">Dist</th>}
                    {snapType === "FG" && <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-10 border-b border-border">Pos</th>}
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Acc</th>
                    {snapType === "FG" && <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">Laces</th>}
                    <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-10 border-b border-border">✓Spiral</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-border/30">
                      <td className="text-center py-1 px-0">
                        {(row.snapper || row.time || row.accuracy || row.laces || row.spiral) ? (
                          <button
                            onClick={() => {
                              setRows((prev) => prev.map((r, i) => i === idx ? { snapper: "", time: "", accuracy: "", laces: "", spiral: "" } : r));
                              setSnapMarkers((prev) => prev.filter((m) => m.num !== idx + 1));
                            }}
                            className="text-[9px] text-miss/50 hover:text-miss transition-colors"
                            title="Clear row"
                          >✕</button>
                        ) : null}
                      </td>
                      <td className="text-center text-muted py-1 px-1">{idx + 1}</td>
                      <td className="py-1 px-0.5">
                        <div className="flex gap-0.5 justify-center">
                          {athleteNames.map((a) => {
                            const initials = a.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
                            return (
                              <button
                                key={a}
                                onClick={() => updateRow(idx, "snapper", a)}
                                title={a}
                                className={clsx(
                                  "w-5 h-5 rounded-full text-[7px] font-bold transition-all",
                                  row.snapper === a ? "bg-accent text-slate-900" : "bg-surface-2 text-muted border border-border/50 hover:text-white"
                                )}
                              >
                                {initials}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      {snapType === "FG" && kickInfos && (
                        <td className={clsx("text-center text-xs py-1 px-1", kickInfos[idx]?.pos === "PAT" ? "bg-surface-2/50 text-muted/30" : "text-slate-400")}>{kickInfos[idx]?.pos === "PAT" ? "" : (kickInfos[idx]?.dist || "—")}</td>
                      )}
                      {snapType === "FG" && kickInfos && (
                        <td className="text-center text-xs text-slate-400 py-1 px-1">{kickInfos[idx]?.pos || "—"}</td>
                      )}
                      {snapType === "PUNT" && (
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
                          className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                        />
                      </td>
                      )}
                      <td className="py-1 px-1 text-center">
                        {row.accuracy.startsWith("✓") || row.accuracy.startsWith("✗") ? (
                          <span className={clsx("text-xs font-bold", row.accuracy.startsWith("✗") ? "text-miss" : "text-make")}>{row.accuracy}</span>
                        ) : (
                          <select
                            value={row.accuracy}
                            onChange={(e) => updateRow(idx, "accuracy", e.target.value)}
                            className={clsx("w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs font-bold focus:outline-none focus:border-accent/60",
                              row.accuracy === "Strike" ? "text-make" : row.accuracy === "Ball" ? "text-miss" : "text-slate-200"
                            )}
                          >
                            <option value="">—</option>
                            <option value="Ball">Ball</option>
                            <option value="Strike">Strike</option>
                          </select>
                        )}
                      </td>
                      {snapType === "FG" && (
                      <td className="py-1 px-1">
                        <select value={row.laces} onChange={(e) => updateRow(idx, "laces", e.target.value)} className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60">
                          <option value="">—</option>
                          <option value="Good">Good</option>
                          <option value="1/4 Out">1/4 Out</option>
                          <option value="1/4 In">1/4 In</option>
                          <option value="Back">Back</option>
                        </select>
                      </td>
                      )}
                      <td className="py-1 px-1 text-center">
                        <input
                          type="checkbox"
                          checked={row.spiral === "Good"}
                          onChange={(e) => updateRow(idx, "spiral", e.target.checked ? "Good" : "")}
                          className="w-4 h-4 accent-accent cursor-pointer"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted flex-1">{filledRows.length} of {entryCount} snaps</span>
              {filledRows.length > 0 && (
                <button
                  onClick={() => {
                    setRows((prev) => prev.map(() => ({ snapper: "", time: "", accuracy: "", laces: "", spiral: "" })));
                    setSnapMarkers([]);
                  }}
                  className="text-xs py-1.5 px-3 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 transition-all"
                >
                  Clear All
                </button>
              )}
              <button
                onClick={handleSaveToDraft}
                disabled={filledRows.length === 0}
                className={clsx("btn-primary text-xs py-1.5 px-4", committed && "bg-make/90")}
              >
                {committed ? "✓ Saved!" : "Save to Snapping Log"}
              </button>
            </div>
          </div>

          {/* Right: Strike zone */}
          <div className="lg:w-[45%] p-4 space-y-2">
            {snapType === "PUNT" ? (
              <PunterStrikeZone markers={snapMarkers} onSnap={handleSnapClick} nextNum={nextSnapNum} chartMode={chartMode} missMode={missMode} editable />
            ) : (
              <HolderStrikeZone markers={snapMarkers as ShortSnapMarker[]} onSnap={(m) => handleSnapClick({ ...m, zoneCell: undefined, missCell: undefined })} nextNum={nextSnapNum} />
            )}
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
