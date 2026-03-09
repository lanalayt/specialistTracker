"use client";

import { useState, useCallback, useEffect } from "react";
import { usePunt } from "@/lib/puntContext";
import { StatCard } from "@/components/ui/StatCard";
import { PuntSessionLog } from "@/components/ui/PuntSessionLog";
import { PuntSessionSummary } from "@/components/ui/PuntSessionSummary";
import { PuntFieldStrip } from "@/components/ui/PuntFieldStrip";
import type { PuntEntry, PuntType, PuntHash } from "@/types";
import { PUNT_TYPES, PUNT_HASHES } from "@/types";
import clsx from "clsx";

const INIT_ROWS = 12;
const SESSION_STORAGE_KEY = "puntSessionDraft";

// ── Table row (planning phase) ────────────────────────────────
interface LogRow {
  athlete: string;
  type: string;
  hash: string;
  yards: string;
  hangTime: string;
  opTime: string;
  directionalAccuracy: string;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedPunts: { athlete: string; type: PuntType; hash: PuntHash }[];
  plannedRowIndices: number[];
  currentPuntIdx: number;
  sessionPunts: PuntEntry[];
}

const emptyRow = (): LogRow => ({
  athlete: "",
  type: "",
  hash: "",
  yards: "",
  hangTime: "",
  opTime: "",
  directionalAccuracy: "",
});

function loadDraft(): SessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveDraft(draft: SessionDraft) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(draft));
}

const TYPE_LABELS: Record<PuntType, string> = {
  RED: "Red",
  BLUE: "Blue",
  POOCH_BLUE: "P-Blue",
  POOCH_RED: "P-Red",
  BROWN: "Brown",
};

const POS_LABELS: Record<PuntHash, string> = {
  LH: "LH",
  LM: "LM",
  M: "M",
  RM: "RM",
  RH: "RH",
};

const DA_OPTIONS = [
  { value: "1", label: "1.0 ✓" },
  { value: "0.5", label: "0.5" },
  { value: "0", label: "0 ★" },
];

export default function PuntingSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice, resetAll } =
    usePunt();

  // ── Initialize all state from localStorage ──────────────────
  const [draft] = useState<SessionDraft>(() => {
    const saved = loadDraft();
    return saved ?? {
      rows: Array.from({ length: INIT_ROWS }, emptyRow),
      manualEntry: false,
      sessionActive: false,
      plannedPunts: [],
      plannedRowIndices: [],
      currentPuntIdx: 0,
      sessionPunts: [],
    };
  });

  const [rows, setRows] = useState<LogRow[]>(draft.rows);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [manualEntry, setManualEntry] = useState(draft.manualEntry);
  const [sessionActive, setSessionActive] = useState(draft.sessionActive);
  const [plannedPunts, setPlannedPunts] = useState<
    { athlete: string; type: PuntType; hash: PuntHash }[]
  >(draft.plannedPunts);
  const [plannedRowIndices, setPlannedRowIndices] = useState<number[]>(draft.plannedRowIndices ?? []);
  const [currentPuntIdx, setCurrentPuntIdx] = useState(draft.currentPuntIdx);
  const [sessionPunts, setSessionPunts] = useState<PuntEntry[]>(draft.sessionPunts);
  const [pendingPunts, setPendingPunts] = useState<PuntEntry[] | null>(null);
  const [showReset, setShowReset] = useState(false);

  // Session card state
  const [yards, setYards] = useState("");
  const [hangTime, setHangTime] = useState("");
  const [opTime, setOpTime] = useState("");
  const [directionalAccuracy, setDirectionalAccuracy] = useState<0 | 0.5 | 1>(1);

  // Persist draft on every relevant state change
  useEffect(() => {
    saveDraft({
      rows,
      manualEntry,
      sessionActive,
      plannedPunts,
      plannedRowIndices,
      currentPuntIdx,
      sessionPunts,
    });
  }, [rows, manualEntry, sessionActive, plannedPunts, plannedRowIndices, currentPuntIdx, sessionPunts]);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        totalYards: acc.totalYards + s.overall.totalYards,
        totalHang: acc.totalHang + s.overall.totalHang,
        long: Math.max(acc.long, s.overall.long),
      };
    },
    { att: 0, totalYards: 0, totalHang: 0, long: 0 }
  );

  const avgYards =
    totals.att > 0 ? (totals.totalYards / totals.att).toFixed(1) : "—";
  const avgHang =
    totals.att > 0 ? (totals.totalHang / totals.att).toFixed(2) : "—";

  // ── Table helpers ────────────────────────────────────────────
  const updateRow = useCallback(
    (idx: number, field: keyof LogRow, value: string) => {
      setRows((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: value };
        return next;
      });
      setErrorRows((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    },
    []
  );

  const clearRow = useCallback((idx: number) => {
    setRows((prev) => {
      const next = [...prev];
      next[idx] = emptyRow();
      return next;
    });
    setErrorRows((prev) => {
      const next = new Set(prev);
      next.delete(idx);
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const planningFields = (r: LogRow) => r.athlete || r.type || r.hash;
  const allFields = (r: LogRow) =>
    r.athlete || r.type || r.hash || r.yards || r.hangTime || r.opTime || r.directionalAccuracy;

  const filledRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (manualEntry ? allFields(r) : planningFields(r)));
  const filledCount = filledRows.length;

  // ── Determine which filled rows are locked (have logged results) ──
  const isContinuing = sessionPunts.length > 0 && !sessionActive;
  const getFilledRowIndices = () => rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => planningFields(r))
    .map(({ i }) => i);

  const filledIndices = getFilledRowIndices();
  const lockedRowSet = new Set(
    isContinuing ? filledIndices.slice(0, sessionPunts.length) : []
  );

  // ── Start / Continue Session ────────────────────────────────
  const handleStartOrContinueSession = () => {
    const filled = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => planningFields(r));

    if (filled.length === 0) return;

    const errors = new Set<number>();
    filled.forEach(({ r, i }) => {
      if (!r.athlete || !r.type || !r.hash) errors.add(i);
    });

    if (errors.size > 0) {
      setErrorRows(errors);
      return;
    }

    setErrorRows(new Set());

    const planned = filled.map(({ r }) => ({
      athlete: r.athlete,
      type: r.type as PuntType,
      hash: r.hash as PuntHash,
    }));

    setPlannedPunts(planned);
    setPlannedRowIndices(filled.map(({ i }) => i));

    if (isContinuing) {
      setCurrentPuntIdx(sessionPunts.length);
    } else {
      setCurrentPuntIdx(0);
      setSessionPunts([]);
    }

    setYards("");
    setHangTime("");
    setOpTime("");
    setDirectionalAccuracy(1);
    setSessionActive(true);
  };

  // ── Unlock a locked row (remove its logged result and all after) ──
  const handleUnlockRow = (filledIdx: number) => {
    setSessionPunts((prev) => prev.slice(0, filledIdx));
  };

  // ── Manual Entry: commit directly from table ─────────────────
  const handleManualCommit = () => {
    const filled = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => allFields(r));

    if (filled.length === 0) return;

    const errors = new Set<number>();
    filled.forEach(({ r, i }) => {
      const hasAll =
        r.athlete && r.type && r.hash && r.yards && r.hangTime && r.opTime && r.directionalAccuracy !== "";
      if (!hasAll) errors.add(i);
    });

    if (errors.size > 0) {
      setErrorRows(errors);
      return;
    }

    setErrorRows(new Set());

    const punts: PuntEntry[] = filled.map(({ r }) => ({
      athleteId: r.athlete,
      athlete: r.athlete,
      type: r.type as PuntType,
      hash: r.hash as PuntHash,
      yards: parseInt(r.yards) || 0,
      hangTime: parseFloat(r.hangTime) || 0,
      opTime: parseFloat(r.opTime) || 0,
      landingZones: [],
      directionalAccuracy: parseFloat(r.directionalAccuracy) as 0 | 0.5 | 1,
    }));

    setPendingPunts(punts);
  };

  // ── Editing and session helpers ────────────────────────────────
  const [editingPuntIdx, setEditingPuntIdx] = useState<number | null>(null);
  const [showAthleteDropdown, setShowAthleteDropdown] = useState(false);

  const currentPlan = plannedPunts[currentPuntIdx];

  const updateCurrentPlan = (field: "athlete" | "type" | "hash", value: string) => {
    setPlannedPunts((prev) => {
      const next = [...prev];
      next[currentPuntIdx] = { ...next[currentPuntIdx], [field]: value };
      return next;
    });
    // Sync back to the planning table row
    const rowIdx = plannedRowIndices[currentPuntIdx];
    if (rowIdx != null) {
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = { ...next[rowIdx], [field]: String(value) };
        return next;
      });
    }
  };

  // ── Session card: log current punt ───────────────────────────
  const handleLogPunt = () => {
    if (!yards || !hangTime || !opTime) return;
    const plan = plannedPunts[currentPuntIdx];
    const punt: PuntEntry = {
      athleteId: plan.athlete,
      athlete: plan.athlete,
      type: plan.type,
      hash: plan.hash,
      yards: parseInt(yards) || 0,
      hangTime: parseFloat(hangTime) || 0,
      opTime: parseFloat(opTime) || 0,
      landingZones: [],
      directionalAccuracy,
    };

    if (editingPuntIdx !== null) {
      // Replace the existing punt at the edited index
      setSessionPunts((prev) => {
        const next = [...prev];
        next[editingPuntIdx] = punt;
        return next;
      });
      setEditingPuntIdx(null);
      // Jump back to the next unlogged punt
      const nextUnlogged = sessionPunts.length;
      setCurrentPuntIdx(Math.min(nextUnlogged, plannedPunts.length - 1));
    } else {
      const newPunts = [...sessionPunts, punt];
      setSessionPunts(newPunts);
      if (currentPuntIdx + 1 < plannedPunts.length) {
        setCurrentPuntIdx(currentPuntIdx + 1);
      }
    }

    setYards("");
    setHangTime("");
    setOpTime("");
    setDirectionalAccuracy(1);
    setShowAthleteDropdown(false);
  };

  const allPuntsLogged = plannedPunts.length > 0 && sessionPunts.length === plannedPunts.length;
  const isEditing = editingPuntIdx !== null;
  const showEntryCard = (!allPuntsLogged || isEditing) && plannedPunts[currentPuntIdx];

  const handleDeletePunt = (idx: number) => {
    setSessionPunts((prev) => prev.filter((_, i) => i !== idx));
    if (sessionPunts.length - 1 < plannedPunts.length) {
      setCurrentPuntIdx(Math.min(sessionPunts.length - 1, plannedPunts.length - 1));
    }
  };

  const handleCommitReady = () => {
    if (sessionPunts.length === 0) return;
    setPendingPunts(sessionPunts);
  };

  const handleConfirmCommit = () => {
    if (!pendingPunts) return;
    commitPractice(pendingPunts);
    setSessionPunts([]);
    setPendingPunts(null);
    setSessionActive(false);
    setManualEntry(false);
    setPlannedPunts([]);
    setPlannedRowIndices([]);
    setCurrentPuntIdx(0);
  };

  const handleBackToLog = () => {
    setSessionActive(false);
  };

  const handleUndo = () => {
    const ok = undoLastCommit();
    if (!ok) alert("Nothing to undo");
  };

  const handleReset = () => {
    if (!showReset) {
      setShowReset(true);
      return;
    }
    resetAll();
    setSessionPunts([]);
    setPlannedPunts([]);
    setPlannedRowIndices([]);
    setCurrentPuntIdx(0);
    setShowReset(false);
  };

  const clearLog = () => {
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setErrorRows(new Set());
    setSessionPunts([]);
    setPlannedPunts([]);
    setPlannedRowIndices([]);
    setCurrentPuntIdx(0);
  };

  // ════════════════════════════════════════════════════════════
  //  SESSION MODE — step-through card view
  // ════════════════════════════════════════════════════════════
  if (sessionActive) {
    return (
      <>
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
          {/* Left: Entry card + Session log */}
          <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
            <div className="overflow-y-auto border-b border-border">
              <div className="p-4 space-y-4">
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                      {isEditing
                        ? `Editing Punt #${editingPuntIdx + 1}`
                        : allPuntsLogged
                          ? "All Punts Logged"
                          : "Log Result"}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleBackToLog}
                        className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-slate-300 hover:bg-surface-2 font-semibold transition-all"
                      >
                        ← Back to Log
                      </button>
                    </div>
                  </div>
                  {/* Punt indicator circles */}
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const ATHLETE_HEX = [
                        "#06b6d4", "#f59e0b", "#10b981", "#f43f5e",
                        "#8b5cf6", "#ec4899", "#3b82f6", "#f97316",
                      ];
                      const uniqueAthletes = [...new Set(plannedPunts.map((p) => p.athlete))];
                      const colorMap: Record<string, string> = {};
                      uniqueAthletes.forEach((a, i) => {
                        colorMap[a] = ATHLETE_HEX[i % ATHLETE_HEX.length];
                      });
                      return plannedPunts.map((p, i) => {
                        const isCurrent = i === currentPuntIdx && !allPuntsLogged;
                        const isDone = i < sessionPunts.length;
                        const hex = colorMap[p.athlete];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setCurrentPuntIdx(i);
                              setShowAthleteDropdown(false);
                              if (i < sessionPunts.length) {
                                // Pre-fill with logged data
                                const logged = sessionPunts[i];
                                setYards(String(logged.yards));
                                setHangTime(String(logged.hangTime));
                                setOpTime(String(logged.opTime));
                                setDirectionalAccuracy(logged.directionalAccuracy);
                                setEditingPuntIdx(i);
                              } else {
                                setYards("");
                                setHangTime("");
                                setOpTime("");
                                setDirectionalAccuracy(1);
                                setEditingPuntIdx(null);
                              }
                            }}
                            className={clsx(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer",
                              isCurrent && "ring-2 ring-white ring-offset-1 ring-offset-[var(--bg)]"
                            )}
                            style={{
                              backgroundColor: isDone || isCurrent ? hex : `${hex}33`,
                              color: isDone || isCurrent ? "#0f172a" : "#94a3b8",
                            }}
                          >
                            {i + 1}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                {showEntryCard && currentPlan && (
                  <>
                    {/* Editable: Athlete */}
                    <div>
                      <p className="label">Athlete</p>
                      <div className="relative inline-block">
                        <button
                          onClick={() => setShowAthleteDropdown((v) => !v)}
                          className="px-3 py-1.5 rounded-input text-sm font-bold bg-accent text-slate-900 hover:bg-accent/80 transition-colors"
                        >
                          {currentPlan.athlete} ▾
                        </button>
                        {showAthleteDropdown && (
                          <div className="absolute top-full left-0 mt-1 z-20 bg-surface-2 border border-border rounded-input shadow-lg min-w-[120px]">
                            {athletes.map((a) => (
                              <button
                                key={a}
                                onClick={() => {
                                  updateCurrentPlan("athlete", a);
                                  setShowAthleteDropdown(false);
                                }}
                                className={clsx(
                                  "w-full text-left px-3 py-2 text-sm font-medium hover:bg-surface transition-colors",
                                  a === currentPlan.athlete ? "text-accent" : "text-slate-300"
                                )}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Editable: Type + Position */}
                    <div className="flex gap-4 items-start">
                      <div className="shrink-0">
                        <p className="label">Type</p>
                        <div className="flex gap-1.5">
                          {PUNT_TYPES.map((t) => (
                            <button
                              key={t}
                              onClick={() => updateCurrentPlan("type", t)}
                              className={clsx(
                                "px-3 py-2 rounded-input text-xs font-semibold text-center transition-all",
                                currentPlan.type === t
                                  ? "bg-accent/20 text-accent border border-accent/50"
                                  : "bg-surface-2 text-muted border border-border hover:text-slate-300"
                              )}
                            >
                              {TYPE_LABELS[t]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <p className="label">Position</p>
                        <div className="flex gap-1.5">
                          {PUNT_HASHES.map((h) => (
                            <button
                              key={h}
                              onClick={() => updateCurrentPlan("hash", h)}
                              className={clsx(
                                "w-10 py-2 rounded-input text-xs font-semibold text-center transition-all",
                                currentPlan.hash === h
                                  ? "bg-accent/20 text-accent border border-accent/50"
                                  : "bg-surface-2 text-muted border border-border hover:text-slate-300"
                              )}
                            >
                              {POS_LABELS[h]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Yards + Hang Time + Opp Time */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="label">Yards</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="number"
                          min={0}
                          max={99}
                          placeholder="yds"
                          value={yards}
                          onChange={(e) => setYards(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="label">Hang Time (s)</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="number"
                          step="0.01"
                          min={0}
                          max={9}
                          placeholder="sec"
                          value={hangTime}
                          onChange={(e) => setHangTime(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="label">Opp Time (s)</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="number"
                          step="0.01"
                          min={0}
                          max={9}
                          placeholder="sec"
                          value={opTime}
                          onChange={(e) => setOpTime(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Directional Accuracy */}
                    <div>
                      <p className="label">Directional Accuracy</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => setDirectionalAccuracy(1)}
                          className={clsx(
                            "py-3 rounded-input text-xs font-bold border transition-all",
                            directionalAccuracy === 1
                              ? "bg-make/20 text-make border-make/50"
                              : "bg-surface-2 text-muted border-border hover:text-slate-300"
                          )}
                        >
                          1.0 ✓
                        </button>
                        <button
                          onClick={() => setDirectionalAccuracy(0.5)}
                          className={clsx(
                            "py-3 rounded-input text-xs font-bold border transition-all",
                            directionalAccuracy === 0.5
                              ? "bg-warn/20 text-warn border-warn/50"
                              : "bg-surface-2 text-muted border-border hover:text-slate-300"
                          )}
                        >
                          0.5
                        </button>
                        <button
                          onClick={() => setDirectionalAccuracy(0)}
                          className={clsx(
                            "py-3 rounded-input text-xs font-bold border transition-all",
                            directionalAccuracy === 0
                              ? "bg-miss/20 text-miss border-miss/50"
                              : "bg-surface-2 text-muted border-border hover:text-slate-300"
                          )}
                        >
                          0 ★
                        </button>
                      </div>
                    </div>

                    {/* Log button */}
                    <button
                      onClick={handleLogPunt}
                      disabled={!yards || !hangTime || !opTime}
                      className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      LOG PUNT
                    </button>
                  </>
                )}

                {allPuntsLogged && !isEditing && (
                  <div className="text-center py-6 space-y-3">
                    <div className="text-3xl">✅</div>
                    <p className="text-sm text-slate-200 font-medium">
                      All {plannedPunts.length} punts logged!
                    </p>
                    <p className="text-xs text-muted">
                      Review below, then commit the session.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Session log header */}
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Session Log
                {sessionPunts.length > 0 && (
                  <span className="text-accent ml-2">
                    ({sessionPunts.length})
                  </span>
                )}
              </p>
            </div>

            {/* Session log */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <PuntSessionLog punts={sessionPunts} onDelete={handleDeletePunt} />
            </div>

            {/* Footer */}
            <div className="border-t border-border p-3 flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex gap-2">
                {canUndo && (
                  <button
                    onClick={handleUndo}
                    className="btn-ghost text-xs py-1.5 px-3"
                  >
                    ↩ Undo
                  </button>
                )}
              </div>
              <div className="flex-1" />
              <button
                onClick={handleCommitReady}
                disabled={sessionPunts.length === 0}
                className="btn-primary text-xs py-2 px-5"
              >
                Commit Session
                {sessionPunts.length > 0 && ` (${sessionPunts.length})`}
              </button>
            </div>
          </div>

          {/* Right: Live stats */}
          <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Avg Yards" value={avgYards} accent glow />
              <StatCard
                label="Avg Hang"
                value={totals.att > 0 ? `${avgHang}s` : "—"}
              />
              <StatCard
                label="Long Punt"
                value={totals.long > 0 ? `${totals.long} yd` : "—"}
              />
            </div>
            <PuntFieldStrip punts={sessionPunts} />
          </div>
        </main>

        {pendingPunts && (
          <PuntSessionSummary
            punts={pendingPunts}
            label={new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "numeric",
              day: "numeric",
            })}
            onConfirm={handleConfirmCommit}
            onCancel={() => setPendingPunts(null)}
          />
        )}
      </>
    );
  }

  // ════════════════════════════════════════════════════════════
  //  PLANNING MODE — table view
  // ════════════════════════════════════════════════════════════
  return (
    <>
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Practice Log Table */}
        <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              {!manualEntry && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}
              {manualEntry ? "Practice Log" : "Live Practice Log"}
              {isContinuing && (
                <span className="text-accent text-xs font-normal">
                  ({sessionPunts.length} logged)
                </span>
              )}
            </h2>
            <button
              onClick={addRow}
              className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-slate-300 hover:bg-surface-2 font-semibold transition-all"
            >
              + Row
            </button>
          </div>

          {/* Scrollable table */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="sticky top-0 z-10">
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border">
                    #
                  </th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center border-b border-border">
                    Athlete
                  </th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">
                    Type
                  </th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                    Pos
                  </th>
                  {manualEntry && (
                    <>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        Yards
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        HT
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        OT
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        DA
                      </th>
                    </>
                  )}
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isLocked = lockedRowSet.has(idx);
                  const filledIdx = filledIndices.indexOf(idx);
                  const loggedPunt = isLocked && filledIdx >= 0 ? sessionPunts[filledIdx] : null;

                  return (
                    <tr
                      key={idx}
                      className={clsx(
                        "border-b border-border/30 transition-colors",
                        errorRows.has(idx) && "bg-miss/10",
                        isLocked && "bg-make/5"
                      )}
                    >
                      <td className="text-center text-muted py-1 px-1">
                        {idx + 1}
                      </td>
                      <td className="py-1 px-1">
                        {isLocked ? (
                          <span className="text-xs text-slate-400 px-1">{row.athlete}</span>
                        ) : (
                          <select
                            value={row.athlete}
                            onChange={(e) => updateRow(idx, "athlete", e.target.value)}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
                          >
                            <option value="">—</option>
                            {athletes.map((a) => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {isLocked ? (
                          <span className="text-xs text-slate-400 text-center block">{TYPE_LABELS[row.type as PuntType] ?? row.type}</span>
                        ) : (
                          <select
                            value={row.type}
                            onChange={(e) => updateRow(idx, "type", e.target.value)}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
                          >
                            <option value="">—</option>
                            {PUNT_TYPES.map((t) => (
                              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {isLocked ? (
                          <span className="text-xs text-slate-400 text-center block">{POS_LABELS[row.hash as PuntHash] ?? row.hash}</span>
                        ) : (
                          <select
                            value={row.hash}
                            onChange={(e) => updateRow(idx, "hash", e.target.value)}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
                          >
                            <option value="">—</option>
                            {PUNT_HASHES.map((h) => (
                              <option key={h} value={h}>{POS_LABELS[h]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      {manualEntry && (
                        <>
                          <td className="py-1 px-1">
                            <input
                              type="number" min={0} max={99} placeholder="yds"
                              value={row.yards}
                              onChange={(e) => updateRow(idx, "yards", e.target.value)}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="number" min={0} max={9} step="0.01" placeholder="sec"
                              value={row.hangTime}
                              onChange={(e) => updateRow(idx, "hangTime", e.target.value)}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="number" min={0} max={9} step="0.01" placeholder="sec"
                              value={row.opTime}
                              onChange={(e) => updateRow(idx, "opTime", e.target.value)}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <select
                              value={row.directionalAccuracy}
                              onChange={(e) => updateRow(idx, "directionalAccuracy", e.target.value)}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60"
                            >
                              <option value="">—</option>
                              {DA_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                        </>
                      )}
                      <td className="py-1 px-1 text-center">
                        {isLocked ? (
                          <div className="flex items-center gap-0.5 justify-center">
                            <button
                              onClick={() => {
                                // Jump into session and edit just this one punt
                                const filled = rows
                                  .map((r, ri) => ({ r, i: ri }))
                                  .filter(({ r }) => r.athlete || r.type || r.hash);
                                const planned = filled.map(({ r }) => ({
                                  athlete: r.athlete,
                                  type: r.type as PuntType,
                                  hash: r.hash as PuntHash,
                                }));
                                setPlannedPunts(planned);
                                setPlannedRowIndices(filled.map(({ i: ri }) => ri));
                                setCurrentPuntIdx(filledIdx);
                                setEditingPuntIdx(filledIdx);
                                // Pre-fill with logged data
                                const logged = sessionPunts[filledIdx];
                                if (logged) {
                                  setYards(String(logged.yards));
                                  setHangTime(String(logged.hangTime));
                                  setOpTime(String(logged.opTime));
                                  setDirectionalAccuracy(logged.directionalAccuracy);
                                } else {
                                  setYards("");
                                  setHangTime("");
                                  setOpTime("");
                                  setDirectionalAccuracy(1);
                                }
                                setSessionActive(true);
                              }}
                              className="text-accent/60 hover:text-accent transition-colors text-[10px] leading-none px-1"
                              title="Edit this punt's result"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleUnlockRow(filledIdx)}
                              className="text-make/60 hover:text-warn transition-colors text-[10px] leading-none px-1"
                              title="Unlock (removes this result and all after it)"
                            >
                              🔒
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => clearRow(idx)}
                            className="text-border hover:text-miss transition-colors text-sm leading-none px-1"
                            title="Clear row"
                          >
                            ×
                          </button>
                        )}
                      </td>
                      {/* Show logged result indicator on locked rows */}
                      {isLocked && loggedPunt && !manualEntry && (
                        <td className="py-1 px-0.5">
                          <span className="text-[10px] text-slate-400">
                            {loggedPunt.yards}yd / {loggedPunt.hangTime}s
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="border-t border-border p-3 flex items-center gap-2 shrink-0 flex-wrap">
            <span className="text-xs text-muted flex-1">
              {filledCount === 0
                ? "0 punts entered"
                : `${filledCount} punt${filledCount !== 1 ? "s" : ""} entered`}
            </span>
            <div className="flex gap-2">
              {canUndo && (
                <button
                  onClick={handleUndo}
                  className="btn-ghost text-xs py-1.5 px-3"
                >
                  ↩ Undo
                </button>
              )}
              <button
                onClick={() => clearLog()}
                className="text-xs py-1.5 px-3 rounded-input border border-border text-muted hover:text-miss hover:border-miss/40 transition-all"
              >
                Clear Log
              </button>
            </div>
            {!isContinuing && (
              <button
                onClick={() => setManualEntry((v) => !v)}
                className={clsx(
                  "text-xs py-2 px-5 rounded-input border font-semibold transition-all",
                  manualEntry
                    ? "bg-accent/20 text-accent border-accent/50"
                    : "border-border text-muted hover:text-slate-300 hover:bg-surface-2"
                )}
              >
                {manualEntry ? "Manual Entry ●" : "Manual Entry"}
              </button>
            )}
            {manualEntry && !isContinuing ? (
              <button
                onClick={handleManualCommit}
                disabled={filledCount === 0}
                className="btn-primary text-xs py-2 px-5"
              >
                Commit Practice{filledCount > 0 ? ` (${filledCount})` : ""}
              </button>
            ) : (
              <button
                onClick={handleStartOrContinueSession}
                disabled={filledCount === 0}
                className="btn-primary text-xs py-2 px-5"
              >
                {isContinuing
                  ? `Continue Session (${filledCount - sessionPunts.length} remaining)`
                  : `Start Session${filledCount > 0 ? ` (${filledCount})` : ""}`}
              </button>
            )}
          </div>
        </div>

        {/* Right: Season stats */}
        <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Avg Yards" value={avgYards} accent glow />
            <StatCard
              label="Avg Hang"
              value={totals.att > 0 ? `${avgHang}s` : "—"}
            />
            <StatCard
              label="Long Punt"
              value={totals.long > 0 ? `${totals.long} yd` : "—"}
            />
          </div>
        </div>
      </main>

      {pendingPunts && (
        <PuntSessionSummary
          punts={pendingPunts}
          label={new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "numeric",
            day: "numeric",
          })}
          onConfirm={handleConfirmCommit}
          onCancel={() => setPendingPunts(null)}
        />
      )}
    </>
  );
}
