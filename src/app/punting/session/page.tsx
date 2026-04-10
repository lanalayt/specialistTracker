"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePunt } from "@/lib/puntContext";
import { StatCard } from "@/components/ui/StatCard";
import { PuntSessionLog } from "@/components/ui/PuntSessionLog";
import { PuntSessionSummary } from "@/components/ui/PuntSessionSummary";
import { PuntFieldStrip } from "@/components/ui/PuntFieldStrip";
import { PuntFieldView } from "@/components/ui/PuntFieldView";
import type { PuntEntry, PuntType, PuntHash, PuntLandingZone } from "@/types";
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

// Pooch punt types are tracked separately — distance is not counted in
// overall averages. Instead we track the yard line where the ball landed.
function isPoochType(type: string | undefined | null): boolean {
  if (!type) return false;
  return type.toUpperCase().includes("POOCH");
}

// Parse a yard-line input into an absolute field position 0..100
// where 0 = own goal line and 100 = opponent goal line.
//
// Sign convention:
//   "-20"  = own 20     → 20
//   "+25"  = opponent 25 → 75 (100 - 25)
//   "50"   = midfield    → 50
//   "20"   = own 20 (default to own side if no sign)
//   "0"    = own goal    → 0
//
// Returns NaN for invalid input (caller should handle).
// defaultSide: "-" = own side (use for LOS), "+" = opponent side (use for landing YL)
function parseYardLine(input: string | undefined | null, defaultSide: "-" | "+" = "-"): number {
  if (input == null) return NaN;
  const trimmed = String(input).trim();
  if (!trimmed) return NaN;
  const match = trimmed.match(/^([+-]?)(\d+)$/);
  if (!match) return NaN;
  const sign = match[1] || defaultSide;
  const n = parseInt(match[2], 10);
  if (isNaN(n) || n < 0 || n > 50) return NaN;
  return sign === "-" ? n : 100 - n;
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
  poochYL?: string;
  starred?: boolean;
  // Game-mode only
  los?: string;
  landingYL?: string;
  returnYards?: string;
  fairCatch?: boolean;
  touchback?: boolean;
}

interface PartialPuntInput {
  yards: string;
  hangTime: string;
  opTime: string;
  directionalAccuracy: 0 | 0.5 | 1;
  starred: boolean;
  poochYL?: string;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedPunts: { athlete: string; type: PuntType; hash: PuntHash; starred?: boolean }[];
  plannedRowIndices: number[];
  currentPuntIdx: number;
  sessionPunts: PuntEntry[];
  partialInputs?: Record<number, PartialPuntInput>;
  committed?: boolean;
  committedWeather?: string;
  committedPunts?: PuntEntry[];
  sessionMode?: "practice" | "game";
  opponent?: string;
  gameTime?: string;
}

const emptyRow = (): LogRow => ({
  athlete: "",
  type: "",
  hash: "",
  yards: "",
  hangTime: "",
  opTime: "",
  directionalAccuracy: "",
  poochYL: "",
  starred: false,
  los: "",
  landingYL: "",
  returnYards: "",
  fairCatch: false,
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

const DEFAULT_DA_OPTIONS = [
  { value: "1", label: "1.0 ✓" },
  { value: "0.5", label: "0.5" },
  { value: "0", label: "0 ★" },
];

function loadDirectionSettings(): { enabled: boolean; options: { value: string; label: string }[] } {
  if (typeof window === "undefined") return { enabled: true, options: DEFAULT_DA_OPTIONS };
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      const enabled = parsed.directionEnabled !== false;
      const options = parsed.directionOptions?.length > 0
        ? parsed.directionOptions.map((d: { id: string; label: string }) => ({ value: d.id, label: d.label }))
        : DEFAULT_DA_OPTIONS;
      return { enabled, options };
    }
  } catch {}
  return { enabled: true, options: DEFAULT_DA_OPTIONS };
}

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
  const [sessionPunts, setSessionPunts] = useState<PuntEntry[]>(() =>
    (draft.sessionPunts ?? []).map((p, i) => p.kickNum != null ? p : { ...p, kickNum: i + 1 })
  );
  const [pendingPunts, setPendingPunts] = useState<PuntEntry[] | null>(null);
  const [committed, setCommitted] = useState(draft.committed ?? false);
  const [committedPunts, setCommittedPunts] = useState<PuntEntry[]>(draft.committedPunts ?? []);
  const [sessionMode, setSessionMode] = useState<"practice" | "game">(() => {
    if ((draft.sessionPunts?.length > 0 || draft.sessionActive || draft.committed) && draft.sessionMode === "game") {
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
  const [puntTypes, setPuntTypes] = useState(() => loadPuntTypes());
  const [dirSettings] = useState(() => loadDirectionSettings());
  const dirEnabled = dirSettings.enabled;
  const DA_OPTIONS = dirSettings.options;
  const typeLabels: Record<string, string> = {};
  puntTypes.forEach((t) => { typeLabels[t.id] = t.label; });
  const drag = useDragReorder(rows, setRows);
  const [weather, setWeather] = useState(draft.committedWeather ?? "");
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
      if (cloudDraft.partialInputs) setPartialInputs(cloudDraft.partialInputs);
      setCommitted(cloudDraft.committed ?? false);
      if (cloudDraft.committedWeather != null) setWeather(cloudDraft.committedWeather);
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
            setCommitted(cloudDraft.committed ?? false);
            if (cloudDraft.committedWeather != null) setWeather(cloudDraft.committedWeather);
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
  const [partialInputs, setPartialInputs] = useState<Record<number, PartialPuntInput>>(draft.partialInputs ?? {});
  const initPartial = draft.partialInputs?.[draft.currentPuntIdx];
  const [yards, setYards] = useState(initPartial?.yards ?? "");
  const [hangTime, setHangTime] = useState(initPartial?.hangTime ?? "");
  const [opTime, setOpTime] = useState(initPartial?.opTime ?? "");
  const [directionalAccuracy, setDirectionalAccuracy] = useState<0 | 0.5 | 1>(initPartial?.directionalAccuracy ?? 1);
  const [starred, setStarred] = useState(initPartial?.starred ?? false);
  // Game-mode only: LOS and Landing yard line (absolute 0..100 field positions)
  const [los, setLos] = useState<string>("");
  const [landingYL, setLandingYL] = useState<string>("");
  const [returnYardsInput, setReturnYardsInput] = useState<string>("");
  // Pooch punt only: yard line where ball landed (practice log mode)
  const [poochYL, setPoochYL] = useState<string>(initPartial?.poochYL ?? "");

  // Persist draft on every relevant state change
  useEffect(() => {
    lastLocalSave.current = Date.now();
    // Merge current input fields into partialInputs for the active punt
    const mergedPartials = sessionActive && !isPlannedLogged(currentPuntIdx)
      ? { ...partialInputs, [currentPuntIdx]: { yards, hangTime, opTime, directionalAccuracy, starred } }
      : partialInputs;
    saveDraft({
      rows,
      manualEntry,
      sessionActive,
      plannedPunts,
      plannedRowIndices,
      currentPuntIdx,
      sessionPunts,
      partialInputs: mergedPartials,
      committed,
      committedWeather: committed ? weather : undefined,
      committedPunts: committed ? committedPunts : undefined,
      sessionMode,
      opponent,
      gameTime,
    });
  }, [rows, manualEntry, sessionActive, plannedPunts, plannedRowIndices, currentPuntIdx, sessionPunts, partialInputs, yards, hangTime, opTime, directionalAccuracy, starred, committed, committedPunts, weather, sessionMode, opponent, gameTime]);

  // ── Kick numbering helpers (track by planned position) ──────
  const loggedKickNums = new Set(sessionPunts.map(p => p.kickNum));
  const isPlannedLogged = (i: number) => loggedKickNums.has(i + 1);
  const getLoggedPunt = (i: number) => sessionPunts.find(p => p.kickNum === i + 1);
  const getLoggedPuntArrayIdx = (i: number) => sessionPunts.findIndex(p => p.kickNum === i + 1);
  const findNextUnlogged = (after: number = -1) => {
    for (let j = after + 1; j < plannedPunts.length; j++) {
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
    r.athlete || r.type || r.hash || r.yards || r.hangTime || r.opTime || r.directionalAccuracy || r.poochYL;

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
    isContinuing ? filledIndices.filter((_, pi) => sessionPunts.some(p => p.kickNum === pi + 1)) : []
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
      const firstUnlogged = planned.findIndex((_, i) => !sessionPunts.some(p => p.kickNum === i + 1));
      setCurrentPuntIdx(firstUnlogged >= 0 ? firstUnlogged : planned.length - 1);
    } else {
      setCurrentPuntIdx(0);
      setSessionPunts([]);
    }

    const startIdx = isContinuing
      ? (planned.findIndex((_, i) => !sessionPunts.some(p => p.kickNum === i + 1)) ?? 0)
      : 0;
    setYards("");
    setHangTime("");
    setOpTime("");
    setDirectionalAccuracy(1);
    setStarred(!!planned[startIdx >= 0 ? startIdx : 0]?.starred);
    setSessionActive(true);
  };

  // ── Unlock a locked row (remove its logged result and all after) ──
  const handleUnlockRow = (filledIdx: number) => {
    setSessionPunts((prev) => prev.filter(p => (p.kickNum ?? 0) < filledIdx + 1));
  };

  // ── Manual Entry: commit directly from table ─────────────────
  // ── Game mode: save a single row to sessionPunts without committing the whole session ──
  const handleSaveGameRow = (rowIdx: number) => {
    const r = rows[rowIdx];
    if (!r || !r.athlete) {
      setErrorRows((prev) => new Set([...prev, rowIdx]));
      return;
    }
    const losVal = parseYardLine(r.los, "-");      // LOS defaults to own side
    const landingYLVal = parseYardLine(r.landingYL, "+"); // Landing defaults to opponent side
    if (isNaN(losVal) || isNaN(landingYLVal)) {
      alert("Yard lines must be 0–50.\nLOS: use - for own side (default), + for opponent.\nLanding: no sign or + for opponent side (default), - for own side.\nExamples: LOS=-20, Landing=25 or +25");
      setErrorRows((prev) => new Set([...prev, rowIdx]));
      return;
    }
    const gross = Math.max(0, landingYLVal - losVal);
    const htVal = parseFloat(r.hangTime) || 0;
    const retVal = r.returnYards !== "" && r.returnYards != null ? parseInt(r.returnYards) || 0 : undefined;
    const daVal = r.directionalAccuracy !== "" && r.directionalAccuracy != null ? (parseFloat(r.directionalAccuracy) as 0 | 0.5 | 1) : 1;
    // Auto-detect touchback: landing YL of 0 = into the end zone = touchback
    const isTouchback = r.touchback || landingYLVal >= 100;
    // Filled index (position among filled rows)
    const filledIdx = filledIndices.indexOf(rowIdx);
    const kickNum = filledIdx >= 0 ? filledIdx + 1 : sessionPunts.length + 1;
    // Build landing zones
    const zones: PuntLandingZone[] = [];
    if (isTouchback) zones.push("TB");
    else if (r.fairCatch) zones.push("fairCatch");
    const punt: PuntEntry = {
      athleteId: r.athlete,
      athlete: r.athlete,
      type: r.type as PuntType,
      hash: r.hash as PuntHash,
      yards: gross,
      hangTime: htVal,
      opTime: 0,
      landingZones: zones,
      directionalAccuracy: daVal,
      kickNum,
      los: losVal,
      landingYL: landingYLVal,
      returnYards: isTouchback ? 0 : (r.fairCatch ? 0 : retVal),
      fairCatch: r.fairCatch || undefined,
      touchback: isTouchback || undefined,
    };
    setSessionPunts((prev) => {
      // Replace if already saved for this kickNum, else append
      const existing = prev.findIndex((p) => p.kickNum === kickNum);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = punt;
        return next;
      }
      return [...prev, punt];
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
    setSessionPunts((prev) => prev.filter((p) => p.kickNum !== kickNum));
  };

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

    const punts: PuntEntry[] = filled.map(({ r }) => {
      const isPooch = isPoochType(r.type);
      return {
        athleteId: r.athlete,
        athlete: r.athlete,
        type: r.type as PuntType,
        hash: r.hash as PuntHash,
        // Pooch punts: no distance contribution
        yards: isPooch ? 0 : (parseInt(r.yards) || 0),
        hangTime: parseFloat(r.hangTime) || 0,
        opTime: parseFloat(r.opTime) || 0,
        landingZones: [],
        directionalAccuracy: parseFloat(r.directionalAccuracy) as 0 | 0.5 | 1,
        starred: r.starred || undefined,
        poochLandingYardLine: isPooch && r.poochYL ? (parseInt(r.poochYL) || 0) : undefined,
      };
    });

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
    const htVal = parseFloat(hangTime) || 0;
    const otVal = parseFloat(opTime) || 0;
    const losVal = los !== "" ? parseInt(los) || 0 : undefined;
    const landingYLVal = landingYL !== "" ? parseInt(landingYL) || 0 : undefined;
    // In game mode, compute gross yards automatically from LOS and landing YL
    let ydsVal = parseInt(yards) || 0;
    let retVal: number | undefined = undefined;
    if (sessionMode === "game" && losVal != null && landingYLVal != null) {
      ydsVal = Math.max(0, landingYLVal - losVal);
      retVal = returnYardsInput !== "" ? parseInt(returnYardsInput) || 0 : undefined;
    }
    // Pooch punts (practice mode): don't track distance — track landing YL only
    const isPooch = isPoochType(plan.type);
    let poochYLVal: number | undefined = undefined;
    if (isPooch && sessionMode !== "game") {
      poochYLVal = poochYL !== "" ? parseInt(poochYL) || 0 : undefined;
      ydsVal = 0; // pooch punts do not contribute to distance averages
    }
    // Auto-detect touchback: landing at opponent's end zone (field pos >= 100)
    const isTouchback = landingYLVal != null && landingYLVal >= 100;
    const liveZones: PuntLandingZone[] = [];
    if (isTouchback) liveZones.push("TB");
    const punt: PuntEntry = {
      athleteId: plan.athlete,
      athlete: plan.athlete,
      type: plan.type,
      hash: plan.hash,
      yards: ydsVal,
      hangTime: htVal,
      opTime: otVal,
      landingZones: liveZones,
      directionalAccuracy,
      starred: starred || undefined,
      kickNum: currentPuntIdx + 1,
      los: losVal,
      landingYL: landingYLVal,
      returnYards: isTouchback ? 0 : retVal,
      poochLandingYardLine: poochYLVal,
      touchback: isTouchback || undefined,
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
      const nxt = findNextUnlogged(currentPuntIdx);
      setCurrentPuntIdx(nxt >= 0 ? nxt : (findNextUnlogged(-1) >= 0 ? findNextUnlogged(-1) : plannedPunts.length - 1));
    } else {
      setSessionPunts((prev) => [...prev, punt]);
      // Auto-advance to next unlogged planned punt
      let nextIdx = currentPuntIdx + 1;
      while (nextIdx < plannedPunts.length && isPlannedLogged(nextIdx)) {
        nextIdx++;
      }
      if (nextIdx < plannedPunts.length) {
        setCurrentPuntIdx(nextIdx);
      }
    }

    // Clear partial for logged punt, load partial for next punt if it exists
    let advanceIdx: number;
    if (editingPuntIdx !== null) {
      const nxt = findNextUnlogged(currentPuntIdx);
      advanceIdx = nxt >= 0 ? nxt : (findNextUnlogged(-1) >= 0 ? findNextUnlogged(-1) : currentPuntIdx);
    } else {
      let ni = currentPuntIdx + 1;
      while (ni < plannedPunts.length && isPlannedLogged(ni)) ni++;
      advanceIdx = ni < plannedPunts.length ? ni : currentPuntIdx;
    }
    setPartialInputs((prev) => {
      const next = { ...prev };
      delete next[currentPuntIdx];
      return next;
    });
    const nextPartial = partialInputs[advanceIdx];
    if (nextPartial) {
      setYards(nextPartial.yards);
      setHangTime(nextPartial.hangTime);
      setOpTime(nextPartial.opTime);
      setDirectionalAccuracy(nextPartial.directionalAccuracy);
      setStarred(nextPartial.starred);
    } else {
      setYards("");
      setHangTime("");
      setOpTime("");
      setDirectionalAccuracy(1);
      setStarred(!!plannedPunts[advanceIdx]?.starred);
      setPoochYL("");
    }
    // Game mode: after logging, seed next LOS with (landingYL - returnYards),
    // and clear landing YL + return for the next punt.
    if (sessionMode === "game") {
      const landed = landingYL !== "" ? parseInt(landingYL) || 0 : undefined;
      const ret = returnYardsInput !== "" ? parseInt(returnYardsInput) || 0 : 0;
      if (landed != null) {
        // Next punting team LOS = where the return ended = landing - return
        setLos(String(Math.max(0, landed - ret)));
      }
      setLandingYL("");
      setReturnYardsInput("");
    }
    setShowAthleteDropdown(false);
  };

  const allPuntsLogged = plannedPunts.length > 0 && sessionPunts.length >= plannedPunts.length;
  const isEditing = editingPuntIdx !== null;
  const showEntryCard = (!allPuntsLogged || isEditing) && plannedPunts[currentPuntIdx];

  const handleDeletePunt = (idx: number) => {
    const deleted = sessionPunts[idx];
    setSessionPunts((prev) => prev.filter((_, i) => i !== idx));
    if (deleted?.kickNum) {
      setCurrentPuntIdx(deleted.kickNum - 1);
      setEditingPuntIdx(null);
    }
  };

  const handleRemoveFromPlan = () => {
    const kickNum = currentPuntIdx + 1;
    const rowIdx = plannedRowIndices[currentPuntIdx];
    setSessionPunts((prev) => prev.filter(p => p.kickNum !== kickNum));
    setPlannedPunts((prev) => prev.filter((_, i) => i !== currentPuntIdx));
    const newRowIndices = plannedRowIndices.filter((_, i) => i !== currentPuntIdx);
    setPlannedRowIndices(newRowIndices);
    if (rowIdx != null) {
      setRows((prev) => prev.filter((_, i) => i !== rowIdx));
      setPlannedRowIndices((prev) => prev.map(ri => ri > rowIdx ? ri - 1 : ri));
    }
    setSessionPunts((prev) => prev.map(p => {
      if (p.kickNum && p.kickNum > kickNum) return { ...p, kickNum: p.kickNum - 1 };
      return p;
    }));
    const newLen = plannedPunts.length - 1;
    if (newLen === 0) {
      setSessionActive(false);
    } else {
      setCurrentPuntIdx(Math.min(currentPuntIdx, newLen - 1));
    }
    setEditingPuntIdx(null);
    setYards("");
    setHangTime("");
    setOpTime("");
    setDirectionalAccuracy(1);
  };

  const handleCommitReady = () => {
    if (sessionPunts.length === 0) return;
    setPendingPunts(sessionPunts);
  };

  const handleConfirmCommit = () => {
    if (!pendingPunts) return;
    commitPractice(pendingPunts, undefined, weather, sessionMode, opponent, gameTime);
    setCommittedPunts(pendingPunts);
    setPendingPunts(null);
    setCommitted(true);
    setSessionActive(false);
  };

  const handleBackToLog = () => {
    setSessionActive(false);
  };

  const handleNewSession = () => {
    setSessionPunts([]);
    setCommittedPunts([]);
    setPlannedPunts([]);
    setPlannedRowIndices([]);
    setCurrentPuntIdx(0);
    setPartialInputs({});
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
    setPartialInputs({});
    setShowReset(false);
  };

  const clearLog = () => {
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setErrorRows(new Set());
    setSessionPunts([]);
    setPlannedPunts([]);
    setPlannedRowIndices([]);
    setCurrentPuntIdx(0);
    setPartialInputs({});
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
                  <span className="text-sm font-black uppercase tracking-widest">GAME — PUNT</span>
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
                        const byAthlete: Record<string, PuntEntry[]> = {};
                        sessionPunts.forEach((p) => {
                          if (!byAthlete[p.athlete]) byAthlete[p.athlete] = [];
                          byAthlete[p.athlete].push(p);
                        });
                        const athleteNames = Object.keys(byAthlete);
                        if (athleteNames.length === 0) return null;
                        return (
                          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                            {athleteNames.map((name) => {
                              const ap = byAthlete[name];
                              const att = ap.length;
                              const yardsEntries = ap.filter((p) => p.yards > 0);
                              const avgDist = yardsEntries.length > 0 ? (yardsEntries.reduce((s, p) => s + p.yards, 0) / yardsEntries.length).toFixed(1) : "—";
                              const hangEntries = ap.filter((p) => p.hangTime > 0);
                              const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, p) => s + p.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
                              const otEntries = ap.filter((p) => (p.opTime || 0) > 0);
                              const avgOT = otEntries.length > 0 ? (otEntries.reduce((s, p) => s + (p.opTime || 0), 0) / otEntries.length).toFixed(2) : "—";
                              const daEntries = ap.filter((p) => p.directionalAccuracy != null && p.directionalAccuracy >= 0);
                              const dirPct = daEntries.length > 0 ? `${Math.round((daEntries.reduce((s, p) => s + p.directionalAccuracy, 0) / daEntries.length) * 100)}%` : "—";
                              const dirScore = daEntries.reduce((s, p) => s + p.directionalAccuracy, 0);
                              const dirScoreDisplay = daEntries.length > 0 ? `${dirScore % 1 === 0 ? dirScore : dirScore.toFixed(1)}/${daEntries.length}` : "—";
                              const criticals = ap.filter((p) => p.directionalAccuracy === 0).length;
                              return (
                                <div key={name} className="card-2 p-3">
                                  <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                                    <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{att}</span></div>
                                    <div><span className="text-muted">Dist</span> <span className="text-slate-200 font-medium ml-1">{avgDist}</span></div>
                                    <div><span className="text-muted">Hang</span> <span className="text-slate-200 font-medium ml-1">{avgHang}{avgHang !== "—" ? "s" : ""}</span></div>
                                    <div><span className="text-muted">OT</span> <span className="text-slate-200 font-medium ml-1">{avgOT}{avgOT !== "—" ? "s" : ""}</span></div>
                                    <div><span className="text-muted">Dir%</span> <span className="text-accent font-medium ml-1">{dirPct}</span></div>
                                    <div><span className="text-muted">Dir Score</span> <span className="text-slate-200 font-medium ml-1">{dirScoreDisplay}</span></div>
                                    <div><span className="text-muted">Crit</span> <span className={`font-medium ml-1 ${criticals > 0 ? "text-miss" : "text-slate-200"}`}>{criticals}</span></div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Full punt table */}
                      <div className="card-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="table-header text-left">#</th>
                              <th className="table-header text-left">Athlete</th>
                              <th className="table-header">Type</th>
                              <th className="table-header">Yds</th>
                              <th className="table-header">Hang</th>
                              <th className="table-header">OT</th>
                              <th className="table-header">Dir</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessionPunts.map((p, i) => (
                              <tr key={i} className="hover:bg-surface/30">
                                <td className="table-cell text-left text-muted">{p.kickNum ?? i + 1}{p.starred ? <span className="text-amber-400"> ★</span> : ""}</td>
                                <td className="table-name">{p.athlete}</td>
                                <td className="table-cell text-muted">{typeLabels[p.type] ?? (p.type || "—")}</td>
                                <td className="table-cell">{p.yards > 0 ? `${p.yards} yd` : "—"}</td>
                                <td className="table-cell text-muted">{p.hangTime > 0 ? `${p.hangTime.toFixed(2)}s` : "—"}</td>
                                <td className="table-cell text-muted">{(p.opTime || 0) > 0 ? `${p.opTime.toFixed(2)}s` : "—"}</td>
                                <td className={`table-cell font-bold ${p.directionalAccuracy === 1 ? "text-make" : p.directionalAccuracy === 0 ? "text-miss" : "text-amber-400"}`}>{p.directionalAccuracy != null ? (p.directionalAccuracy === 0.5 ? "0.5" : p.directionalAccuracy) : "—"}</td>
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
                        const isLogged = isPlannedLogged(i);
                        const hex = colorMap[p.athlete];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              // Save current partial input before switching
                              if (!isPlannedLogged(currentPuntIdx)) {
                                setPartialInputs((prev) => ({ ...prev, [currentPuntIdx]: { yards, hangTime, opTime, directionalAccuracy, starred } }));
                              }
                              setCurrentPuntIdx(i);
                              setShowAthleteDropdown(false);
                              const logged = getLoggedPunt(i);
                              if (logged) {
                                setYards(String(logged.yards));
                                setHangTime(String(logged.hangTime));
                                setOpTime(String(logged.opTime));
                                setDirectionalAccuracy(logged.directionalAccuracy);
                                setStarred(!!logged.starred);
                                setEditingPuntIdx(getLoggedPuntArrayIdx(i));
                              } else {
                                const partial = partialInputs[i];
                                if (partial) {
                                  setYards(partial.yards);
                                  setHangTime(partial.hangTime);
                                  setOpTime(partial.opTime);
                                  setDirectionalAccuracy(partial.directionalAccuracy);
                                  setStarred(partial.starred);
                                } else {
                                  setYards("");
                                  setHangTime("");
                                  setOpTime("");
                                  setDirectionalAccuracy(1);
                                  setStarred(!!plannedPunts[i]?.starred);
                                }
                                setEditingPuntIdx(null);
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

                    {/* Game mode: LOS + Landing YL (auto-calculates distance) */}
                    {sessionMode === "game" && (
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="label">LOS</p>
                          <input
                            className="input text-center text-lg font-bold"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="yd"
                            value={los}
                            onChange={(e) => setLos(e.target.value)}
                          />
                        </div>
                        <div>
                          <p className="label">Landing YL</p>
                          <input
                            className="input text-center text-lg font-bold"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="yd"
                            value={landingYL}
                            onChange={(e) => setLandingYL(e.target.value)}
                          />
                        </div>
                        <div>
                          <p className="label">Distance</p>
                          <div className="input text-center text-lg font-bold text-accent">
                            {(() => {
                              const l = parseInt(los) || 0;
                              const ly = parseInt(landingYL) || 0;
                              const d = Math.max(0, ly - l);
                              return d > 0 ? `${d}` : "—";
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Yards + Hang Time + Opp Time */}
                    <div className="grid grid-cols-3 gap-3">
                      {sessionMode !== "game" && !isPoochType(currentPlan?.type) && (
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
                      )}
                      {sessionMode !== "game" && isPoochType(currentPlan?.type) && (
                        <div>
                          <p className="label">Landing YL</p>
                          <input
                            className="input text-center text-lg font-bold text-accent"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="yd"
                            value={poochYL}
                            onChange={(e) => setPoochYL(e.target.value)}
                          />
                        </div>
                      )}
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
                      {sessionMode === "game" && (
                        <div>
                          <p className="label">Return Yds</p>
                          <input
                            className="input text-center text-lg font-bold"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="ret"
                            value={returnYardsInput}
                            onChange={(e) => setReturnYardsInput(e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {/* Game mode: Net yards auto display */}
                    {sessionMode === "game" && (
                      <div className="text-xs text-muted text-center">
                        Net: <span className="text-slate-200 font-semibold">
                          {(() => {
                            const l = parseInt(los) || 0;
                            const ly = parseInt(landingYL) || 0;
                            const ret = parseInt(returnYardsInput) || 0;
                            const gross = Math.max(0, ly - l);
                            const net = gross - ret;
                            return gross > 0 ? `${net} yd` : "—";
                          })()}
                        </span>
                      </div>
                    )}

                    {/* Directional Accuracy */}
                    {dirEnabled && (
                    <div>
                      <p className="label">Direction Score</p>
                      <div className="flex flex-wrap gap-2">
                        {DA_OPTIONS.map((opt) => {
                          const numVal = parseFloat(opt.value);
                          const isActive = directionalAccuracy === numVal;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setDirectionalAccuracy(numVal as 0 | 0.5 | 1)}
                              className={clsx(
                                "px-3 py-3 rounded-input text-xs font-bold border transition-all",
                                isActive
                                  ? numVal === 1 ? "bg-make/20 text-make border-make/50"
                                    : numVal === 0 ? "bg-miss/20 text-miss border-miss/50"
                                    : "bg-warn/20 text-warn border-warn/50"
                                  : "bg-surface-2 text-muted border-border hover:text-white"
                              )}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    )}

                    {/* Star + Log button + Remove */}
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
                        disabled={false}
                        className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        LOG PUNT
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove punt #${currentPuntIdx + 1} (${currentPlan?.athlete}) from the plan?`)) {
                            handleRemoveFromPlan();
                          }
                        }}
                        className="px-3 py-3 rounded-input text-xs border border-miss/30 text-miss/60 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                        title="Remove this punt from plan"
                      >
                        ✕
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
                    disabled={sessionPunts.length === 0}
                    className="btn-primary text-xs py-2 px-5"
                  >
                    Commit Session
                    {sessionPunts.length > 0 && ` (${sessionPunts.length})`}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right: Live stats + field view */}
          <div className={clsx(
            "lg:w-[40%] overflow-y-auto p-4 space-y-3",
            isGame && "bg-gradient-to-b from-red-950/20 to-transparent"
          )}>
            {sessionMode === "game" ? (
              <>
                {/* Game-specific stat cards */}
                {(() => {
                  const punts = sessionPunts;
                  const sAtt = punts.length;
                  const ydsCount = punts.filter((p) => p.yards > 0).length;
                  const totalGross = punts.reduce((s, p) => s + (p.yards > 0 ? p.yards : 0), 0);
                  const totalRet = punts.reduce((s, p) => s + (p.returnYards || 0), 0);
                  const avgGross = ydsCount > 0 ? (totalGross / ydsCount).toFixed(1) : "—";
                  const avgNet = ydsCount > 0 ? ((totalGross - totalRet) / ydsCount).toFixed(1) : "—";
                  const htCount = punts.filter((p) => p.hangTime > 0).length;
                  const avgHang = htCount > 0 ? (punts.reduce((s, p) => s + p.hangTime, 0) / htCount).toFixed(2) : "—";
                  // Inside-20 = landing YL >= 80 (opponent 20 or closer to end zone)
                  // Final spot = landing YL minus return yards (where the play ends)
                  const finalSpot = (p: { landingYL?: number; returnYards?: number }) => (p.landingYL ?? 0) - (p.returnYards ?? 0);
                  const inside20 = punts.filter((p) => finalSpot(p) >= 80).length;
                  const inside10 = punts.filter((p) => finalSpot(p) >= 90).length;
                  const daCount = punts.filter((p) => p.directionalAccuracy != null).length;
                  const daSum = punts.reduce((s, p) => s + (p.directionalAccuracy ?? 0), 0);
                  const dirPct = daCount > 0 ? `${Math.round((daSum / daCount) * 100)}%` : "—";
                  return (
                    <>
                      <div className="text-[10px] font-black text-red-400 uppercase tracking-widest">Game Stats · {sAtt} punt{sAtt !== 1 ? "s" : ""}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <StatCard label="Avg Gross" value={avgGross} accent glow />
                        <StatCard label="Avg Net" value={avgNet} />
                        <StatCard label="Avg Hang" value={avgHang !== "—" ? `${avgHang}s` : "—"} />
                        <StatCard label="Dir %" value={dirPct} />
                        <StatCard label="Inside 20" value={inside20} />
                        <StatCard label="Inside 10" value={inside10} />
                      </div>
                    </>
                  );
                })()}
                <PuntFieldView
                  punts={sessionPunts.filter((p) => p.los != null && p.landingYL != null)}
                  currentPunt={(() => {
                    const l = parseYardLine(los, "-");
                    const ly = parseYardLine(landingYL, "+");
                    if (isNaN(l) || isNaN(ly) || ly <= l) return null;
                    const hangVal = parseFloat(hangTime) || undefined;
                    return { los: l, landingYL: ly, hangTime: hangVal, direction: directionalAccuracy };
                  })()}
                />
              </>
            ) : (
              <>
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
              </>
            )}
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

  // ── Committed recap (shown after submitting from any mode) ──
  if (committed && committedPunts.length > 0) {
    return (
      <main className="flex-1 overflow-y-auto p-4 lg:p-6 max-w-4xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-make uppercase tracking-wider">
                {sessionMode === "game" ? "Game Committed" : "Practice Committed"}
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

          {/* Overall game stats + per-athlete recap cards */}
          {(() => {
            const all = committedPunts;
            const ydsE = all.filter((p) => p.yards > 0);
            const totalGross = ydsE.reduce((s, p) => s + p.yards, 0);
            const totalRet = all.reduce((s, p) => s + (p.returnYards ?? 0), 0);
            const avgGross = ydsE.length > 0 ? (totalGross / ydsE.length).toFixed(1) : "—";
            const avgNet = ydsE.length > 0 ? ((totalGross - totalRet) / ydsE.length).toFixed(1) : "—";
            const htE = all.filter((p) => p.hangTime > 0);
            const avgHangAll = htE.length > 0 ? (htE.reduce((s, p) => s + p.hangTime, 0) / htE.length).toFixed(2) : "—";
            const fSpot = (p: PuntEntry) => (p.landingYL ?? 0) - (p.returnYards ?? 0);
            const i20 = all.filter((p) => p.landingYL != null && fSpot(p) >= 80).length;
            const i10 = all.filter((p) => p.landingYL != null && fSpot(p) >= 90).length;
            const tbCount = all.filter((p) => p.touchback || p.landingZones?.includes("TB")).length;
            const fcCount = all.filter((p) => p.fairCatch || p.landingZones?.includes("fairCatch")).length;

            const byAthlete: Record<string, PuntEntry[]> = {};
            all.forEach((p) => { if (!byAthlete[p.athlete]) byAthlete[p.athlete] = []; byAthlete[p.athlete].push(p); });
            const athleteNames = Object.keys(byAthlete);

            return (
              <>
                {/* Overall summary */}
                {sessionMode === "game" && all.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-accent">{avgGross}</p><p className="text-[10px] text-muted uppercase">Avg Gross</p></div>
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-slate-100">{avgNet}</p><p className="text-[10px] text-muted uppercase">Avg Net</p></div>
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-slate-100">{avgHangAll}{avgHangAll !== "—" ? "s" : ""}</p><p className="text-[10px] text-muted uppercase">Avg Hang</p></div>
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-slate-100">{i20}</p><p className="text-[10px] text-muted uppercase">Inside 20</p></div>
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-slate-100">{i10}</p><p className="text-[10px] text-muted uppercase">Inside 10</p></div>
                    <div className="card-2 p-2 text-center"><p className={`text-lg font-bold ${tbCount > 0 ? "text-miss" : "text-slate-100"}`}>{tbCount}</p><p className="text-[10px] text-muted uppercase">Touchbacks</p></div>
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-slate-100">{fcCount}</p><p className="text-[10px] text-muted uppercase">Fair Catches</p></div>
                    <div className="card-2 p-2 text-center"><p className="text-lg font-bold text-slate-100">{all.length}</p><p className="text-[10px] text-muted uppercase">Total Punts</p></div>
                  </div>
                )}

                {/* Per-athlete cards */}
                {athleteNames.length > 0 && (
                  <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(athleteNames.length, 3)}, minmax(0, 1fr))` }}>
                    {athleteNames.map((name) => {
                      const ap = byAthlete[name];
                      const att = ap.length;
                      const yardsEntries = ap.filter((p) => p.yards > 0);
                      const avgDist = yardsEntries.length > 0 ? (yardsEntries.reduce((s, p) => s + p.yards, 0) / yardsEntries.length).toFixed(1) : "—";
                      const retTotal = ap.reduce((s, p) => s + (p.returnYards ?? 0), 0);
                      const grossTotal = yardsEntries.reduce((s, p) => s + p.yards, 0);
                      const netAvg = yardsEntries.length > 0 ? ((grossTotal - retTotal) / yardsEntries.length).toFixed(1) : "—";
                      const hangEntries = ap.filter((p) => p.hangTime > 0);
                      const avgHang = hangEntries.length > 0 ? (hangEntries.reduce((s, p) => s + p.hangTime, 0) / hangEntries.length).toFixed(2) : "—";
                      const otEntries = ap.filter((p) => (p.opTime || 0) > 0);
                      const avgOT = otEntries.length > 0 ? (otEntries.reduce((s, p) => s + (p.opTime || 0), 0) / otEntries.length).toFixed(2) : "—";
                      const daEntries = ap.filter((p) => p.directionalAccuracy != null && p.directionalAccuracy >= 0);
                      const dirPct = daEntries.length > 0 ? `${Math.round((daEntries.reduce((s, p) => s + p.directionalAccuracy, 0) / daEntries.length) * 100)}%` : "—";
                      const apI20 = ap.filter((p) => p.landingYL != null && fSpot(p) >= 80).length;
                      const apI10 = ap.filter((p) => p.landingYL != null && fSpot(p) >= 90).length;
                      const apTB = ap.filter((p) => p.touchback || p.landingZones?.includes("TB")).length;
                      return (
                        <div key={name} className="card-2 p-3">
                          <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                          <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                            <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{att}</span></div>
                            <div><span className="text-muted">Gross</span> <span className="text-slate-200 font-medium ml-1">{avgDist}</span></div>
                            <div><span className="text-muted">Net</span> <span className="text-slate-200 font-medium ml-1">{netAvg}</span></div>
                            <div><span className="text-muted">Hang</span> <span className="text-slate-200 font-medium ml-1">{avgHang}{avgHang !== "—" ? "s" : ""}</span></div>
                            {sessionMode !== "game" && <div><span className="text-muted">OT</span> <span className="text-slate-200 font-medium ml-1">{avgOT}{avgOT !== "—" ? "s" : ""}</span></div>}
                            {dirEnabled && <div><span className="text-muted">Dir%</span> <span className="text-accent font-medium ml-1">{dirPct}</span></div>}
                            <div><span className="text-muted">I-20</span> <span className="text-slate-200 font-medium ml-1">{apI20}</span></div>
                            <div><span className="text-muted">I-10</span> <span className="text-slate-200 font-medium ml-1">{apI10}</span></div>
                            <div><span className="text-muted">TB</span> <span className={`font-medium ml-1 ${apTB > 0 ? "text-miss" : "text-slate-200"}`}>{apTB}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}

          {/* Full punt table */}
          <div className="card-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header text-left">#</th>
                  <th className="table-header text-left">Athlete</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Yds</th>
                  <th className="table-header">Hang</th>
                  <th className="table-header">OT</th>
                  {dirEnabled && <th className="table-header">Dir</th>}
                </tr>
              </thead>
              <tbody>
                {committedPunts.map((p, i) => (
                  <tr key={i} className="hover:bg-surface/30">
                    <td className="table-cell text-left text-muted">{p.kickNum ?? i + 1}{p.starred ? <span className="text-amber-400"> ★</span> : ""}</td>
                    <td className="table-name">{p.athlete}</td>
                    <td className="table-cell text-muted">{typeLabels[p.type] ?? (p.type || "—")}</td>
                    <td className="table-cell">{p.yards > 0 ? `${p.yards} yd` : "—"}</td>
                    <td className="table-cell text-muted">{p.hangTime > 0 ? `${p.hangTime.toFixed(2)}s` : "—"}</td>
                    <td className="table-cell text-muted">{(p.opTime || 0) > 0 ? `${p.opTime.toFixed(2)}s` : "—"}</td>
                    {dirEnabled && (
                      <td className={`table-cell font-bold ${p.directionalAccuracy === 1 ? "text-make" : p.directionalAccuracy === 0 ? "text-miss" : "text-amber-400"}`}>
                        {p.directionalAccuracy != null ? (p.directionalAccuracy === 0.5 ? "0.5" : p.directionalAccuracy) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleNewSession}
            className="btn-primary w-full py-3 text-sm font-bold"
          >
            ← Back to Log
          </button>
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
                  {manualEntry && sessionMode === "game" && (
                    <>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]" title="LOS yard line. Use -X for own side, +X for opponent side">LOS ±</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]" title="Landing yard line. Use -X for own side, +X for opponent side">Land YL ±</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-[4.5rem] border-b border-red-500/40 text-[10px]">Hang Time</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-12 border-b border-red-500/40 text-[10px]">Return</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-10 border-b border-red-500/40 text-[10px]" title="Touchback">TB</th>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-10 border-b border-red-500/40 text-[10px]" title="Fair Catch">FC</th>
                      {dirEnabled && <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-[4.5rem] border-b border-red-500/40 text-[10px]">Dir. Score</th>}
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">Save</th>
                    </>
                  )}
                  {manualEntry && sessionMode !== "game" && (
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
                      {dirEnabled && (
                        <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-[4.5rem] border-b border-border text-[10px]">
                          Dir. Score
                        </th>
                      )}
                    </>
                  )}
                  {sessionMode !== "game" && (
                    <th className="bg-surface-2 text-amber-400 font-bold py-2 px-1 text-center w-8 border-b border-border">★</th>
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
                      {manualEntry && sessionMode === "game" && (() => {
                        const filledIdx = filledIndices.indexOf(idx);
                        const kickNum = filledIdx + 1;
                        const isSaved = sessionPunts.some((p) => p.kickNum === kickNum);
                        return (
                          <>
                            <td className="py-1 px-1">
                              <input
                                type="text" inputMode="text" placeholder="-20"
                                value={row.los ?? ""}
                                onChange={(e) => updateRow(idx, "los", e.target.value)}
                                readOnly={isAthlete || isSaved}
                                title="Use -X for own side, +X for opponent side (e.g. -20 or +25)"
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text" inputMode="text" placeholder="25"
                                value={row.landingYL ?? ""}
                                onChange={(e) => {
                                  updateRow(idx, "landingYL", e.target.value);
                                  // Auto-detect touchback: "0" on opponent side = end zone
                                  const val = e.target.value.trim();
                                  const parsed = parseYardLine(val, "+");
                                  if (!isNaN(parsed) && parsed >= 100) {
                                    updateRow(idx, "touchback", true);
                                    updateRow(idx, "returnYards", "");
                                    updateRow(idx, "fairCatch", false);
                                  } else if (row.touchback) {
                                    updateRow(idx, "touchback", false);
                                  }
                                }}
                                readOnly={isAthlete || isSaved}
                                title="Use -X for own side, +X for opponent side (e.g. -20 or +25)"
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
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
                                readOnly={isAthlete || isSaved}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="text" inputMode="numeric" pattern="[0-9]*" placeholder="ret"
                                value={row.returnYards ?? ""}
                                onChange={(e) => updateRow(idx, "returnYards", e.target.value)}
                                readOnly={isAthlete || isSaved || !!row.fairCatch || !!row.touchback}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : (row.fairCatch || row.touchback) ? "border-border/30 text-muted" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            <td className="py-1 px-1 text-center">
                              <input
                                type="checkbox"
                                checked={!!row.touchback}
                                disabled={isAthlete || isSaved}
                                onChange={(e) => {
                                  updateRow(idx, "touchback", e.target.checked);
                                  if (e.target.checked) {
                                    updateRow(idx, "returnYards", "");
                                    updateRow(idx, "fairCatch", false);
                                  }
                                }}
                                title="Touchback"
                                className="w-4 h-4 accent-red-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-1 px-1 text-center">
                              <input
                                type="checkbox"
                                checked={!!row.fairCatch}
                                disabled={isAthlete || isSaved || !!row.touchback}
                                onChange={(e) => updateRow(idx, "fairCatch", e.target.checked)}
                                title="Fair Catch"
                                className="w-4 h-4 accent-red-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            {dirEnabled && (
                              <td className="py-1 px-1">
                                <select
                                  value={row.directionalAccuracy}
                                  onChange={(e) => updateRow(idx, "directionalAccuracy", e.target.value)}
                                  disabled={isAthlete || isSaved}
                                  className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                                >
                                  <option value="">—</option>
                                  {DA_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                            <td className="py-1 px-1 text-center">
                              {isSaved ? (
                                <button
                                  onClick={() => handleUnsaveGameRow(idx)}
                                  className="text-[10px] px-1 text-make/60 hover:text-miss transition-colors"
                                  title="Unsave this punt"
                                >
                                  ✓ Saved
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSaveGameRow(idx)}
                                  disabled={isAthlete || !row.athlete}
                                  className="text-[10px] px-2 py-1 rounded bg-red-500 text-white font-bold hover:bg-red-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  title="Add this punt to the game"
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
                            {isPoochType(row.type) ? (
                              <input
                                type="text" inputMode="numeric" pattern="[0-9]*" placeholder="YL"
                                value={row.poochYL ?? ""}
                                onChange={(e) => updateRow(idx, "poochYL", e.target.value)}
                                readOnly={isAthlete}
                                title="Pooch landing yard line"
                                className="w-full bg-transparent border border-accent/40 rounded px-1 py-1 text-xs text-accent text-center focus:outline-none focus:border-accent/60"
                              />
                            ) : (
                              <input
                                type="text" inputMode="numeric" pattern="[0-9]*" placeholder="yds"
                                value={row.yards}
                                onChange={(e) => updateRow(idx, "yards", e.target.value)}
                                readOnly={isAthlete}
                                className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                              />
                            )}
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
                          {dirEnabled && (
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
                          )}
                        </>
                      )}
                      {sessionMode !== "game" && (
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
                      )}
                      <td className="py-1 px-1 text-center">
                        {isLocked ? (
                          !isAthlete && (
                            <div className="flex items-center gap-0.5 justify-center">
                              {sessionMode === "game" ? (
                                <button
                                  onClick={() => handleUnsaveGameRow(idx)}
                                  className="text-accent/60 hover:text-accent transition-colors text-[10px] leading-none px-1"
                                  title="Unlock this punt for editing"
                                >
                                  ✏️
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => {
                                      // Jump into live session and edit just this one punt
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
              {sessionMode === "game" ? (
                <button
                  onClick={handleCommitReady}
                  disabled={sessionPunts.length === 0}
                  className="btn-primary text-xs py-2 px-5 bg-red-500 hover:bg-red-400 disabled:opacity-40"
                >
                  Commit Game{sessionPunts.length > 0 ? ` (${sessionPunts.length})` : ""}
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
                    ? `Continue Session (${filledCount - sessionPunts.length} remaining)`
                    : `Start Session${filledCount > 0 ? ` (${filledCount})` : ""}`}
                </button>
              )}
            </>)}
          </div>
        </div>

        {/* Right: Game field view OR practice stats */}
        <div className="lg:w-[40%] overflow-y-auto p-4 space-y-3">
          {sessionMode === "game" ? (
            <>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                Game Chart · {sessionPunts.length} punt{sessionPunts.length !== 1 ? "s" : ""}
              </p>
              {(() => {
                const punts = sessionPunts;
                const sAtt = punts.length;
                const ydsCount = punts.filter((p) => p.yards > 0).length;
                const totalGross = punts.reduce((s, p) => s + (p.yards > 0 ? p.yards : 0), 0);
                const totalRet = punts.reduce((s, p) => s + (p.returnYards || 0), 0);
                const avgGross = ydsCount > 0 ? (totalGross / ydsCount).toFixed(1) : "—";
                const avgNet = ydsCount > 0 ? ((totalGross - totalRet) / ydsCount).toFixed(1) : "—";
                const htCount = punts.filter((p) => p.hangTime > 0).length;
                const avgHang = htCount > 0 ? (punts.reduce((s, p) => s + p.hangTime, 0) / htCount).toFixed(2) : "—";
                const finalSpot2 = (p: { landingYL?: number; returnYards?: number }) => (p.landingYL ?? 0) - (p.returnYards ?? 0);
                const inside20 = punts.filter((p) => finalSpot2(p) >= 80).length;
                const inside10 = punts.filter((p) => finalSpot2(p) >= 90).length;
                const daCount = punts.filter((p) => p.directionalAccuracy != null).length;
                const daSum = punts.reduce((s, p) => s + (p.directionalAccuracy ?? 0), 0);
                const dirPct = daCount > 0 ? `${Math.round((daSum / daCount) * 100)}%` : "—";
                if (sAtt === 0) {
                  return <p className="text-xs text-muted">Save a punt to see it on the field and calculate stats.</p>;
                }
                return (
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Avg Gross" value={avgGross} accent glow />
                    <StatCard label="Avg Net" value={avgNet} />
                    <StatCard label="Avg Hang" value={avgHang !== "—" ? `${avgHang}s` : "—"} />
                    <StatCard label="Dir %" value={dirPct} />
                    <StatCard label="Inside 20" value={inside20} />
                    <StatCard label="Inside 10" value={inside10} />
                  </div>
                );
              })()}
              <PuntFieldView
                punts={sessionPunts.filter((p) => p.los != null && p.landingYL != null)}
              />
            </>
          ) : (() => {
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
              const ydsEntries = ap.filter((p) => p.yards > 0);
              const htEntries = ap.filter((p) => p.hangTime > 0);
              const otEntries = ap.filter((p) => p.opTime > 0);
              const daEntries = ap.filter((p) => p.directionalAccuracy != null);
              const totalYds = ydsEntries.reduce((s, p) => s + p.yards, 0);
              const totalHT = htEntries.reduce((s, p) => s + p.hangTime, 0);
              const totalOT = otEntries.reduce((s, p) => s + p.opTime, 0);
              const totalDA = daEntries.reduce((s, p) => s + p.directionalAccuracy, 0);
              const longPunt = ydsEntries.length > 0 ? Math.max(...ydsEntries.map((p) => p.yards)) : 0;
              const aYds = ydsEntries.length > 0 ? (totalYds / ydsEntries.length).toFixed(1) : "—";
              const aHT = htEntries.length > 0 ? (totalHT / htEntries.length).toFixed(2) : "—";
              const aOT = otEntries.length > 0 ? (totalOT / otEntries.length).toFixed(2) : "—";
              const aDA = daEntries.length > 0 ? `${Math.round((totalDA / daEntries.length) * 100)}%` : "—";

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
