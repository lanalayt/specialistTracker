"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import { StatCard } from "@/components/ui/StatCard";
import { ZoneBarChart } from "@/components/ui/Chart";
import { KickoffSessionLog } from "@/components/ui/KickoffSessionLog";
import { KickoffSessionSummary } from "@/components/ui/KickoffSessionSummary";
import type { KickoffEntry, KickoffType, KickoffDirection } from "@/types";
import { KICKOFF_TYPES, KICKOFF_DIRECTIONS, KICKOFF_ZONES } from "@/types";
import clsx from "clsx";
import { useDragReorder } from "@/lib/useDragReorder";
import { useAuth } from "@/lib/auth";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import { useTeamDraftSync } from "@/lib/useTeamDraftSync";

const INIT_ROWS = 12;
const MAX_SCORE = 4;

// Outlier detection for kickoff values
function checkKickoffOutliers(distance: number, hangTime: number): string[] {
  const warnings: string[] = [];
  if (distance > 0 && (distance < 1 || distance > 90)) warnings.push(`Distance ${distance} yd seems unusual (expected 1–90)`);
  if (hangTime > 0 && (hangTime < 0.5 || hangTime > 5.0)) warnings.push(`Hang Time ${hangTime}s seems unusual (expected 0.5–5.0)`);
  return warnings;
}
const SESSION_STORAGE_KEY = "kickoffSessionDraft";

interface LogRow {
  athlete: string;
  type: string;
  distance: string;
  hangTime: string;
  direction: string;
  score: string;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedKicks: { athlete: string; type: KickoffType }[];
  plannedRowIndices: number[];
  currentKickIdx: number;
  sessionKicks: KickoffEntry[];
}

const emptyRow = (): LogRow => ({
  athlete: "",
  type: "",
  distance: "",
  hangTime: "",
  direction: "",
  score: "",
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
  const tid = getTeamId();
  if (tid && tid !== "local-dev") {
    teamSet(tid, "kickoff_session_draft", draft);
  }
}

const TYPE_LABELS: Record<KickoffType, string> = {
  REG: "Regular",
  ONSIDE: "Onside",
  SQUIB: "Squib",
  FREE: "Free",
};

const DIR_LABELS: Record<KickoffDirection, string> = {
  left: "←",
  middle: "↑",
  right: "→",
};

export default function KickoffSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice } =
    useKickoff();
  const { isAthlete } = useAuth();

  // ── Initialize all state from localStorage ──────────────────
  const [draft] = useState<SessionDraft>(() => {
    const saved = loadDraft();
    return saved ?? {
      rows: Array.from({ length: INIT_ROWS }, emptyRow),
      manualEntry: false,
      sessionActive: false,
      plannedKicks: [],
      plannedRowIndices: [],
      currentKickIdx: 0,
      sessionKicks: [],
    };
  });

  const [rows, setRows] = useState<LogRow[]>(draft.rows);
  const [errorRows, setErrorRows] = useState<Set<number>>(new Set());
  const [manualEntry, setManualEntry] = useState(draft.manualEntry);
  const [sessionActive, setSessionActive] = useState(draft.sessionActive);
  const [plannedKicks, setPlannedKicks] = useState<
    { athlete: string; type: KickoffType }[]
  >(draft.plannedKicks);
  const [plannedRowIndices, setPlannedRowIndices] = useState<number[]>(draft.plannedRowIndices ?? []);
  const [currentKickIdx, setCurrentKickIdx] = useState(draft.currentKickIdx);
  const [sessionKicks, setSessionKicks] = useState<KickoffEntry[]>(draft.sessionKicks);
  const [pendingKicks, setPendingKicks] = useState<KickoffEntry[] | null>(null);
  const [showReset, setShowReset] = useState(false);
  const drag = useDragReorder(rows, setRows);
  const [weather, setWeather] = useState("");
  const [weatherLocked, setWeatherLocked] = useState(false);

  // Session card state
  const [distance, setDistance] = useState("");
  const [hangTime, setHangTime] = useState("");
  const [direction, setDirection] = useState<KickoffDirection>("middle");
  const [score, setScore] = useState<number>(0);

  // Guard: skip sync callbacks that arrive shortly after a local save
  const lastLocalSave = useRef(0);

  // Poll for draft changes from other devices
  useTeamDraftSync<SessionDraft>("kickoff_session_draft", (cloudDraft) => {
    if (Date.now() - lastLocalSave.current < 8000) return;
    if (cloudDraft && cloudDraft.rows) {
      setRows(cloudDraft.rows);
      setManualEntry(cloudDraft.manualEntry);
      setSessionActive(cloudDraft.sessionActive);
      setPlannedKicks(cloudDraft.plannedKicks ?? []);
      setPlannedRowIndices(cloudDraft.plannedRowIndices ?? []);
      setCurrentKickIdx(cloudDraft.currentKickIdx ?? 0);
      setSessionKicks(cloudDraft.sessionKicks ?? []);
    }
  });

  // Persist draft on every relevant state change
  useEffect(() => {
    lastLocalSave.current = Date.now();
    saveDraft({
      rows,
      manualEntry,
      sessionActive,
      plannedKicks,
      plannedRowIndices,
      currentKickIdx,
      sessionKicks,
    });
  }, [rows, manualEntry, sessionActive, plannedKicks, plannedRowIndices, currentKickIdx, sessionKicks]);

  // Load draft from cloud if local is empty
  useEffect(() => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<SessionDraft>(tid, "kickoff_session_draft").then((cloudDraft) => {
        if (cloudDraft && cloudDraft.rows) {
          const localDraft = loadDraft();
          const localHasData = localDraft?.rows?.some((r: LogRow) => r.athlete || r.type || r.distance);
          if (!localHasData || cloudDraft.sessionActive) {
            setRows(cloudDraft.rows);
            setManualEntry(cloudDraft.manualEntry);
            setSessionActive(cloudDraft.sessionActive);
            setPlannedKicks(cloudDraft.plannedKicks ?? []);
            setPlannedRowIndices(cloudDraft.plannedRowIndices ?? []);
            setCurrentKickIdx(cloudDraft.currentKickIdx ?? 0);
            setSessionKicks(cloudDraft.sessionKicks ?? []);
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        touchbacks: acc.touchbacks + s.overall.touchbacks,
        oob: acc.oob + s.overall.oob,
        totalDist: acc.totalDist + s.overall.totalDist,
        totalHang: acc.totalHang + s.overall.totalHang,
      };
    },
    { att: 0, touchbacks: 0, oob: 0, totalDist: 0, totalHang: 0 }
  );

  const tbRate = totals.att > 0 ? `${Math.round((totals.touchbacks / totals.att) * 100)}%` : "—";
  const avgDist = totals.att > 0 ? (totals.totalDist / totals.att).toFixed(1) : "—";
  const avgHang = totals.att > 0 ? (totals.totalHang / totals.att).toFixed(2) : "—";

  const zoneData = KICKOFF_ZONES.map((z) => ({
    zone: z === "TB" ? "TB" : `Zone ${z}`,
    count: athletes.reduce((acc, a) => acc + (stats[a]?.byZone[z] ?? 0), 0),
  }));

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

  const [deletedRowStack, setDeletedRowStack] = useState<{ idx: number; row: LogRow }[]>([]);

  const deleteRow = useCallback((idx: number) => {
    setRows((prev) => {
      setDeletedRowStack((stack) => [...stack, { idx, row: prev[idx] }]);
      return prev.filter((_, i) => i !== idx);
    });
    setErrorRows((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  }, []);

  const undoDeleteRow = useCallback(() => {
    setDeletedRowStack((stack) => {
      if (stack.length === 0) return stack;
      const last = stack[stack.length - 1];
      setRows((prev) => {
        const next = [...prev];
        next.splice(last.idx, 0, last.row);
        return next;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow()]);
  }, []);

  const planningFields = (r: LogRow) => r.athlete || r.type;
  const allFields = (r: LogRow) =>
    r.athlete || r.type || r.distance || r.hangTime || r.direction || r.score;

  const filledRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => (manualEntry ? allFields(r) : planningFields(r)));
  const filledCount = filledRows.length;

  // ── Determine which filled rows are locked (have logged results) ──
  const isContinuing = sessionKicks.length > 0 && !sessionActive;
  const getFilledRowIndices = () => rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => planningFields(r))
    .map(({ i }) => i);

  const filledIndices = getFilledRowIndices();
  const lockedRowSet = new Set(
    isContinuing ? filledIndices.slice(0, sessionKicks.length) : []
  );

  // ── Start / Continue Session ────────────────────────────────
  const handleStartOrContinueSession = () => {
    const filled = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => planningFields(r));

    if (filled.length === 0) return;

    const errors = new Set<number>();
    filled.forEach(({ r, i }) => {
      if (!r.athlete) errors.add(i);
    });

    if (errors.size > 0) {
      setErrorRows(errors);
      return;
    }

    setErrorRows(new Set());

    const planned = filled.map(({ r }) => ({
      athlete: r.athlete,
      type: r.type as KickoffType,
    }));

    setPlannedKicks(planned);
    setPlannedRowIndices(filled.map(({ i }) => i));

    if (isContinuing) {
      setCurrentKickIdx(sessionKicks.length);
    } else {
      setCurrentKickIdx(0);
      setSessionKicks([]);
    }

    setDistance("");
    setHangTime("");
    setDirection("middle");
    setScore(0);
    setSessionActive(true);
  };

  // ── Unlock a locked row ──
  const handleUnlockRow = (filledIdx: number) => {
    setSessionKicks((prev) => prev.slice(0, filledIdx));
  };

  // ── Manual Entry: commit directly from table ─────────────────
  const handleManualCommit = () => {
    const filled = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => allFields(r));

    if (filled.length === 0) return;

    const errors = new Set<number>();
    filled.forEach(({ r, i }) => {
      if (!r.athlete) errors.add(i);
    });

    if (errors.size > 0) {
      setErrorRows(errors);
      return;
    }

    setErrorRows(new Set());

    const kicks: KickoffEntry[] = filled.map(({ r }) => ({
      athleteId: r.athlete,
      athlete: r.athlete,
      type: r.type as KickoffType,
      distance: parseInt(r.distance) || 0,
      hangTime: parseFloat(r.hangTime) || 0,
      direction: r.direction as KickoffDirection,
      score: parseInt(r.score) || 0,
    }));

    // Outlier check across all kickoffs
    const allWarnings: string[] = [];
    kicks.forEach((k, i) => {
      const w = checkKickoffOutliers(k.distance, k.hangTime);
      if (w.length > 0) allWarnings.push(`Row ${i + 1}: ${w.join(", ")}`);
    });
    if (allWarnings.length > 0 && !window.confirm(`Are you sure?\n\n${allWarnings.join("\n")}`)) return;

    setPendingKicks(kicks);
  };

  // ── Editing and session helpers ────────────────────────────────
  const [editingKickIdx, setEditingKickIdx] = useState<number | null>(null);
  const [showAthleteDropdown, setShowAthleteDropdown] = useState(false);

  const currentPlan = plannedKicks[currentKickIdx];

  const updateCurrentPlan = (field: "athlete" | "type", value: string) => {
    setPlannedKicks((prev) => {
      const next = [...prev];
      next[currentKickIdx] = { ...next[currentKickIdx], [field]: value };
      return next;
    });
    const rowIdx = plannedRowIndices[currentKickIdx];
    if (rowIdx != null) {
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = { ...next[rowIdx], [field]: String(value) };
        return next;
      });
    }
  };

  // ── Session card: log current kick ───────────────────────────
  const handleLogKick = () => {
    // distance and hangTime are optional
    const plan = plannedKicks[currentKickIdx];
    const distVal = parseInt(distance) || 0;
    const htVal = parseFloat(hangTime) || 0;
    const kick: KickoffEntry = {
      athleteId: plan.athlete,
      athlete: plan.athlete,
      type: plan.type,
      distance: distVal,
      hangTime: htVal,
      direction,
      score,
    };

    // Outlier check
    const warnings = checkKickoffOutliers(distVal, htVal);
    if (warnings.length > 0 && !window.confirm(`Are you sure?\n\n${warnings.join("\n")}`)) return;

    if (editingKickIdx !== null) {
      setSessionKicks((prev) => {
        const next = [...prev];
        next[editingKickIdx] = kick;
        return next;
      });
      setEditingKickIdx(null);
      const nextUnlogged = sessionKicks.length;
      setCurrentKickIdx(Math.min(nextUnlogged, plannedKicks.length - 1));
    } else {
      const newKicks = [...sessionKicks, kick];
      setSessionKicks(newKicks);
      if (currentKickIdx + 1 < plannedKicks.length) {
        setCurrentKickIdx(currentKickIdx + 1);
      }
    }

    setDistance("");
    setHangTime("");
    setDirection("middle");
    setScore(0);
    setShowAthleteDropdown(false);
  };

  const allKicksLogged = plannedKicks.length > 0 && sessionKicks.length === plannedKicks.length;
  const isEditing = editingKickIdx !== null;
  const showEntryCard = (!allKicksLogged || isEditing) && plannedKicks[currentKickIdx];

  const handleDeleteKick = (idx: number) => {
    setSessionKicks((prev) => prev.filter((_, i) => i !== idx));
    if (sessionKicks.length - 1 < plannedKicks.length) {
      setCurrentKickIdx(Math.min(sessionKicks.length - 1, plannedKicks.length - 1));
    }
  };

  const handleCommitReady = () => {
    if (sessionKicks.length === 0) return;
    setPendingKicks(sessionKicks);
  };

  const handleConfirmCommit = () => {
    if (!pendingKicks) return;
    commitPractice(pendingKicks, undefined, weather);
    setSessionKicks([]);
    setPendingKicks(null);
    setSessionActive(false);
    setPlannedKicks([]);
    setPlannedRowIndices([]);
    setWeather("");
    setCurrentKickIdx(0);
    // Rows (practice log) are kept — user can clear manually
  };

  const handleBackToLog = () => {
    setSessionActive(false);
  };

  const handleUndo = () => {
    const ok = undoLastCommit();
    if (!ok) alert("Nothing to undo");
  };

  const clearLog = () => {
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setErrorRows(new Set());
    setSessionKicks([]);
    setPlannedKicks([]);
    setPlannedRowIndices([]);
    setCurrentKickIdx(0);
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
                        ? `Editing Kickoff #${editingKickIdx + 1}`
                        : allKicksLogged
                          ? "All Kickoffs Logged"
                          : "Log Result"}
                    </p>
                    <div className="flex items-center gap-2">
                      {/* Next kick preview */}
                      {!allKicksLogged && !isEditing && currentKickIdx + 1 < plannedKicks.length && (
                        <span className="text-[10px] text-muted">
                          Next: {plannedKicks[currentKickIdx + 1].athlete} — {TYPE_LABELS[plannedKicks[currentKickIdx + 1].type]}
                        </span>
                      )}
                      <button
                        onClick={handleBackToLog}
                        className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all"
                      >
                        ← Back to Log
                      </button>
                    </div>
                  </div>
                  {/* Kick indicator circles */}
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const ATHLETE_HEX = [
                        "#06b6d4", "#f59e0b", "#10b981", "#f43f5e",
                        "#8b5cf6", "#ec4899", "#3b82f6", "#f97316",
                      ];
                      const uniqueAthletes = [...new Set(plannedKicks.map((k) => k.athlete))];
                      const colorMap: Record<string, string> = {};
                      uniqueAthletes.forEach((a, i) => {
                        colorMap[a] = ATHLETE_HEX[i % ATHLETE_HEX.length];
                      });
                      return plannedKicks.map((k, i) => {
                        const isCurrent = i === currentKickIdx && !allKicksLogged;
                        const hex = colorMap[k.athlete];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setCurrentKickIdx(i);
                              setShowAthleteDropdown(false);
                              if (i < sessionKicks.length) {
                                const logged = sessionKicks[i];
                                setDistance(String(logged.distance));
                                setHangTime(String(logged.hangTime));
                                setDirection(logged.direction);
                                setScore(logged.score);
                                setEditingKickIdx(i);
                              } else {
                                setDistance("");
                                setHangTime("");
                                setDirection("middle");
                                setScore(0);
                                setEditingKickIdx(null);
                              }
                            }}
                            className="flex flex-col items-center gap-0.5 cursor-pointer transition-all"
                          >
                            <div
                              className={clsx(
                                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                                isCurrent && "ring-2 ring-white ring-offset-1 ring-offset-[var(--bg)]"
                              )}
                              style={{
                                backgroundColor: hex,
                                color: "#0f172a",
                              }}
                            >
                              {i + 1}
                            </div>
                            <span className="text-[8px] font-semibold leading-none" style={{ color: hex }}>
                              {k.athlete}
                            </span>
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

                    {/* Editable: Type */}
                    <div>
                      <p className="label">Type</p>
                      <div className="flex gap-1.5">
                        {KICKOFF_TYPES.map((t) => (
                          <button
                            key={t}
                            onClick={() => updateCurrentPlan("type", t)}
                            className={clsx(
                              "px-3 py-2 rounded-input text-xs font-semibold text-center transition-all",
                              currentPlan.type === t
                                ? "bg-accent/20 text-accent border border-accent/50"
                                : "bg-surface-2 text-muted border border-border hover:text-white"
                            )}
                          >
                            {TYPE_LABELS[t]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Distance + Hang Time */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="label">Distance (yds)</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="yds"
                          value={distance}
                          onChange={(e) => setDistance(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="label">Hang Time (s)</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="text"
                          inputMode="decimal"
                          placeholder="sec"
                          value={hangTime}
                          onChange={(e) => setHangTime(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Direction */}
                    <div>
                      <p className="label">Direction</p>
                      <div className="grid grid-cols-3 gap-2">
                        {KICKOFF_DIRECTIONS.map((d) => (
                          <button
                            key={d}
                            onClick={() => setDirection(d)}
                            className={clsx(
                              "py-3 rounded-input text-xs font-bold border transition-all",
                              direction === d
                                ? "bg-accent/20 text-accent border-accent/50"
                                : "bg-surface-2 text-muted border-border hover:text-white"
                            )}
                          >
                            {DIR_LABELS[d]} {d.charAt(0).toUpperCase() + d.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Score */}
                    <div>
                      <p className="label">Score</p>
                      <div className="flex gap-1.5">
                        {Array.from({ length: MAX_SCORE + 1 }, (_, i) => (
                          <button
                            key={i}
                            onClick={() => setScore(i)}
                            className={clsx(
                              "w-9 h-9 rounded-full text-sm font-bold transition-all",
                              score === i
                                ? "bg-accent text-slate-900 shadow-lg"
                                : "bg-surface-2 text-muted border border-border hover:text-white"
                            )}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Log button */}
                    <button
                      onClick={handleLogKick}
                      disabled={false}
                      className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      LOG KICKOFF
                    </button>
                  </>
                )}

                {allKicksLogged && !isEditing && (
                  <div className="text-center py-6 space-y-3">
                    <div className="text-3xl">✅</div>
                    <p className="text-sm text-slate-200 font-medium">
                      All {plannedKicks.length} kickoffs logged!
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
                {sessionKicks.length > 0 && (
                  <span className="text-accent ml-2">
                    ({sessionKicks.length})
                  </span>
                )}
              </p>
            </div>

            {/* Session log */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <KickoffSessionLog kicks={sessionKicks} onDelete={handleDeleteKick} />
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
                disabled={sessionKicks.length === 0}
                className="btn-primary text-xs py-2 px-5"
              >
                Commit Session
                {sessionKicks.length > 0 && ` (${sessionKicks.length})`}
              </button>
            </div>
          </div>

          {/* Right: Live stats */}
          <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
            {(() => {
              const sAtt = sessionKicks.length;
              const sTB = sessionKicks.filter((k) => k.result === "TB" || k.landingZone === "TB").length;
              const sTBRate = sAtt > 0 ? `${Math.round((sTB / sAtt) * 100)}%` : "—";
              const kicksWithDist = sessionKicks.filter((k) => k.distance > 0);
              const kicksWithHang = sessionKicks.filter((k) => k.hangTime > 0);
              const sAvgDist = kicksWithDist.length > 0 ? (kicksWithDist.reduce((s, k) => s + k.distance, 0) / kicksWithDist.length).toFixed(1) : "—";
              const sAvgHang = kicksWithHang.length > 0 ? (kicksWithHang.reduce((s, k) => s + k.hangTime, 0) / kicksWithHang.length).toFixed(2) : "—";
              const sZoneData = KICKOFF_ZONES.map((z) => ({
                zone: z === "TB" ? "TB" : `Zone ${z}`,
                count: sessionKicks.filter((k) => k.landingZone === z).length,
              }));
              return (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <StatCard label="TB Rate" value={sTBRate} accent glow />
                    <StatCard label="Avg Dist" value={sAtt > 0 ? `${sAvgDist} yd` : "—"} />
                    <StatCard label="Avg Hang" value={sAtt > 0 ? `${sAvgHang}s` : "—"} />
                  </div>
                  <ZoneBarChart data={sZoneData} />
                </>
              );
            })()}
          </div>
        </main>

        {pendingKicks && (
          <KickoffSessionSummary
            kicks={pendingKicks}
            label={new Date().toLocaleDateString("en-US", {
              weekday: "short",
              month: "numeric",
              day: "numeric",
            })}
            onConfirm={handleConfirmCommit}
            onCancel={() => setPendingKicks(null)}
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
          {/* Weather input / display */}
          <div className="px-4 py-2 border-b border-border shrink-0">
            {weatherLocked || isAthlete ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-[10px] text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</p>
                  {weather && <p className="text-xs text-slate-300">{weather}</p>}
                  {!weather && isAthlete && <p className="text-xs text-muted italic">No weather set</p>}
                </div>
                {!isAthlete && (
                  <button
                    onClick={() => setWeatherLocked(false)}
                    className="text-muted hover:text-white transition-colors p-1"
                    title="Edit weather"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                      <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
                <input
                  type="text"
                  value={weather}
                  onChange={(e) => setWeather(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setWeatherLocked(true); } }}
                  placeholder="e.g. 72°F, Sunny, Wind 10mph SW"
                  className="flex-1 bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                  autoFocus={weather === ""}
                />
              </div>
            )}
          </div>
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
                  ({sessionKicks.length} logged)
                </span>
              )}
            </h2>
            {!isAthlete && (
              <button
                onClick={addRow}
                className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all"
              >
                + Row
              </button>
            )}
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
                  {manualEntry && (
                    <>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        Dist
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        HT
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        Dir
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        Score
                      </th>
                    </>
                  )}
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-7 border-b border-border" />
                </tr>
              </thead>
              <tbody
                ref={drag.containerRef}
                onPointerMove={drag.handlePointerMove}
                onPointerUp={drag.handlePointerUp}
              >
                {rows.map((row, idx) => {
                  const isLocked = lockedRowSet.has(idx);
                  const filledIdx = filledIndices.indexOf(idx);
                  const loggedKick = isLocked && filledIdx >= 0 ? sessionKicks[filledIdx] : null;

                  return (
                    <tr
                      key={idx}
                      className={clsx(
                        "border-b border-border/30 transition-colors",
                        errorRows.has(idx) && "bg-miss/10",
                        isLocked && "bg-make/5",
                        drag.dragIdx === idx && "opacity-40",
                        drag.overIdx === idx && drag.dragIdx !== null && drag.dragIdx !== idx && "border-t-2 border-t-accent"
                      )}
                    >
                      <td
                        className="text-center text-muted py-1 px-1 cursor-grab active:cursor-grabbing select-none touch-none"
                        onPointerDown={(e) => drag.handlePointerDown(idx, e)}
                      >
                        {idx + 1}
                      </td>
                      <td className="py-1 px-1">
                        {isLocked ? (
                          <span className="text-xs text-slate-400 px-1">{row.athlete}</span>
                        ) : (
                          <select
                            value={row.athlete}
                            onChange={(e) => updateRow(idx, "athlete", e.target.value)}
                            disabled={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
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
                          <span className="text-xs text-slate-400 text-center block">{TYPE_LABELS[row.type as KickoffType] ?? row.type}</span>
                        ) : (
                          <select
                            value={row.type}
                            onChange={(e) => updateRow(idx, "type", e.target.value)}
                            disabled={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {KICKOFF_TYPES.map((t) => (
                              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      {manualEntry && (
                        <>
                          <td className="py-1 px-1">
                            <input
                              type="text" inputMode="numeric" pattern="[0-9]*" placeholder="yds"
                              value={row.distance}
                              onChange={(e) => updateRow(idx, "distance", e.target.value)}
                              readOnly={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="text" inputMode="decimal" placeholder="sec"
                              value={row.hangTime}
                              onChange={(e) => updateRow(idx, "hangTime", e.target.value)}
                              readOnly={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <select
                              value={row.direction}
                              onChange={(e) => updateRow(idx, "direction", e.target.value)}
                              disabled={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                            >
                              <option value="">—</option>
                              {KICKOFF_DIRECTIONS.map((d) => (
                                <option key={d} value={d}>{DIR_LABELS[d]} {d}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-1 px-1">
                            <select
                              value={row.score}
                              onChange={(e) => updateRow(idx, "score", e.target.value)}
                              disabled={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                            >
                              <option value="">—</option>
                              {Array.from({ length: MAX_SCORE + 1 }, (_, i) => (
                                <option key={i} value={String(i)}>{i}</option>
                              ))}
                            </select>
                          </td>
                        </>
                      )}
                      <td className="py-1 px-1 text-center">
                        {isLocked ? (
                          !isAthlete && (
                            <div className="flex items-center gap-0.5 justify-center">
                              <button
                                onClick={() => {
                                  const filled = rows
                                    .map((r, ri) => ({ r, i: ri }))
                                    .filter(({ r }) => r.athlete || r.type);
                                  const planned = filled.map(({ r }) => ({
                                    athlete: r.athlete,
                                    type: r.type as KickoffType,
                                  }));
                                  setPlannedKicks(planned);
                                  setPlannedRowIndices(filled.map(({ i: ri }) => ri));
                                  setCurrentKickIdx(filledIdx);
                                  setEditingKickIdx(filledIdx);
                                  const logged = sessionKicks[filledIdx];
                                  if (logged) {
                                    setDistance(String(logged.distance));
                                    setHangTime(String(logged.hangTime));
                                    setDirection(logged.direction);
                                    setScore(logged.score);
                                  } else {
                                    setDistance("");
                                    setHangTime("");
                                    setDirection("middle");
                                    setScore(0);
                                  }
                                  setSessionActive(true);
                                }}
                                className="text-accent/60 hover:text-accent transition-colors text-[10px] leading-none px-1"
                                title="Edit this kickoff's result"
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
                          )
                        ) : (
                          !isAthlete && (
                            <button
                              onClick={() => deleteRow(idx)}
                              className="text-border hover:text-miss transition-colors text-sm leading-none px-1"
                              title="Delete row"
                            >
                              ×
                            </button>
                          )
                        )}
                      </td>
                      {/* Show logged result indicator on locked rows */}
                      {isLocked && loggedKick && !manualEntry && (
                        <td className="py-1 px-0.5">
                          <span className="text-[10px] text-slate-400">
                            {loggedKick.distance}yd / {loggedKick.hangTime}s
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
                ? "0 kickoffs entered"
                : `${filledCount} kickoff${filledCount !== 1 ? "s" : ""} entered`}
            </span>
            {!isAthlete && (<>
              <div className="flex gap-2">
                {(canUndo || deletedRowStack.length > 0) && (
                  <button
                    onClick={() => {
                      if (deletedRowStack.length > 0) {
                        undoDeleteRow();
                      } else {
                        handleUndo();
                      }
                    }}
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
                      : "border-border text-muted hover:text-white hover:bg-surface-2"
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
                    ? `Continue Session (${filledCount - sessionKicks.length} remaining)`
                    : `Start Session${filledCount > 0 ? ` (${filledCount})` : ""}`}
                </button>
              )}
            </>)}
          </div>
        </div>

        {/* Right: Season stats */}
        <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="TB Rate" value={tbRate} accent glow />
            <StatCard label="Avg Dist" value={avgDist ? `${avgDist} yd` : "—"} />
            <StatCard label="Avg Hang" value={avgHang ? `${avgHang}s` : "—"} />
          </div>
          <ZoneBarChart data={zoneData} />
        </div>
      </main>

      {pendingKicks && (
        <KickoffSessionSummary
          kicks={pendingKicks}
          label={new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "numeric",
            day: "numeric",
          })}
          onConfirm={handleConfirmCommit}
          onCancel={() => setPendingKicks(null)}
        />
      )}
    </>
  );
}
