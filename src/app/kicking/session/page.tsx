"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useFG } from "@/lib/fgContext";
import { LiveFGStats } from "@/components/ui/LiveSessionStats";
import { SessionLog } from "@/components/ui/SessionLog";
import { SessionSummary } from "@/components/ui/SessionSummary";
import { StatCard } from "@/components/ui/StatCard";
import { makePct } from "@/lib/stats";
import type { FGKick, FGPosition, FGResult } from "@/types";
import { POSITIONS, RESULTS } from "@/types";
import clsx from "clsx";
import { useDragReorder } from "@/lib/useDragReorder";
import { loadSettingsFromCloud } from "@/lib/settingsSync";
import { useAuth } from "@/lib/auth";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import { useTeamDraftSync } from "@/lib/useTeamDraftSync";

const INIT_ROWS = 12;

// Outlier detection for FG distance
function checkFGOutliers(dist: number): string[] {
  const warnings: string[] = [];
  if (dist > 0 && (dist < 7 || dist > 80)) warnings.push(`Distance ${dist} yd seems unusual (expected 7–80)`);
  return warnings;
}
const MAX_SCORE = 4;
const SESSION_STORAGE_KEY = "fgSessionDraft";

// ── Table row (planning phase) ────────────────────────────────
interface LogRow {
  athlete: string;
  dist: string;
  pos: string;
  result: string;
  score: string;
  starred?: boolean;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedKicks: { athlete: string; dist: number; pos: FGPosition; isPAT?: boolean; starred?: boolean }[];
  plannedRowIndices: number[];
  currentKickIdx: number;
  sessionKicks: FGKick[];
}

const emptyRow = (): LogRow => ({ athlete: "", dist: "", pos: "", result: "", score: "", starred: false });

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
    teamSet(tid, "fg_session_draft", draft);
  }
}

function loadSnapDistance(): number {
  if (typeof window === "undefined") return 7;
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parseInt(parsed.snapDistance) || 7;
    }
  } catch {}
  return 7;
}

function loadMakeMode(): "simple" | "detailed" {
  if (typeof window === "undefined") return "detailed";
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.makeMode === "simple" ? "simple" : "detailed";
    }
  } catch {}
  return "detailed";
}

function loadMissMode(): "simple" | "detailed" {
  if (typeof window === "undefined") return "detailed";
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.missMode === "simple" ? "simple" : "detailed";
    }
  } catch {}
  return "detailed";
}

const RESULT_LABELS: Record<string, string> = {
  YL: "Make ←",
  YC: "Make ✓",
  YR: "Make →",
  XL: "Miss ←",
  XS: "Miss ↓",
  XR: "Miss →",
};

const SCORE_OPTIONS = ["0", "1", "2", "3", "4"];

const MAKE_BTNS: { r: FGResult; label: string }[] = [
  { r: "YL", label: "← GOOD" },
  { r: "YC", label: "✓ GOOD" },
  { r: "YR", label: "GOOD →" },
];

const MISS_BTNS: { r: FGResult; label: string }[] = [
  { r: "XL", label: "← MISS" },
  { r: "XS", label: "↓ SHORT" },
  { r: "XR", label: "MISS →" },
];

export default function KickingSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice, resetAll } =
    useFG();
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
    { athlete: string; dist: number; pos: FGPosition; isPAT?: boolean; starred?: boolean }[]
  >(draft.plannedKicks);
  const [plannedRowIndices, setPlannedRowIndices] = useState<number[]>(draft.plannedRowIndices ?? []);
  const [currentKickIdx, setCurrentKickIdx] = useState(draft.currentKickIdx);
  const [sessionKicks, setSessionKicks] = useState<FGKick[]>(draft.sessionKicks);
  const [result, setResult] = useState<FGResult | null>(null);
  const [score, setScore] = useState<number>(0);
  const [starred, setStarred] = useState(false);
  const [pendingKicks, setPendingKicks] = useState<FGKick[] | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [snapDistance, setSnapDistance] = useState(() => loadSnapDistance());
  const drag = useDragReorder(rows, setRows);
  const [makeMode, setMakeMode] = useState(() => loadMakeMode());
  const [missMode, setMissMode] = useState(() => loadMissMode());
  const [weather, setWeather] = useState("");
  const [weatherLocked, setWeatherLocked] = useState(false);

  // Guard: skip sync callbacks that arrive shortly after a local save
  const lastLocalSave = useRef(0);

  // Poll for draft changes from other devices
  useTeamDraftSync<SessionDraft>("fg_session_draft", (cloudDraft) => {
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

  // Load settings and draft from cloud on fresh device
  useEffect(() => {
    loadSettingsFromCloud<{ snapDistance?: string; makeMode?: string; missMode?: string }>("fgSettings").then((cloud) => {
      if (cloud) {
        if (cloud.snapDistance) setSnapDistance(parseInt(cloud.snapDistance) || 7);
        if (cloud.makeMode === "simple" || cloud.makeMode === "detailed") setMakeMode(cloud.makeMode);
        if (cloud.missMode === "simple" || cloud.missMode === "detailed") setMissMode(cloud.missMode);
      }
    });
    // Load draft from team data if local is empty
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<SessionDraft>(tid, "fg_session_draft").then((cloudDraft) => {
        if (cloudDraft && cloudDraft.rows) {
          const localDraft = loadDraft();
          const localHasData = localDraft?.rows?.some((r: LogRow) => r.athlete || r.dist || r.pos);
          // Use cloud draft if local is empty or cloud has active session
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
  }, []);

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

  const totals = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        made: acc.made + s.overall.made,
        score: acc.score + s.overall.score,
        longFG: Math.max(acc.longFG, s.overall.longFG),
      };
    },
    { att: 0, made: 0, score: 0, longFG: 0 }
  );

  // ── Table helpers ────────────────────────────────────────────
  const updateRow = useCallback(
    (idx: number, field: keyof LogRow, value: string | boolean) => {
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

  const filledRows = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.athlete || r.dist || r.pos || r.result || r.score);
  const filledCount = filledRows.length;

  // ── Determine which filled rows are locked (have logged results) ──
  const isContinuing = sessionKicks.length > 0 && !sessionActive;
  // Map: filledRowIndex → true if that row's kick has been logged
  const getFilledRowIndices = () => rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.athlete || r.dist || r.pos)
    .map(({ i }) => i);

  const filledIndices = getFilledRowIndices();
  const lockedRowSet = new Set(
    isContinuing ? filledIndices.slice(0, sessionKicks.length) : []
  );

  // ── LOS helper ─────────────────────────────────────────────
  const calcLOS = (dist: number) => dist - 10 - snapDistance;

  // ── Start / Continue Session ────────────────────────────────
  const handleStartOrContinueSession = () => {
    const filled = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.athlete || r.dist || r.pos);

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
      dist: r.pos === "PAT" ? 0 : (parseInt(r.dist) || 0),
      pos: r.pos as FGPosition,
      isPAT: r.pos === "PAT" || undefined,
      starred: r.starred || undefined,
    }));

    setPlannedKicks(planned);
    setPlannedRowIndices(filled.map(({ i }) => i));

    if (isContinuing) {
      setCurrentKickIdx(sessionKicks.length);
    } else {
      setCurrentKickIdx(0);
      setSessionKicks([]);
    }

    setResult(null);
    setScore(0);
    setStarred(!!planned[isContinuing ? sessionKicks.length : 0]?.starred);
    setSessionActive(true);
  };

  // ── Unlock a locked row (remove its logged result) ─────────
  const handleUnlockRow = (filledIdx: number) => {
    // Remove the sessionKick at this index and all after it
    // (since order matters, unlocking kick 2 of 5 means kicks 2-4 need re-logging)
    setSessionKicks((prev) => prev.slice(0, filledIdx));
  };

  // ── Manual Entry: commit directly from table ─────────────────
  const handleManualCommit = () => {
    const filled = rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.athlete || r.dist || r.pos || r.result || r.score);

    if (filled.length === 0) return;

    const errors = new Set<number>();
    filled.forEach(({ r, i }) => {
      if (!r.athlete || !r.result) errors.add(i);
    });

    if (errors.size > 0) {
      setErrorRows(errors);
      return;
    }

    setErrorRows(new Set());

    const kicks: FGKick[] = filled.map(({ r }) => ({
      athleteId: r.athlete,
      athlete: r.athlete,
      dist: r.pos === "PAT" ? 0 : (parseInt(r.dist) || 0),
      pos: r.pos as FGPosition,
      result: r.result as FGResult,
      score: parseInt(r.score) || 0,
      isPAT: r.pos === "PAT" || undefined,
      starred: r.starred || undefined,
    }));

    // Outlier check across all kicks (skip PATs)
    const allWarnings: string[] = [];
    kicks.forEach((k, i) => {
      if (k.isPAT) return;
      const w = checkFGOutliers(k.dist);
      if (w.length > 0) allWarnings.push(`Row ${i + 1}: ${w.join(", ")}`);
    });
    if (allWarnings.length > 0 && !window.confirm(`Are you sure?\n\n${allWarnings.join("\n")}`)) return;

    setPendingKicks(kicks);
  };

  // Track whether we're editing a previously logged kick
  const [editingKickIdx, setEditingKickIdx] = useState<number | null>(null);

  // ── Session card: log current kick ───────────────────────────
  const handleLogKick = () => {
    if (!result) return;
    const plan = plannedKicks[currentKickIdx];
    const kick: FGKick = {
      athleteId: plan.athlete,
      athlete: plan.athlete,
      dist: plan.isPAT ? 0 : plan.dist,
      pos: plan.pos,
      result,
      score,
      isPAT: plan.isPAT || undefined,
      starred: starred || undefined,
    };

    // Outlier check (skip for PATs)
    const warnings = plan.isPAT ? [] : checkFGOutliers(plan.dist);
    if (warnings.length > 0 && !window.confirm(`Are you sure?\n\n${warnings.join("\n")}`)) return;

    if (editingKickIdx !== null) {
      // Replace the existing kick at the edited index
      setSessionKicks((prev) => {
        const next = [...prev];
        next[editingKickIdx] = kick;
        return next;
      });
      setEditingKickIdx(null);
      // Jump back to the next unlogged kick (or stay at end if all done)
      const nextUnlogged = sessionKicks.length; // length hasn't changed since we replaced
      setCurrentKickIdx(Math.min(nextUnlogged, plannedKicks.length - 1));
    } else {
      const newKicks = [...sessionKicks, kick];
      setSessionKicks(newKicks);
      if (currentKickIdx + 1 < plannedKicks.length) {
        setCurrentKickIdx(currentKickIdx + 1);
      }
    }

    setResult(null);
    setScore(0);
    setStarred(false);
    setShowAthleteDropdown(false);
  };

  const allKicksLogged = plannedKicks.length > 0 && sessionKicks.length === plannedKicks.length;
  const isEditing = editingKickIdx !== null;
  const showEntryCard = (!allKicksLogged || isEditing) && plannedKicks[currentKickIdx];
  const currentPlan = plannedKicks[currentKickIdx];

  const updateCurrentPlan = (field: "athlete" | "dist" | "pos" | "isPAT", value: string | number | boolean) => {
    setPlannedKicks((prev) => {
      const next = [...prev];
      next[currentKickIdx] = { ...next[currentKickIdx], [field]: value };
      return next;
    });
    // Sync back to the planning table row
    const rowIdx = plannedRowIndices[currentKickIdx];
    if (rowIdx != null) {
      const rowField = field === "dist" ? "dist" : field === "isPAT" ? "pos" : field;
      const rowValue = field === "isPAT" ? (value ? "PAT" : "") : String(value);
      setRows((prev) => {
        const next = [...prev];
        next[rowIdx] = { ...next[rowIdx], [rowField]: rowValue };
        return next;
      });
    }
  };

  const [showAthleteDropdown, setShowAthleteDropdown] = useState(false);
  const [distInput, setDistInput] = useState(currentPlan?.isPAT ? "" : (currentPlan?.dist?.toString() ?? ""));

  // Sync distInput when moving to a different kick or entering session
  useEffect(() => {
    setDistInput(currentPlan?.isPAT ? "" : (currentPlan?.dist?.toString() ?? ""));
  }, [currentKickIdx, sessionActive, plannedKicks]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setCurrentKickIdx(0);
    setWeather("");
    // Rows (practice log) are kept — user can clear manually
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
    setSessionKicks([]);
    setPlannedKicks([]);
    setPlannedRowIndices([]);
    setCurrentKickIdx(0);
    setShowReset(false);
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
                        ? `Editing Kick #${editingKickIdx + 1}`
                        : allKicksLogged
                          ? "All Kicks Logged"
                          : "Log Result"}
                    </p>
                    <div className="flex items-center gap-2">
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
                              setDistInput(plannedKicks[i].isPAT ? "" : plannedKicks[i].dist.toString());
                              setShowAthleteDropdown(false);
                              if (i < sessionKicks.length) {
                                const logged = sessionKicks[i];
                                setResult(logged.result);
                                setScore(logged.score);
                                setStarred(!!logged.starred);
                                setEditingKickIdx(i);
                              } else {
                                setResult(null);
                                setScore(0);
                                setStarred(!!plannedKicks[i]?.starred);
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

                    {/* LOS + Distance + Position */}
                    <div className="flex gap-4 items-start">
                      {!currentPlan.isPAT && (
                        <>
                          <div className="shrink-0">
                            <p className="text-[10px] font-semibold text-warn uppercase tracking-wider mb-1 block">
                              LOS
                            </p>
                            <div className="w-20 text-center text-base font-bold text-warn bg-warn/10 border border-warn/30 rounded-input py-1.5 flex items-center justify-center">
                              {distInput && !isNaN(parseInt(distInput)) ? calcLOS(parseInt(distInput)) : "—"}
                            </div>
                          </div>
                          <div className="shrink-0">
                            <p className="label">Distance (yd)</p>
                            <input
                              className="input w-20 text-center text-lg font-bold"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={distInput}
                              onChange={(e) => {
                                setDistInput(e.target.value);
                                const v = parseInt(e.target.value);
                                if (!isNaN(v) && v > 0) updateCurrentPlan("dist", v);
                              }}
                            />
                          </div>
                        </>
                      )}
                      <div className="flex-1">
                        <p className="label">Position</p>
                        <div className="flex gap-1.5">
                          {POSITIONS.map((p) => (
                            <button
                              key={p}
                              onClick={() => {
                                updateCurrentPlan("pos", p);
                                updateCurrentPlan("isPAT", false);
                              }}
                              className={clsx(
                                "flex-1 py-2 rounded-input text-xs font-semibold text-center transition-all",
                                currentPlan.pos === p && !currentPlan.isPAT
                                  ? "bg-accent/20 text-accent border border-accent/50"
                                  : "bg-surface-2 text-muted border border-border hover:text-white"
                              )}
                            >
                              {p}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              updateCurrentPlan("pos", "PAT" as FGPosition);
                              updateCurrentPlan("isPAT", true);
                              updateCurrentPlan("dist", 0);
                              setDistInput("");
                            }}
                            className={clsx(
                              "flex-1 py-2 rounded-input text-xs font-semibold text-center transition-all",
                              currentPlan.isPAT
                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/50"
                                : "bg-surface-2 text-muted border border-border hover:text-white"
                            )}
                          >
                            PAT
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Next kick preview */}
                    {(() => {
                      const nextIdx = editingKickIdx !== null
                        ? (sessionKicks.length < plannedKicks.length ? sessionKicks.length : null)
                        : currentKickIdx + 1 < plannedKicks.length ? currentKickIdx + 1 : null;
                      if (nextIdx === null || !plannedKicks[nextIdx]) return null;
                      const next = plannedKicks[nextIdx];
                      return (
                        <p className="text-[10px] text-muted text-left">
                          Next: <span className="text-slate-400 font-semibold">{next.athlete}</span> — {next.isPAT ? "PAT" : `${next.dist}yd (LOS ${calcLOS(next.dist)}) · ${next.pos}`}
                        </p>
                      );
                    })()}

                    {/* Result buttons */}
                    <div>
                      <p className="label">Result</p>
                      <div className="space-y-1.5">
                        {makeMode === "simple" ? (
                          <div>
                            <button
                              onClick={() => setResult("YC")}
                              className={clsx(
                                "w-full py-3 rounded-input text-xs font-bold transition-all",
                                result === "YC"
                                  ? "bg-make text-slate-900 shadow-lg"
                                  : "bg-make/10 text-make border border-make/30 hover:bg-make/20"
                              )}
                            >
                              ✓ GOOD
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {MAKE_BTNS.map(({ r, label }) => (
                              <button
                                key={r}
                                onClick={() => setResult(r)}
                                className={clsx(
                                  "py-3 rounded-input text-xs font-bold transition-all",
                                  result === r
                                    ? "bg-make text-slate-900 shadow-lg"
                                    : "bg-make/10 text-make border border-make/30 hover:bg-make/20"
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {missMode === "simple" ? (
                          <div>
                            <button
                              onClick={() => { setResult("XS"); setScore(0); }}
                              className={clsx(
                                "w-full py-3 rounded-input text-xs font-bold transition-all",
                                result === "XL" || result === "XS" || result === "XR"
                                  ? "bg-miss text-white shadow-lg"
                                  : "bg-miss/10 text-miss border border-miss/30 hover:bg-miss/20"
                              )}
                            >
                              ✗ MISS
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {MISS_BTNS.map(({ r, label }) => (
                              <button
                                key={r}
                                onClick={() => { setResult(r); setScore(0); }}
                                className={clsx(
                                  "py-3 rounded-input text-xs font-bold transition-all",
                                  result === r
                                    ? "bg-miss text-white shadow-lg"
                                    : "bg-miss/10 text-miss border border-miss/30 hover:bg-miss/20"
                                )}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Score pills */}
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
                                ? "bg-accent text-slate-900"
                                : "bg-surface-2 text-muted border border-border hover:border-accent/50"
                            )}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Star + Log button */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStarred((v) => !v)}
                        className={clsx(
                          "px-3 py-3 rounded-input text-lg transition-all border",
                          starred
                            ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
                            : "bg-surface-2 text-muted border-border hover:text-amber-400"
                        )}
                        title={starred ? "Live rep (starred)" : "Mark as live rep"}
                      >
                        {starred ? "★" : "☆"}
                      </button>
                      <button
                        onClick={handleLogKick}
                        disabled={!result}
                        className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        LOG KICK
                      </button>
                    </div>
                  </>
                )}

                {allKicksLogged && (
                  <div className="text-center py-6 space-y-3">
                    <div className="text-3xl">✅</div>
                    <p className="text-sm text-slate-200 font-medium">
                      All {plannedKicks.length} kicks logged!
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
              <SessionLog kicks={sessionKicks} onDelete={handleDeleteKick} />
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
              const fgKicks = sessionKicks.filter((k) => !k.isPAT);
              const sessionMakes = fgKicks.filter((k) => k.result.startsWith("Y")).length;
              const sessionAtt = fgKicks.length;
              const sessionLong = fgKicks.reduce((max, k) => k.result.startsWith("Y") ? Math.max(max, k.dist) : max, 0);
              const sessionAvgScore = sessionAtt > 0 ? (fgKicks.reduce((s, k) => s + k.score, 0) / sessionAtt).toFixed(1) : "—";
              return (
                <div className="grid grid-cols-3 gap-2">
                  <StatCard
                    label="Session %"
                    value={makePct(sessionAtt, sessionMakes)}
                    accent
                    glow
                  />
                  <StatCard label="Avg Score" value={sessionAvgScore} />
                  <StatCard
                    label="Long FG"
                    value={sessionLong > 0 ? `${sessionLong} yd` : "—"}
                  />
                </div>
              );
            })()}
            <LiveFGStats kicks={sessionKicks} />
          </div>
        </main>

        {pendingKicks && (
          <SessionSummary
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
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-8 border-b border-border">
                    #
                  </th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center border-b border-border">
                    Athlete
                  </th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-16 border-b border-border">
                    Dist
                  </th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-20 border-b border-border">
                    Pos
                  </th>
                  {manualEntry && (
                    <>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-24 border-b border-border">
                        Result
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        Score
                      </th>
                    </>
                  )}
                  <th className="bg-surface-2 text-amber-400 font-bold py-2 px-1 text-center w-8 border-b border-border">★</th>
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-8 border-b border-border" />
                </tr>
              </thead>
              <tbody
                ref={drag.containerRef}
                onPointerMove={drag.handlePointerMove}
                onPointerUp={drag.handlePointerUp}
              >
                {rows.map((row, idx) => {
                  const isLocked = lockedRowSet.has(idx);
                  // Find the filled index for this row to map to sessionKicks
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
                          <span className="text-xs text-slate-400 text-center block">{row.pos === "PAT" ? "—" : row.dist}</span>
                        ) : row.pos === "PAT" ? (
                          <span className="text-xs text-muted text-center block py-1">—</span>
                        ) : (
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="yds"
                            value={row.dist}
                            onChange={(e) => updateRow(idx, "dist", e.target.value)}
                            readOnly={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                          />
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {isLocked ? (
                          <span className="text-xs text-slate-400 text-center block">{row.pos}</span>
                        ) : (
                          <select
                            value={row.pos}
                            onChange={(e) => {
                              updateRow(idx, "pos", e.target.value);
                              if (e.target.value === "PAT") updateRow(idx, "dist", "");
                            }}
                            disabled={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {POSITIONS.map((p) => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                            <option value="PAT">PAT</option>
                          </select>
                        )}
                      </td>
                      {manualEntry && (
                        <>
                          <td className="py-1 px-1">
                            <select
                              value={row.result}
                              onChange={(e) => {
                                updateRow(idx, "result", e.target.value);
                                if (e.target.value.startsWith("X")) {
                                  updateRow(idx, "score", "0");
                                }
                              }}
                              disabled={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                            >
                              <option value="">—</option>
                              {(() => {
                                const makes = makeMode === "simple" ? ["YC"] : ["YL", "YC", "YR"];
                                const misses = missMode === "simple" ? ["XS"] : ["XL", "XS", "XR"];
                                return [...makes, ...misses].map((r) => (
                                  <option key={r} value={r}>{RESULT_LABELS[r]}</option>
                                ));
                              })()}
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
                              {SCORE_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>
                        </>
                      )}
                      <td className="py-1 px-1 text-center">
                        {!isAthlete ? (
                          <button
                            onClick={() => updateRow(idx, "starred", !row.starred)}
                            className={clsx(
                              "text-sm transition-colors",
                              row.starred ? "text-amber-400" : "text-muted/40 hover:text-amber-400"
                            )}
                          >
                            {row.starred ? "★" : "☆"}
                          </button>
                        ) : row.starred ? (
                          <span className="text-sm text-amber-400">★</span>
                        ) : null}
                      </td>
                      <td className="py-1 px-1 text-center">
                        {!isAthlete && (
                          isLocked ? (
                            <div className="flex items-center gap-0.5 justify-center">
                              <button
                                onClick={() => {
                                  const filled = rows
                                    .map((r, ri) => ({ r, i: ri }))
                                    .filter(({ r }) => r.athlete || r.dist || r.pos);
                                  const planned = filled.map(({ r }) => ({
                                    athlete: r.athlete,
                                    dist: r.pos === "PAT" ? 0 : (parseInt(r.dist) || 0),
                                    pos: r.pos as FGPosition,
                                    isPAT: r.pos === "PAT" || undefined,
                                    starred: r.starred || undefined,
                                  }));
                                  setPlannedKicks(planned);
                                  setPlannedRowIndices(filled.map(({ i: ri }) => ri));
                                  setCurrentKickIdx(filledIdx);
                                  setDistInput(planned[filledIdx]?.isPAT ? "" : (planned[filledIdx]?.dist.toString() ?? ""));
                                  setEditingKickIdx(filledIdx);
                                  const logged = sessionKicks[filledIdx];
                                  if (logged) {
                                    setResult(logged.result);
                                    setScore(logged.score);
                                    setStarred(!!logged.starred);
                                  } else {
                                    setResult(null);
                                    setScore(0);
                                    setStarred(!!planned[filledIdx]?.starred);
                                  }
                                  setSessionActive(true);
                                }}
                                className="text-accent/60 hover:text-accent transition-colors text-[10px] leading-none px-1"
                                title="Edit this kick's result"
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
                          <span className={clsx(
                            "text-[10px] font-bold",
                            loggedKick.result.startsWith("Y") ? "text-make" : "text-miss"
                          )}>
                            {RESULT_LABELS[loggedKick.result] ?? loggedKick.result}
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
                ? "0 kicks entered"
                : `${filledCount} kick${filledCount !== 1 ? "s" : ""} entered`}
            </span>
            {!isAthlete && (
              <>
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
              </>
            )}
          </div>
        </div>

        {/* Right: Season stats */}
        <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label="Season %"
              value={makePct(totals.att, totals.made)}
              accent
              glow
            />
            <StatCard label="Attempts" value={totals.att || "—"} />
            <StatCard
              label="Long FG"
              value={totals.longFG > 0 ? `${totals.longFG} yd` : "—"}
            />
          </div>
        </div>
      </main>

      {pendingKicks && (
        <SessionSummary
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
