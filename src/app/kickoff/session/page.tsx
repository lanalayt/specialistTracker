"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import { StatCard } from "@/components/ui/StatCard";
import { ZoneBarChart } from "@/components/ui/Chart";
import { KickoffSessionLog } from "@/components/ui/KickoffSessionLog";
import { KickoffSessionSummary } from "@/components/ui/KickoffSessionSummary";
import { KickoffFieldView } from "@/components/ui/KickoffFieldView";
import type { KickoffEntry, KickoffType, KickoffDirection } from "@/types";
import { KICKOFF_TYPES, KICKOFF_DIRECTIONS, KICKOFF_ZONES } from "@/types";
import clsx from "clsx";
import { useDragReorder } from "@/lib/useDragReorder";
import { useAuth } from "@/lib/auth";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import { useTeamDraftSync } from "@/lib/useTeamDraftSync";

const INIT_ROWS = 12;

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
  // Game mode only
  los?: string;
  landingYL?: string;
  returnYards?: string;
  touchback?: boolean;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedKicks: { athlete: string; type: KickoffType }[];
  plannedRowIndices: number[];
  currentKickIdx: number;
  sessionKicks: KickoffEntry[];
  committed?: boolean;
  committedWeather?: string;
  committedKicks?: KickoffEntry[];
  sessionMode?: "practice" | "game";
  opponent?: string;
  gameTime?: string;
}

const emptyRow = (): LogRow => ({
  athlete: "",
  type: "",
  distance: "",
  hangTime: "",
  direction: "",
  los: "",
  landingYL: "",
  returnYards: "",
  touchback: false,
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

const DEFAULT_KO_TYPES = [
  { id: "BLUE", label: "Blue" },
  { id: "RED", label: "Red" },
  { id: "SQUIB", label: "Squib" },
  { id: "SKY", label: "Sky" },
  { id: "ONSIDE", label: "Onside" },
];

const DEFAULT_KO_DIRS = [
  { id: "1", label: "1.0" },
  { id: "0.5", label: "0.5" },
  { id: "OB", label: "OB" },
];

// Parse a yard-line input ("-20", "+25", "50") into 0..100 field position
function parseYardLine(input: string | undefined | null): number {
  if (input == null) return NaN;
  const trimmed = String(input).trim();
  if (!trimmed) return NaN;
  const match = trimmed.match(/^([+-]?)(\d+)$/);
  if (!match) return NaN;
  const sign = match[1] || "-";
  const n = parseInt(match[2], 10);
  if (isNaN(n) || n < 0 || n > 50) return NaN;
  return sign === "-" ? n : 100 - n;
}

function loadKickoffSettings(): { types: { id: string; label: string }[]; directions: { id: string; label: string }[] } {
  if (typeof window === "undefined") return { types: DEFAULT_KO_TYPES, directions: DEFAULT_KO_DIRS };
  try {
    const raw = localStorage.getItem("kickoffSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        types: parsed.kickoffTypes?.length > 0 ? parsed.kickoffTypes : DEFAULT_KO_TYPES,
        directions: parsed.directionMetrics?.length > 0 ? parsed.directionMetrics : DEFAULT_KO_DIRS,
      };
    }
  } catch {}
  return { types: DEFAULT_KO_TYPES, directions: DEFAULT_KO_DIRS };
}

// Legacy labels for old data
const TYPE_LABELS: Record<string, string> = {
  REG: "Regular",
  ONSIDE: "Onside",
  SQUIB: "Squib",
  FREE: "Free",
};

const DIR_LABELS: Record<string, string> = {
  left: "←",
  middle: "↑",
  right: "→",
  "1": "1.0 ✓",
  "0.5": "0.5",
  "OB": "OB",
};

export default function KickoffSessionPage() {
  const { athletes, stats, canUndo, undoLastCommit, commitPractice } =
    useKickoff();
  const { isAthlete } = useAuth();

  // ── Custom kickoff types + directions from settings ──────────────────
  const [koTypes, setKoTypes] = useState(() => loadKickoffSettings().types);
  const [koDirs, setKoDirs] = useState(() => loadKickoffSettings().directions);
  const koTypeLabels: Record<string, string> = {};
  koTypes.forEach((t) => { koTypeLabels[t.id] = t.label; });
  const koDirLabels: Record<string, string> = {};
  koDirs.forEach((d) => { koDirLabels[d.id] = d.label; });

  useEffect(() => {
    import("@/lib/settingsSync").then(({ loadSettingsFromCloud }) => {
      loadSettingsFromCloud<{ kickoffTypes?: { id: string; label: string }[]; directionMetrics?: { id: string; label: string }[] }>("kickoffSettings").then((cloud) => {
        if (cloud?.kickoffTypes?.length) setKoTypes(cloud.kickoffTypes);
        if (cloud?.directionMetrics?.length) setKoDirs(cloud.directionMetrics);
      });
    });
  }, []);

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
  const [sessionKicks, setSessionKicks] = useState<KickoffEntry[]>(() =>
    (draft.sessionKicks ?? []).map((k, i) => k.kickNum != null ? k : { ...k, kickNum: i + 1 })
  );
  const [pendingKicks, setPendingKicks] = useState<KickoffEntry[] | null>(null);
  const [committed, setCommitted] = useState(draft.committed ?? false);
  const [committedKicks, setCommittedKicks] = useState<KickoffEntry[]>(draft.committedKicks ?? []);
  const [sessionMode, setSessionMode] = useState<"practice" | "game">(() => {
    if ((draft.sessionKicks?.length > 0 || draft.sessionActive || draft.committed) && draft.sessionMode === "game") {
      return "game";
    }
    return "practice";
  });
  const [opponent, setOpponent] = useState<string>(draft.opponent ?? "");
  const [gameTime, setGameTime] = useState<string>(draft.gameTime ?? "");

  // Game mode forces manual entry (no live session)
  useEffect(() => {
    if (sessionMode === "game" && !manualEntry) setManualEntry(true);
  }, [sessionMode, manualEntry]);
  const [showReset, setShowReset] = useState(false);
  const drag = useDragReorder(rows, setRows);
  const [weather, setWeather] = useState(draft.committedWeather ?? "");
  const [weatherLocked, setWeatherLocked] = useState(false);

  // Session card state
  const [distance, setDistance] = useState("");
  const [hangTime, setHangTime] = useState("");
  const [direction, setDirection] = useState<KickoffDirection>("1");
  // score removed — not used for kickoff

  // Auto-decimal: user types digits, we insert decimal 2 places from right
  // e.g. "456" → "4.56", "12" → "0.12"
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
      setCommitted(cloudDraft.committed ?? false);
      if (cloudDraft.committedWeather != null) setWeather(cloudDraft.committedWeather);
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
      committed,
      committedWeather: committed ? weather : undefined,
      committedKicks: committed ? committedKicks : undefined,
      sessionMode,
      opponent,
      gameTime,
    });
  }, [rows, manualEntry, sessionActive, plannedKicks, plannedRowIndices, currentKickIdx, sessionKicks, committed, committedKicks, weather, sessionMode, opponent, gameTime]);

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
            setCommitted(cloudDraft.committed ?? false);
            if (cloudDraft.committedWeather != null) setWeather(cloudDraft.committedWeather);
          }
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Kick numbering helpers (track by planned position) ──────
  const loggedKickNums = new Set(sessionKicks.map(k => k.kickNum));
  const isPlannedLogged = (i: number) => loggedKickNums.has(i + 1);
  const getLoggedKick = (i: number) => sessionKicks.find(k => k.kickNum === i + 1);
  const getLoggedKickArrayIdx = (i: number) => sessionKicks.findIndex(k => k.kickNum === i + 1);
  const findNextUnlogged = (after: number = -1) => {
    for (let j = after + 1; j < plannedKicks.length; j++) {
      if (!isPlannedLogged(j)) return j;
    }
    return -1;
  };

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

  const planningFields = (r: LogRow) => r.athlete || r.type;
  const allFields = (r: LogRow) =>
    r.athlete || r.type || r.distance || r.hangTime || r.direction;

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
    isContinuing ? filledIndices.filter((_, pi) => sessionKicks.some(k => k.kickNum === pi + 1)) : []
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
      const firstUnlogged = planned.findIndex((_, i) => !sessionKicks.some(k => k.kickNum === i + 1));
      setCurrentKickIdx(firstUnlogged >= 0 ? firstUnlogged : planned.length - 1);
    } else {
      setCurrentKickIdx(0);
      setSessionKicks([]);
    }

    setDistance("");
    setHangTime("");
    setDirection("1" as KickoffDirection);
    setSessionActive(true);
  };

  // ── Unlock a locked row ──
  const handleUnlockRow = (filledIdx: number) => {
    setSessionKicks((prev) => prev.filter(k => (k.kickNum ?? 0) < filledIdx + 1));
  };

  // ── Game mode: save a single row to sessionKicks ──
  // Kickoffs always tee from own 35 (field position 35). Distance determines landing.
  const handleSaveGameRow = (rowIdx: number) => {
    const r = rows[rowIdx];
    if (!r || !r.athlete) {
      setErrorRows((prev) => new Set([...prev, rowIdx]));
      return;
    }
    const distance = parseInt(r.distance) || 0;
    if (distance <= 0) {
      alert("Distance is required.");
      setErrorRows((prev) => new Set([...prev, rowIdx]));
      return;
    }
    const htVal = parseFloat(r.hangTime) || 0;
    const retVal = r.touchback ? 0 : (r.returnYards !== "" && r.returnYards != null ? parseInt(r.returnYards) || 0 : undefined);
    const losVal = 35; // kickoff spot — own 35
    const landingYLVal = Math.min(100, losVal + distance);
    const filledIdx = filledIndices.indexOf(rowIdx);
    const kickNum = filledIdx >= 0 ? filledIdx + 1 : sessionKicks.length + 1;
    const kick: KickoffEntry = {
      athleteId: r.athlete,
      athlete: r.athlete,
      type: r.type as KickoffType,
      distance,
      hangTime: htVal,
      direction: (r.direction || "1") as KickoffDirection,
      score: 0,
      kickNum,
      los: losVal,
      landingYL: landingYLVal,
      returnYards: retVal,
      result: r.touchback ? "TB" : undefined,
    };
    setSessionKicks((prev) => {
      const existing = prev.findIndex((k) => k.kickNum === kickNum);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = kick;
        return next;
      }
      return [...prev, kick];
    });
    setErrorRows((prev) => {
      const next = new Set(prev);
      next.delete(rowIdx);
      return next;
    });
  };

  const handleUnsaveGameRow = (rowIdx: number) => {
    const filledIdx = filledIndices.indexOf(rowIdx);
    if (filledIdx < 0) return;
    const kickNum = filledIdx + 1;
    setSessionKicks((prev) => prev.filter((k) => k.kickNum !== kickNum));
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
      direction: (r.direction || "1") as KickoffDirection,
      score: 0,
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
      score: 0,
      kickNum: currentKickIdx + 1,
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
      const nxt = findNextUnlogged(currentKickIdx);
      setCurrentKickIdx(nxt >= 0 ? nxt : (findNextUnlogged(-1) >= 0 ? findNextUnlogged(-1) : plannedKicks.length - 1));
    } else {
      setSessionKicks((prev) => [...prev, kick]);
      // Auto-advance to next unlogged planned kick
      let nextIdx = currentKickIdx + 1;
      while (nextIdx < plannedKicks.length && isPlannedLogged(nextIdx)) {
        nextIdx++;
      }
      if (nextIdx < plannedKicks.length) {
        setCurrentKickIdx(nextIdx);
      }
    }

    setDistance("");
    setHangTime("");
    setDirection("1" as KickoffDirection);
    setShowAthleteDropdown(false);
  };

  const allKicksLogged = plannedKicks.length > 0 && sessionKicks.length >= plannedKicks.length;
  const isEditing = editingKickIdx !== null;
  const showEntryCard = (!allKicksLogged || isEditing) && plannedKicks[currentKickIdx];

  const handleDeleteKick = (idx: number) => {
    const deleted = sessionKicks[idx];
    setSessionKicks((prev) => prev.filter((_, i) => i !== idx));
    if (deleted?.kickNum) {
      setCurrentKickIdx(deleted.kickNum - 1);
      setEditingKickIdx(null);
    }
  };

  const handleRemoveFromPlan = () => {
    const kickNum = currentKickIdx + 1;
    const rowIdx = plannedRowIndices[currentKickIdx];
    setSessionKicks((prev) => prev.filter(k => k.kickNum !== kickNum));
    setPlannedKicks((prev) => prev.filter((_, i) => i !== currentKickIdx));
    const newRowIndices = plannedRowIndices.filter((_, i) => i !== currentKickIdx);
    setPlannedRowIndices(newRowIndices);
    if (rowIdx != null) {
      setRows((prev) => prev.filter((_, i) => i !== rowIdx));
      setPlannedRowIndices((prev) => prev.map(ri => ri > rowIdx ? ri - 1 : ri));
    }
    setSessionKicks((prev) => prev.map(k => {
      if (k.kickNum && k.kickNum > kickNum) return { ...k, kickNum: k.kickNum - 1 };
      return k;
    }));
    const newLen = plannedKicks.length - 1;
    if (newLen === 0) {
      setSessionActive(false);
    } else {
      setCurrentKickIdx(Math.min(currentKickIdx, newLen - 1));
    }
    setEditingKickIdx(null);
    setDistance("");
    setHangTime("");
    setDirection("1" as KickoffDirection);
  };

  const handleCommitReady = () => {
    if (sessionKicks.length === 0) return;
    setPendingKicks(sessionKicks);
  };

  const handleConfirmCommit = () => {
    if (!pendingKicks) return;
    commitPractice(pendingKicks, undefined, weather, sessionMode, opponent, gameTime);
    setCommittedKicks(pendingKicks);
    setPendingKicks(null);
    setCommitted(true);
    setSessionActive(false);
  };

  const handleBackToLog = () => {
    setSessionActive(false);
  };

  const handleNewSession = () => {
    setSessionKicks([]);
    setCommittedKicks([]);
    setPlannedKicks([]);
    setPlannedRowIndices([]);
    setCurrentKickIdx(0);
    setWeather("");
    setCommitted(false);
    setSessionActive(false);
    setSessionMode("practice");
    setOpponent("");
    setGameTime("");
  };

  const handleUndo = () => {
    const ok = undoLastCommit();
    if (!ok) alert("Nothing to undo");
  };

  const [clearUndoData, setClearUndoData] = useState<{ rows: typeof rows; sessionKicks: typeof sessionKicks; plannedKicks: typeof plannedKicks; plannedRowIndices: number[] } | null>(null);

  const clearLog = () => {
    setClearUndoData({ rows, sessionKicks, plannedKicks, plannedRowIndices });
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setErrorRows(new Set());
    setSessionKicks([]);
    setPlannedKicks([]);
    setPlannedRowIndices([]);
    setCurrentKickIdx(0);
  };

  const undoClear = () => {
    if (!clearUndoData) return;
    setRows(clearUndoData.rows);
    setSessionKicks(clearUndoData.sessionKicks);
    setPlannedKicks(clearUndoData.plannedKicks);
    setPlannedRowIndices(clearUndoData.plannedRowIndices);
    setClearUndoData(null);
  };

  // ════════════════════════════════════════════════════════════
  //  SESSION MODE — step-through card view
  // ════════════════════════════════════════════════════════════
  if (sessionActive) {
    const isGame = sessionMode === "game";
    return (
      <>
        <main className={clsx(
          "flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0",
          isGame && "bg-gradient-to-b from-red-950/30 to-transparent"
        )}>
          {/* Left: Entry card + Session log */}
          <div className={clsx(
            "lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r min-h-0",
            isGame ? "border-red-500/30" : "border-border"
          )}>
            {isGame && (
              <div className="bg-red-500 text-white px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 shrink-0 shadow-lg">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
                  </span>
                  <span className="text-sm font-black uppercase tracking-widest">GAME — KO</span>
                </div>
                {opponent && <span className="text-sm font-bold">vs {opponent}</span>}
                <span className="text-xs opacity-80">
                  {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {gameTime && ` · ${gameTime}`}
                </span>
              </div>
            )}
            <div className="overflow-y-auto border-b border-border">
              <div className="p-4 space-y-4">
                {committed ? (
                  <>
                    {/* ── Committed Recap ── */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-make uppercase tracking-wider">
                            {sessionMode === "game" ? "Game Committed" : "Session Committed"}
                          </p>
                          {sessionMode === "game" && opponent && (
                            <p className="text-lg font-black text-red-400 mt-1">vs {opponent}</p>
                          )}
                          <p className="text-lg font-bold text-slate-100 mt-1">
                            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                            {gameTime && <span className="text-muted text-sm font-normal"> · {gameTime}</span>}
                          </p>
                          {weather && <p className="text-xs text-muted mt-0.5">{weather}</p>}
                        </div>
                        <button
                          onClick={handleNewSession}
                          className="text-xs px-3 py-1.5 rounded-input border border-accent/50 text-accent hover:bg-accent/10 font-semibold transition-all"
                        >
                          ← Back to Log
                        </button>
                      </div>

                      {/* Per-athlete recap cards */}
                      {(() => {
                        const byAthlete: Record<string, KickoffEntry[]> = {};
                        sessionKicks.forEach((k) => {
                          if (!byAthlete[k.athlete]) byAthlete[k.athlete] = [];
                          byAthlete[k.athlete].push(k);
                        });
                        const athleteNames = Object.keys(byAthlete);
                        if (athleteNames.length === 0) return null;
                        return (
                          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                            {athleteNames.map((name) => {
                              const ak = byAthlete[name];
                              const att = ak.length;
                              const distEntries = ak.filter((k) => k.distance > 0);
                              const avgDist = distEntries.length > 0 ? (distEntries.reduce((s, k) => s + k.distance, 0) / distEntries.length).toFixed(1) : "—";
                              const hangEntries = ak.filter((k) => k.hangTime > 0);
                              const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, k) => s + k.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
                              const tbCount = ak.filter((k) => k.result === "TB" || k.landingZone === "TB").length;
                              return (
                                <div key={name} className="card-2 p-3">
                                  <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                                    <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{att}</span></div>
                                    <div><span className="text-muted">Dist</span> <span className="text-slate-200 font-medium ml-1">{avgDist}</span></div>
                                    <div><span className="text-muted">Hang</span> <span className="text-slate-200 font-medium ml-1">{avgHang}{avgHang !== "—" ? "s" : ""}</span></div>
                                    <div><span className="text-muted">TB</span> <span className="text-make font-medium ml-1">{tbCount}</span></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Full kickoff table */}
                      <div className="card-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="table-header text-left">#</th>
                              <th className="table-header text-left">Athlete</th>
                              <th className="table-header">Type</th>
                              <th className="table-header">Dist</th>
                              <th className="table-header">Hang</th>
                              <th className="table-header">Dir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessionKicks.map((k, i) => (
                              <tr key={i} className="hover:bg-surface/30 transition-colors">
                                <td className="table-cell text-left text-muted">{k.kickNum ?? i + 1}</td>
                                <td className="table-name">{k.athlete}</td>
                                <td className="table-cell text-muted">{koTypeLabels[k.type] ?? TYPE_LABELS[k.type] ?? k.type}</td>
                                <td className="table-cell">{k.distance > 0 ? `${k.distance} yd` : "—"}</td>
                                <td className="table-cell text-muted">{k.hangTime > 0 ? `${k.hangTime.toFixed(2)}s` : "—"}</td>
                                <td className="table-cell text-muted">{koDirLabels[k.direction] ?? k.direction}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                <>
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
                      {!allKicksLogged && !isEditing && (() => {
                        const nxt = findNextUnlogged(currentKickIdx);
                        return nxt >= 0 && plannedKicks[nxt] ? (
                          <span className="text-[10px] text-muted">
                            Next: {plannedKicks[nxt].athlete} — {koTypeLabels[plannedKicks[nxt].type] ?? TYPE_LABELS[plannedKicks[nxt].type] ?? plannedKicks[nxt].type}
                          </span>
                        ) : null;
                      })()}
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
                        const isLogged = isPlannedLogged(i);
                        const hex = colorMap[k.athlete];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setCurrentKickIdx(i);
                              setShowAthleteDropdown(false);
                              const logged = getLoggedKick(i);
                              if (logged) {
                                setDistance(String(logged.distance));
                                setHangTime(String(logged.hangTime));
                                setDirection(logged.direction);
                                setEditingKickIdx(getLoggedKickArrayIdx(i));
                              } else {
                                setDistance("");
                                setHangTime("");
                                setDirection("1" as KickoffDirection);
                                setEditingKickIdx(null);
                              }
                            }}
                            className="flex flex-col items-center gap-0.5 cursor-pointer transition-all"
                          >
                            <div
                              className={clsx(
                                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                                isCurrent && "ring-2 ring-white ring-offset-1 ring-offset-[var(--bg)]",
                                isLogged && "opacity-50"
                              )}
                              style={{
                                backgroundColor: hex,
                                color: "#0f172a",
                              }}
                            >
                              {isLogged ? "✓" : i + 1}
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
                      <div className="flex flex-wrap gap-1.5">
                        {koTypes.map(({ id, label }) => (
                          <button
                            key={id}
                            onClick={() => updateCurrentPlan("type", id)}
                            className={clsx(
                              "px-3 py-2 rounded-input text-xs font-semibold text-center transition-all",
                              currentPlan.type === id
                                ? "bg-accent/20 text-accent border border-accent/50"
                                : "bg-surface-2 text-muted border border-border hover:text-white"
                            )}
                          >
                            {label}
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
                          inputMode="numeric"
                          placeholder="sec"
                          value={hangTime}
                          onChange={handleAutoDecimalChange(setHangTime)}
                        />
                      </div>
                    </div>

                    {/* Direction */}
                    <div>
                      <p className="label">Direction</p>
                      <div className="flex flex-wrap gap-2">
                        {koDirs.map(({ id, label }) => (
                          <button
                            key={id}
                            onClick={() => setDirection(id as KickoffDirection)}
                            className={clsx(
                              "px-3 py-3 rounded-input text-xs font-bold border transition-all",
                              direction === id
                                ? "bg-accent/20 text-accent border-accent/50"
                                : "bg-surface-2 text-muted border-border hover:text-white"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Log button + Remove */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleLogKick}
                        disabled={false}
                        className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        LOG KICKOFF
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove kickoff #${currentKickIdx + 1} (${currentPlan.athlete}) from the plan?`)) {
                            handleRemoveFromPlan();
                          }
                        }}
                        className="px-3 py-3 rounded-input text-xs border border-miss/30 text-miss/60 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                        title="Remove this kickoff from plan"
                      >
                        ✕
                      </button>
                    </div>
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
                </>
                )}
              </div>
            </div>

            {!committed && (
              <>
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
              </>
            )}

            {/* Footer */}
            <div className="border-t border-border p-3 flex items-center gap-2 shrink-0 flex-wrap">
              {committed ? (
                <button
                  onClick={handleNewSession}
                  className="btn-primary text-xs py-2 px-5 ml-auto"
                >
                  ← Back to Log
                </button>
              ) : (
                <>
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
                </>
              )}
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

  // ── Committed recap ──
  if (committed && committedKicks.length > 0) {
    return (
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-4xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-make uppercase tracking-wider">
                {sessionMode === "game" ? "Game Committed" : "Practice Committed"}
              </p>
              <p className="text-lg font-bold text-slate-100 mt-1">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </p>
              {weather && <p className="text-xs text-muted mt-0.5">{weather}</p>}
            </div>
            <button onClick={handleNewSession} className="text-xs px-3 py-1.5 rounded-input border border-accent/50 text-accent hover:bg-accent/10 font-semibold transition-all">
              ← Back to Log
            </button>
          </div>
          {/* Per-athlete recap */}
          {(() => {
            const byAthlete: Record<string, KickoffEntry[]> = {};
            committedKicks.forEach((k) => { if (!byAthlete[k.athlete]) byAthlete[k.athlete] = []; byAthlete[k.athlete].push(k); });
            return Object.entries(byAthlete).map(([name, ak]) => {
              const att = ak.length;
              const distEntries = ak.filter((k) => k.distance > 0);
              const avgDist = distEntries.length > 0 ? (distEntries.reduce((s, k) => s + k.distance, 0) / distEntries.length).toFixed(1) : "—";
              const hangEntries = ak.filter((k) => k.hangTime > 0);
              const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, k) => s + k.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
              return (
                <div key={name} className="card-2 p-3">
                  <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                    <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{att}</span></div>
                    <div><span className="text-muted">Dist</span> <span className="text-slate-200 font-medium ml-1">{avgDist}</span></div>
                    <div><span className="text-muted">Hang</span> <span className="text-slate-200 font-medium ml-1">{avgHang}{avgHang !== "—" ? "s" : ""}</span></div>
                  </div>
                </div>
              );
            });
          })()}
          {/* Full kick table */}
          <div className="card-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header text-left">#</th>
                  <th className="table-header text-left">Athlete</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Dist</th>
                  <th className="table-header">Hang</th>
                  <th className="table-header">Dir</th>
                </tr>
              </thead>
              <tbody>
                {committedKicks.map((k, i) => (
                  <tr key={i} className="hover:bg-surface/30 transition-colors">
                    <td className="table-cell text-left text-muted">{k.kickNum ?? i + 1}</td>
                    <td className="table-name">{k.athlete}</td>
                    <td className="table-cell text-muted">{koTypeLabels[k.type] ?? k.type}</td>
                    <td className="table-cell">{k.distance > 0 ? `${k.distance} yd` : "—"}</td>
                    <td className="table-cell text-muted">{k.hangTime > 0 ? `${k.hangTime.toFixed(2)}s` : "—"}</td>
                    <td className="table-cell text-muted">{koDirLabels[k.direction] ?? k.direction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleNewSession} className="btn-primary w-full py-3 text-sm font-bold">← Back to Log</button>
        </div>
      </main>
    );
  }

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
          {/* Practice / Game mode toggle + Live / Manual toggle */}
          {!isAthlete && !isContinuing && (
            <div className={clsx(
              "px-4 py-2 border-b shrink-0 space-y-2 transition-colors",
              sessionMode === "game" ? "bg-red-500/10 border-red-500/40" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <div className="flex rounded-input border border-border overflow-hidden">
                  <button
                    onClick={() => setSessionMode("practice")}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-semibold transition-colors",
                      sessionMode === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                    )}
                  >
                    Practice
                  </button>
                  <button
                    onClick={() => setSessionMode("game")}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-semibold transition-colors border-l border-border",
                      sessionMode === "game" ? "bg-red-500 text-white" : "text-red-400/60 hover:text-red-400"
                    )}
                  >
                    GAME
                  </button>
                </div>
                <div className="flex rounded-input border border-border overflow-hidden">
                  <button
                    onClick={() => { if (sessionMode !== "game") setManualEntry(false); }}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-semibold transition-colors",
                      !manualEntry ? "bg-accent text-slate-900" : "text-muted hover:text-white",
                      sessionMode === "game" && "opacity-40 cursor-not-allowed"
                    )}
                  >
                    Live Mode
                  </button>
                  <button
                    onClick={() => setManualEntry(true)}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-semibold transition-colors border-l border-border",
                      manualEntry ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                    )}
                  >
                    Manual Entry
                  </button>
                </div>
              </div>
              {sessionMode === "game" && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    placeholder="vs Opponent"
                    className="bg-surface-2 border border-red-500/40 text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-red-500/60 placeholder:text-muted"
                  />
                  <input
                    type="text"
                    value={gameTime}
                    onChange={(e) => setGameTime(e.target.value)}
                    placeholder="Game time (e.g. 7:00 PM)"
                    className="bg-surface-2 border border-red-500/40 text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-red-500/60 placeholder:text-muted"
                  />
                </div>
              )}
            </div>
          )}
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0">
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              {!manualEntry && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
              )}
              {sessionMode === "game" ? (manualEntry ? "Game Log" : "Live Game Log") : (manualEntry ? "Practice Log" : "Live Practice Log")}
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
                  {manualEntry && sessionMode === "game" && (
                    <>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">Dist</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">HT</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-12 border-b border-red-500/40 text-[10px]">Return</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-10 border-b border-red-500/40 text-[10px]" title="Touchback">TB</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">Dir</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">Save</th>
                    </>
                  )}
                  {manualEntry && sessionMode !== "game" && (
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
                          <span className="text-xs text-slate-400 text-center block">{koTypeLabels[row.type] ?? TYPE_LABELS[row.type as KickoffType] ?? row.type}</span>
                        ) : (
                          <select
                            value={row.type}
                            onChange={(e) => updateRow(idx, "type", e.target.value)}
                            disabled={isAthlete}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {koTypes.map(({ id, label }) => (
                              <option key={id} value={id}>{label}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      {manualEntry && sessionMode === "game" && (() => {
                        const isSaved = sessionKicks.some((k) => k.kickNum === filledIdx + 1);
                        return (
                          <>
                            <td className="py-1 px-1">
                              <input
                                type="text" inputMode="numeric" pattern="[0-9]*" placeholder="yds"
                                value={row.distance}
                                onChange={(e) => updateRow(idx, "distance", e.target.value)}
                                readOnly={isAthlete || isSaved}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text" inputMode="decimal" placeholder="sec"
                                value={row.hangTime}
                                onChange={(e) => {
                                  const digits = e.target.value.replace(/\D/g, "");
                                  updateRow(idx, "hangTime", digits ? formatAutoDecimal(digits) : "");
                                }}
                                readOnly={isAthlete || isSaved}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text" inputMode="numeric" pattern="[0-9]*" placeholder="ret"
                                value={row.returnYards ?? ""}
                                onChange={(e) => updateRow(idx, "returnYards", e.target.value)}
                                readOnly={isAthlete || isSaved || !!row.touchback}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : row.touchback ? "border-border/30 text-muted" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            <td className="py-1 px-1 text-center">
                              <input
                                type="checkbox"
                                checked={!!row.touchback}
                                disabled={isAthlete || isSaved}
                                onChange={(e) => updateRow(idx, "touchback", e.target.checked)}
                                title="Touchback"
                                className="w-4 h-4 accent-red-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-1 px-1">
                              <select
                                value={row.direction}
                                onChange={(e) => updateRow(idx, "direction", e.target.value)}
                                disabled={isAthlete || isSaved}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              >
                                <option value="">—</option>
                                {koDirs.map(({ id, label }) => (
                                  <option key={id} value={id}>{label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-1 px-1 text-center">
                              {isSaved ? (
                                <button
                                  onClick={() => handleUnsaveGameRow(idx)}
                                  className="text-[10px] px-1 text-make/60 hover:text-miss transition-colors"
                                  title="Unlock this kickoff"
                                >
                                  ✓ Saved
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSaveGameRow(idx)}
                                  disabled={isAthlete || !row.athlete}
                                  className="text-[10px] px-2 py-1 rounded bg-red-500 text-white font-bold hover:bg-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Save
                                </button>
                              )}
                            </td>
                          </>
                        );
                      })()}
                      {manualEntry && sessionMode !== "game" && (
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
                              {koDirs.map(({ id, label }) => (
                                <option key={id} value={id}>{label}</option>
                              ))}
                            </select>
                          </td>
                        </>
                      )}
                      <td className="py-1 px-1 text-center">
                        {isLocked ? (
                          !isAthlete && (
                            <div className="flex items-center gap-0.5 justify-center">
                              {sessionMode === "game" ? (
                                <button
                                  onClick={() => handleUnsaveGameRow(idx)}
                                  className="text-accent/60 hover:text-accent transition-colors text-[10px] leading-none px-1"
                                  title="Unlock this kickoff for editing"
                                >
                                  ✏️
                                </button>
                              ) : (
                                <>
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
                                      } else {
                                        setDistance("");
                                        setHangTime("");
                                        setDirection("1" as KickoffDirection);
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
                                </>
                              )}
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
                {clearUndoData && (
                  <button
                    onClick={undoClear}
                    className="text-xs py-1.5 px-3 rounded-input border border-accent/50 text-accent hover:bg-accent/10 font-semibold transition-all"
                  >
                    Undo Clear
                  </button>
                )}
              </div>
              {sessionMode === "game" ? (
                <button
                  onClick={handleCommitReady}
                  disabled={sessionKicks.length === 0}
                  className="btn-primary text-xs py-2 px-5 bg-red-500 hover:bg-red-400 disabled:opacity-40"
                >
                  Commit Game{sessionKicks.length > 0 ? ` (${sessionKicks.length})` : ""}
                </button>
              ) : manualEntry && !isContinuing ? (
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

        {/* Right: Field view (game) or Season stats */}
        <div className={clsx("lg:w-[40%] overflow-y-auto p-4 space-y-3", sessionMode === "game" && "bg-gradient-to-b from-red-950/20 to-transparent")}>
          {sessionMode === "game" ? (
            <>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                Game Chart · {sessionKicks.length} kickoff{sessionKicks.length !== 1 ? "s" : ""}
              </p>
              {(() => {
                const kicks = sessionKicks;
                const sAtt = kicks.length;
                const distCount = kicks.filter((k) => k.distance > 0).length;
                const avgDistG = distCount > 0 ? (kicks.reduce((s, k) => s + k.distance, 0) / distCount).toFixed(1) : "—";
                const htCount = kicks.filter((k) => k.hangTime > 0).length;
                const avgHangG = htCount > 0 ? (kicks.reduce((s, k) => s + k.hangTime, 0) / htCount).toFixed(2) : "—";
                const dirToNum = (d: string): number | null => d === "1" ? 1 : d === "0.5" ? 0.5 : d === "OB" ? 0 : null;
                const dirVals = kicks.map((k) => dirToNum(k.direction)).filter((v): v is number => v != null);
                const dirPct = dirVals.length > 0 ? `${Math.round((dirVals.reduce((s, v) => s + v, 0) / dirVals.length) * 100)}%` : "—";
                const totalRet = kicks.reduce((s, k) => s + (k.returnYards || 0), 0);
                const avgRet = sAtt > 0 ? (totalRet / sAtt).toFixed(1) : "—";
                if (sAtt === 0) {
                  return <p className="text-xs text-muted">Save a kickoff to see it on the field.</p>;
                }
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Avg Dist" value={avgDistG} accent glow />
                    <StatCard label="Avg Hang" value={avgHangG !== "—" ? `${avgHangG}s` : "—"} />
                    <StatCard label="Dir %" value={dirPct} />
                    <StatCard label="Avg Ret" value={avgRet} />
                  </div>
                );
              })()}
              <KickoffFieldView kicks={sessionKicks.filter((k) => k.los != null && k.landingYL != null)} />
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="TB Rate" value={tbRate} accent glow />
                <StatCard label="Avg Dist" value={avgDist ? `${avgDist} yd` : "—"} />
                <StatCard label="Avg Hang" value={avgHang ? `${avgHang}s` : "—"} />
              </div>
              <ZoneBarChart data={zoneData} />
            </>
          )}
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
