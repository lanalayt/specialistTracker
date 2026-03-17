"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePunt } from "@/lib/puntContext";
import { StatCard } from "@/components/ui/StatCard";
import { PuntSessionLog } from "@/components/ui/PuntSessionLog";
import { PuntSessionSummary } from "@/components/ui/PuntSessionSummary";
import { PuntFieldStrip } from "@/components/ui/PuntFieldStrip";
import type { PuntEntry, PuntType, PuntHash } from "@/types";
import { PUNT_HASHES } from "@/types";
import clsx from "clsx";
import { useDragReorder } from "@/lib/useDragReorder";
import { loadSettingsFromCloud } from "@/lib/settingsSync";
import { useAuth } from "@/lib/auth";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import { useTeamDraftSync } from "@/lib/useTeamDraftSync";

const INIT_ROWS = 12;
const SESSION_STORAGE_KEY = "puntSessionDraft";

// Outlier detection for punt values
function checkPuntOutliers(yards: number, hangTime: number, opTime: number): string[] {
  const warnings: string[] = [];
  if (yards > 0 && (yards < 1 || yards > 80)) warnings.push(`Yards ${yards} seems unusual (expected 1–80)`);
  if (hangTime > 0 && (hangTime < 1.0 || hangTime > 6.0)) warnings.push(`Hang Time ${hangTime}s seems unusual (expected 1.0–6.0)`);
  if (opTime > 0 && (opTime < 0.8 || opTime > 3.0)) warnings.push(`Punter Opp ${opTime}s seems unusual (expected 0.8–3.0)`);
  return warnings;
}

// ── Table row (planning phase) ────────────────────────────────
interface LogRow {
  athlete: string;
  type: string;
  hash: string;
  yards: string;
  hangTime: string;
  opTime: string;
  directionalAccuracy: string;
  starred?: boolean;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedPunts: { athlete: string; type: PuntType; hash: PuntHash; starred?: boolean }[];
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
  starred: false,
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
    teamSet(tid, "punt_session_draft", draft);
  }
}

const DEFAULT_PUNT_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "POOCH_BLUE", label: "P-Blue" },
  { id: "POOCH_RED", label: "P-Red" },
  { id: "BROWN", label: "Brown" },
];

function loadPuntTypes(): { id: string; label: string }[] {
  if (typeof window === "undefined") return DEFAULT_PUNT_TYPES;
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.puntTypes && parsed.puntTypes.length > 0) {
        return parsed.puntTypes;
      }
    }
  } catch {}
  return DEFAULT_PUNT_TYPES;
}

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
  const { isAthlete } = useAuth();

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
    { athlete: string; type: PuntType; hash: PuntHash; starred?: boolean }[]
  >(draft.plannedPunts);
  const [plannedRowIndices, setPlannedRowIndices] = useState<number[]>(draft.plannedRowIndices ?? []);
  const [currentPuntIdx, setCurrentPuntIdx] = useState(draft.currentPuntIdx);
  const [sessionPunts, setSessionPunts] = useState<PuntEntry[]>(draft.sessionPunts);
  const [pendingPunts, setPendingPunts] = useState<PuntEntry[] | null>(null);
  const [showReset, setShowReset] = useState(false);
  const [puntTypes, setPuntTypes] = useState(() => loadPuntTypes());
  const typeLabels: Record<string, string> = {};
  puntTypes.forEach((t) => { typeLabels[t.id] = t.label; });
  const drag = useDragReorder(rows, setRows);
  const [weather, setWeather] = useState("");
  const [weatherLocked, setWeatherLocked] = useState(false);

  // Guard: skip sync callbacks that arrive shortly after a local save
  const lastLocalSave = useRef(0);

  // Poll for draft changes from other devices
  useTeamDraftSync<SessionDraft>("punt_session_draft", (cloudDraft) => {
    if (Date.now() - lastLocalSave.current < 8000) return;
    if (cloudDraft && cloudDraft.rows) {
      setRows(cloudDraft.rows);
      setManualEntry(cloudDraft.manualEntry);
      setSessionActive(cloudDraft.sessionActive);
      setPlannedPunts(cloudDraft.plannedPunts ?? []);
      setPlannedRowIndices(cloudDraft.plannedRowIndices ?? []);
      setCurrentPuntIdx(cloudDraft.currentPuntIdx ?? 0);
      setSessionPunts(cloudDraft.sessionPunts ?? []);
    }
  });

  // Load punt types from cloud on fresh device
  useEffect(() => {
    loadSettingsFromCloud<{ puntTypes?: { id: string; label: string }[] }>("puntSettings").then((cloud) => {
      if (cloud?.puntTypes && cloud.puntTypes.length > 0) {
        setPuntTypes(cloud.puntTypes);
      }
    });

    // Load draft from cloud if local is empty
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<SessionDraft>(tid, "punt_session_draft").then((cloudDraft) => {
        if (cloudDraft && cloudDraft.rows) {
          const localDraft = loadDraft();
          const localHasData = localDraft?.rows?.some((r: LogRow) => r.athlete || r.type || r.hash);
          if (!localHasData || cloudDraft.sessionActive) {
            setRows(cloudDraft.rows);
            setManualEntry(cloudDraft.manualEntry);
            setSessionActive(cloudDraft.sessionActive);
            setPlannedPunts(cloudDraft.plannedPunts ?? []);
            setPlannedRowIndices(cloudDraft.plannedRowIndices ?? []);
            setCurrentPuntIdx(cloudDraft.currentPuntIdx ?? 0);
            setSessionPunts(cloudDraft.sessionPunts ?? []);
          }
        }
      });
    }
  }, []);

  // Auto-decimal: user types digits, we insert decimal 2 places from right
  // e.g. "456" → "4.56", "12" → "0.12", "1" → "0.01"
  function formatAutoDecimal(raw: string): string {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    const padded = digits.padStart(3, "0");
    const whole = padded.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
    return `${whole}.${padded.slice(-2)}`;
  }
  function handleAutoDecimalChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, "");
      setter(digits ? formatAutoDecimal(digits) : "");
    };
  }
  // Convert a decimal string like "4.56" to raw digits "456" for editing
  function toRawDigits(val: number | string): string {
    const n = typeof val === "string" ? parseFloat(val) : val;
    if (!n && n !== 0) return "";
    return Math.round(n * 100).toString();
  }

  // Session card state
  const [yards, setYards] = useState("");
  const [hangTime, setHangTime] = useState("");
  const [opTime, setOpTime] = useState("");
  const [directionalAccuracy, setDirectionalAccuracy] = useState<0 | 0.5 | 1>(1);
  const [starred, setStarred] = useState(false);

  // Persist draft on every relevant state change
  useEffect(() => {
    lastLocalSave.current = Date.now();
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
        yardsAtt: acc.yardsAtt + (s.overall.yardsAtt ?? s.overall.att),
        totalHang: acc.totalHang + s.overall.totalHang,
        hangAtt: acc.hangAtt + (s.overall.hangAtt ?? s.overall.att),
        long: Math.max(acc.long, s.overall.long),
      };
    },
    { att: 0, totalYards: 0, yardsAtt: 0, totalHang: 0, hangAtt: 0, long: 0 }
  );

  const avgYards =
    totals.yardsAtt > 0 ? (totals.totalYards / totals.yardsAtt).toFixed(1) : "—";
  const avgHang =
    totals.hangAtt > 0 ? (totals.totalHang / totals.hangAtt).toFixed(2) : "—";

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
      if (!r.athlete) errors.add(i);
    });

    if (errors.size > 0) {
      setErrorRows(errors);
      return;
    }

    setErrorRows(new Set());

    const planned = filled.map(({ r }) => ({
      athlete: r.athlete,
      type: (r.type || "") as PuntType,
      hash: (r.hash || "") as PuntHash,
      starred: r.starred || undefined,
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
    setStarred(!!planned[isContinuing ? sessionPunts.length : 0]?.starred);
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
      if (!r.athlete) errors.add(i);
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
      starred: r.starred || undefined,
    }));

    // Outlier check across all punts
    const allWarnings: string[] = [];
    punts.forEach((p, i) => {
      const w = checkPuntOutliers(p.yards, p.hangTime, p.opTime);
      if (w.length > 0) allWarnings.push(`Row ${i + 1}: ${w.join(", ")}`);
    });
    if (allWarnings.length > 0 && !window.confirm(`Are you sure?\n\n${allWarnings.join("\n")}`)) return;

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
    const plan = plannedPunts[currentPuntIdx];
    const ydsVal = parseInt(yards) || 0;
    const htVal = parseFloat(hangTime) || 0;
    const otVal = parseFloat(opTime) || 0;
    const punt: PuntEntry = {
      athleteId: plan.athlete,
      athlete: plan.athlete,
      type: plan.type,
      hash: plan.hash,
      yards: ydsVal,
      hangTime: htVal,
      opTime: otVal,
      landingZones: [],
      directionalAccuracy,
      starred: starred || undefined,
    };

    // Outlier check
    const warnings = checkPuntOutliers(ydsVal, htVal, otVal);
    if (warnings.length > 0 && !window.confirm(`Are you sure?\n\n${warnings.join("\n")}`)) return;

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
    setStarred(false);
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
    commitPractice(pendingPunts, undefined, weather);
    setSessionPunts([]);
    setPendingPunts(null);
    setSessionActive(false);
    setPlannedPunts([]);
    setPlannedRowIndices([]);
    setWeather("");
    setCurrentPuntIdx(0);
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
                        className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all"
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
                        const hex = colorMap[p.athlete];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setCurrentPuntIdx(i);
                              setShowAthleteDropdown(false);
                              if (i < sessionPunts.length) {
                                const logged = sessionPunts[i];
                                setYards(String(logged.yards));
                                setHangTime(String(logged.hangTime));
                                setOpTime(String(logged.opTime));
                                setDirectionalAccuracy(logged.directionalAccuracy);
                                setStarred(!!logged.starred);
                                setEditingPuntIdx(i);
                              } else {
                                setYards("");
                                setHangTime("");
                                setOpTime("");
                                setDirectionalAccuracy(1);
                                setStarred(!!plannedPunts[i]?.starred);
                                setEditingPuntIdx(null);
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
                              {p.athlete}
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

                    {/* Editable: Type + Position */}
                    <div className="flex gap-4 items-start">
                      <div className="shrink-0">
                        <p className="label">Type</p>
                        <div className="flex gap-1.5">
                          {puntTypes.map((pt) => (
                            <button
                              key={pt.id}
                              onClick={() => updateCurrentPlan("type", pt.id)}
                              className={clsx(
                                "px-3 py-2 rounded-input text-xs font-semibold text-center transition-all",
                                currentPlan.type === pt.id
                                  ? "bg-accent/20 text-accent border border-accent/50"
                                  : "bg-surface-2 text-muted border border-border hover:text-white"
                              )}
                            >
                              {pt.label}
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
                                  : "bg-surface-2 text-muted border border-border hover:text-white"
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
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="yds"
                          value={yards}
                          onChange={(e) => setYards(e.target.value)}
                        />
                      </div>
                      <div>
                        <p className="label">Hang Time (s)</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="text"
                          inputMode="numeric"
                          placeholder="sec"
                          value={hangTime}
                          onChange={handleAutoDecimalChange(setHangTime)}
                        />
                      </div>
                      <div>
                        <p className="label">Opp Time (s)</p>
                        <input
                          className="input text-center text-lg font-bold"
                          type="text"
                          inputMode="numeric"
                          placeholder="sec"
                          value={opTime}
                          onChange={handleAutoDecimalChange(setOpTime)}
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
                              : "bg-surface-2 text-muted border-border hover:text-white"
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
                              : "bg-surface-2 text-muted border-border hover:text-white"
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
                              : "bg-surface-2 text-muted border-border hover:text-white"
                          )}
                        >
                          0 ★
                        </button>
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
                        onClick={handleLogPunt}
                        disabled={!yards || !hangTime || !opTime}
                        className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        LOG PUNT
                      </button>
                    </div>
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
            {(() => {
              const sAtt = sessionPunts.length;
              const ydsCount = sessionPunts.filter((p) => p.yards > 0).length;
              const htCount = sessionPunts.filter((p) => p.hangTime > 0).length;
              const sAvgYds = ydsCount > 0 ? (sessionPunts.reduce((s, p) => s + (p.yards > 0 ? p.yards : 0), 0) / ydsCount).toFixed(1) : "—";
              const sAvgHT = htCount > 0 ? (sessionPunts.reduce((s, p) => s + (p.hangTime > 0 ? p.hangTime : 0), 0) / htCount).toFixed(2) : "—";
              const sLong = sessionPunts.reduce((max, p) => Math.max(max, p.yards || 0), 0);
              return (
                <div className="grid grid-cols-3 gap-2">
                  <StatCard label="Avg Yards" value={sAvgYds} accent glow />
                  <StatCard label="Avg Hang" value={sAtt > 0 ? `${sAvgHT}s` : "—"} />
                  <StatCard label="Long Punt" value={sLong > 0 ? `${sLong} yd` : "—"} />
                </div>
              );
            })()}
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
                  ({sessionPunts.length} logged)
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
                  <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                    Pos
                  </th>
                  {manualEntry && (
                    <>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                        Yards
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-[4.5rem] border-b border-border text-[10px]">
                        Hang Time
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-[4.5rem] border-b border-border text-[10px]">
                        Punter Opp
                      </th>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-[4.5rem] border-b border-border text-[10px]">
                        Dir. Score
                      </th>
                    </>
                  )}
                  <th className="bg-surface-2 text-amber-400 font-bold py-2 px-1 text-center w-8 border-b border-border">★</th>
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
                  const loggedPunt = isLocked && filledIdx >= 0 ? sessionPunts[filledIdx] : null;

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
                          <span className="text-xs text-slate-400 text-center block">{typeLabels[row.type] ?? row.type}</span>
                        ) : (
                          <select
                            value={row.type}
                            onChange={(e) => updateRow(idx, "type", e.target.value)}
                            disabled={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {puntTypes.map((pt) => (
                              <option key={pt.id} value={pt.id}>{pt.label}</option>
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
                            disabled={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
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
                              type="text" inputMode="numeric" pattern="[0-9]*" placeholder="yds"
                              value={row.yards}
                              onChange={(e) => updateRow(idx, "yards", e.target.value)}
                              readOnly={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="text" inputMode="numeric" placeholder="sec"
                              value={row.hangTime}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "");
                                updateRow(idx, "hangTime", digits ? formatAutoDecimal(digits) : "");
                              }}
                              readOnly={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <input
                              type="text" inputMode="numeric" placeholder="sec"
                              value={row.opTime}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "");
                                updateRow(idx, "opTime", digits ? formatAutoDecimal(digits) : "");
                              }}
                              readOnly={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          <td className="py-1 px-1">
                            <select
                              value={row.directionalAccuracy}
                              onChange={(e) => updateRow(idx, "directionalAccuracy", e.target.value)}
                              disabled={isAthlete}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
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
                        {isLocked ? (
                          !isAthlete && (
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
                                    starred: r.starred || undefined,
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
                                    setStarred(!!logged.starred);
                                  } else {
                                    setYards("");
                                    setHangTime("");
                                    setOpTime("");
                                    setDirectionalAccuracy(1);
                                    setStarred(false);
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
                    ? `Continue Session (${filledCount - sessionPunts.length} remaining)`
                    : `Start Session${filledCount > 0 ? ` (${filledCount})` : ""}`}
                </button>
              )}
            </>)}
          </div>
        </div>

        {/* Right: Today's session stats by athlete */}
        <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
          {(() => {
            const todayPunts = sessionPunts;
            const athleteNames = [...new Set(todayPunts.map((p) => p.athlete))];

            if (athleteNames.length === 0) {
              return (
                <div className="flex items-center justify-center h-24 text-xs text-muted">
                  Session stats will appear here
                </div>
              );
            }

            return athleteNames.map((name) => {
              const ap = todayPunts.filter((p) => p.athlete === name);
              const count = ap.length;
              const totalYds = ap.reduce((s, p) => s + p.yards, 0);
              const totalHT = ap.reduce((s, p) => s + p.hangTime, 0);
              const totalOT = ap.reduce((s, p) => s + p.opTime, 0);
              const totalDA = ap.reduce((s, p) => s + p.directionalAccuracy, 0);
              const longPunt = Math.max(...ap.map((p) => p.yards));
              const aYds = count > 0 ? (totalYds / count).toFixed(1) : "—";
              const aHT = count > 0 ? (totalHT / count).toFixed(2) : "—";
              const aOT = count > 0 ? (totalOT / count).toFixed(2) : "—";
              const aDA = count > 0 ? `${Math.round((totalDA / count) * 100)}%` : "—";

              return (
                <div key={name} className="card space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-100">{name}</p>
                    <span className="text-xs text-muted">{count} punt{count !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Avg Yards" value={aYds} accent />
                    <StatCard label="Avg Hang" value={count > 0 ? `${aHT}s` : "—"} />
                    <StatCard label="Punter Opp" value={count > 0 ? `${aOT}s` : "—"} />
                    <StatCard label="Dir. Score" value={aDA} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted px-1">
                    <span>Long: {longPunt > 0 ? `${longPunt} yd` : "—"}</span>
                  </div>
                </div>
              );
            });
          })()}
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
