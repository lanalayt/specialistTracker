"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useFG } from "@/lib/fgContext";
import { LiveFGStats } from "@/components/ui/LiveSessionStats";
import { SessionLog } from "@/components/ui/SessionLog";
import { SessionSummary } from "@/components/ui/SessionSummary";
import { FGFieldView } from "@/components/ui/FGFieldView";
import { StatCard } from "@/components/ui/StatCard";
import { makePct } from "@/lib/stats";
import type { FGKick, FGPosition, FGResult } from "@/types";
import { POSITIONS, RESULTS } from "@/types";
import clsx from "clsx";
import { useDragReorder } from "@/lib/useDragReorder";
import { loadSettingsFromCloud } from "@/lib/settingsSync";
import { useAuth } from "@/lib/auth";
import { useUnsavedWarning } from "@/lib/useUnsavedWarning";
import { teamSet, teamGet, getTeamId } from "@/lib/teamData";

const INIT_ROWS = 12;

/** Auto-format op time: typing "132" produces "1.32" */
function formatOpTime(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length === 1) return digits;
  if (digits.length === 2) return digits[0] + "." + digits[1];
  return digits.slice(0, -2) + "." + digits.slice(-2);
}

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
  opTime: string;
  starred?: boolean;
}

interface PartialKickInput {
  result: FGResult | null;
  score: number;
  opTime: string;
  starred: boolean;
}

interface SessionDraft {
  rows: LogRow[];
  manualEntry: boolean;
  sessionActive: boolean;
  plannedKicks: { athlete: string; dist: number; pos: FGPosition; isPAT?: boolean; starred?: boolean }[];
  plannedRowIndices: number[];
  currentKickIdx: number;
  sessionKicks: FGKick[];
  partialInputs?: Record<number, PartialKickInput>;
  committed?: boolean;
  committedWeather?: string;
  committedKicks?: FGKick[];
  sessionMode?: "practice" | "game";
  opponent?: string;
  gameTime?: string;
}

const emptyRow = (): LogRow => ({ athlete: "", dist: "", pos: "", result: "", score: "", opTime: "", starred: false });

function draftKey(mode: "practice" | "game"): string {
  const tid = getTeamId();
  return tid ? `${SESSION_STORAGE_KEY}_${mode}_${tid}` : `${SESSION_STORAGE_KEY}_${mode}`;
}

function loadDraftForMode(mode: "practice" | "game"): SessionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(mode));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveDraftForMode(draft: SessionDraft, mode: "practice" | "game") {
  if (typeof window === "undefined") return;
  localStorage.setItem(draftKey(mode), JSON.stringify(draft));
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

function loadOpTimeEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.opTimeEnabled !== false;
    }
  } catch {}
  return true;
}

function loadMakeMode(): "simple" | "detailed" {
  if (typeof window === "undefined") return "simple";
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.makeMode === "detailed" ? "detailed" : "simple";
    }
  } catch {}
  return "simple";
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

function loadScoreMode(): "on" | "practice" | "off" {
  if (typeof window === "undefined") return "practice";
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.scoreEnabled === "on" || parsed.scoreEnabled === "practice" || parsed.scoreEnabled === "off") return parsed.scoreEnabled;
      if (parsed.scoreEnabled === false) return "off";
      return "practice";
    }
  } catch {}
  return "practice";
}

function loadScoreOptions(): string[] {
  const DEFAULT = ["0", "1", "2", "3", "4"];
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = localStorage.getItem("fgSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.scoreOptions) && parsed.scoreOptions.length > 0) {
        return parsed.scoreOptions;
      }
    }
  } catch {}
  return DEFAULT;
}

const RESULT_LABELS: Record<string, string> = {
  YL: "Make ←",
  YC: "Make ✓",
  YR: "Make →",
  XL: "Miss ←",
  XS: "Miss ↓",
  X: "Miss ✗",
  XR: "Miss →",
};

// Score options loaded from fgSettings (customizable in FG Settings page)

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
  const { athletes, stats, commitPractice } =
    useFG();
  const { isAthlete, canEdit } = useAuth();
  const viewOnly = isAthlete && !canEdit;

  // ── Initialize all state from localStorage ──────────────────
  const [initialMode] = useState<"practice" | "game">(() => {
    // Check if game mode has active data
    const gameDraft = loadDraftForMode("game");
    if ((gameDraft?.sessionKicks?.length ?? 0) > 0 || gameDraft?.sessionActive || gameDraft?.committed) {
      return "game";
    }
    return "practice";
  });
  const [draft] = useState<SessionDraft>(() => {
    const saved = loadDraftForMode(initialMode);
    return saved ?? {
      rows: Array.from({ length: INIT_ROWS }, emptyRow),
      manualEntry: true,
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
  const [sessionKicks, setSessionKicks] = useState<FGKick[]>(() =>
    (draft.sessionKicks ?? []).map((k, i) => k.kickNum != null ? k : { ...k, kickNum: i + 1 })
  );
  const [partialInputs, setPartialInputs] = useState<Record<number, PartialKickInput>>(draft.partialInputs ?? {});
  const [result, setResult] = useState<FGResult | null>(draft.partialInputs?.[draft.currentKickIdx]?.result ?? null);
  const [score, setScore] = useState<number>(draft.partialInputs?.[draft.currentKickIdx]?.score ?? 0);
  const [starred, setStarred] = useState(draft.partialInputs?.[draft.currentKickIdx]?.starred ?? false);
  const [opTime, setOpTime] = useState(draft.partialInputs?.[draft.currentKickIdx]?.opTime ?? "");
  const [pendingKicks, setPendingKicks] = useState<FGKick[] | null>(null);
  const [committed, setCommitted] = useState(draft.committed ?? false);
  const [committedKicks, setCommittedKicks] = useState<FGKick[]>(draft.committedKicks ?? []);
  const [sessionMode, setSessionMode] = useState<"practice" | "game">(initialMode);
  const [opponent, setOpponent] = useState<string>(draft.opponent ?? "");
  const [gameTime, setGameTime] = useState<string>(draft.gameTime ?? "");
  const [draftSaved, setDraftSaved] = useState(false);

  // Game mode forces manual entry (no live session)
  useEffect(() => {
    if (sessionMode === "game" && !manualEntry) setManualEntry(true);
  }, [sessionMode, manualEntry]);
  const [snapDistance, setSnapDistance] = useState(() => loadSnapDistance());
  const [opTimeEnabled] = useState(() => loadOpTimeEnabled());
  const drag = useDragReorder(rows, setRows);
  const [makeMode, setMakeMode] = useState(() => loadMakeMode());
  const [missMode, setMissMode] = useState(() => loadMissMode());
  const [scoreMode, setScoreMode] = useState(() => loadScoreMode());
  // Score is visible when: "on" (always), "practice" (only in practice mode), "off" (never)
  const scoreEnabled = scoreMode === "on" || (scoreMode === "practice" && sessionMode !== "game");
  const [scoreOptions, setScoreOptions] = useState<string[]>(() => loadScoreOptions());
  const [weather, setWeather] = useState(draft.committedWeather ?? "");
  const [weatherLocked, setWeatherLocked] = useState(false);
  const [showSetupPrompt, setShowSetupPrompt] = useState(false);

  // Load settings from cloud on fresh device
  useEffect(() => {
    const hasLocal = !!localStorage.getItem("fgSettings");
    loadSettingsFromCloud<{ snapDistance?: string; makeMode?: string; missMode?: string; scoreEnabled?: string | boolean; scoreOptions?: string[] }>("fgSettings").then((cloud) => {
      if (!hasLocal && !cloud) {
        setShowSetupPrompt(true);
      }
      if (cloud) {
        if (cloud.snapDistance) setSnapDistance(parseInt(cloud.snapDistance) || 7);
        if (cloud.makeMode === "simple" || cloud.makeMode === "detailed") setMakeMode(cloud.makeMode);
        if (cloud.missMode === "simple" || cloud.missMode === "detailed") setMissMode(cloud.missMode);
        if (Array.isArray(cloud.scoreOptions) && cloud.scoreOptions.length > 0) setScoreOptions(cloud.scoreOptions);
        // Score mode
        const se = cloud.scoreEnabled;
        if (se === "on" || se === "practice" || se === "off") setScoreMode(se);
        else if (se === false) setScoreMode("off");
      }
    });

    // Load draft from cloud if local is empty
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      teamGet<SessionDraft>(tid, `fg_session_draft_${sessionMode}`).then((cloudDraft) => {
        if (cloudDraft && cloudDraft.rows) {
          const localDraft = loadDraftForMode(sessionMode);
          const localHasData = localDraft?.rows?.some((r) => r.athlete || r.dist || r.pos);
          if (!localHasData) {
            setRows(cloudDraft.rows);
            setManualEntry(cloudDraft.manualEntry);
            setSessionActive(cloudDraft.sessionActive);
            setPlannedKicks(cloudDraft.plannedKicks ?? []);
            setPlannedRowIndices(cloudDraft.plannedRowIndices ?? []);
            setCurrentKickIdx(cloudDraft.currentKickIdx ?? 0);
            setSessionKicks(cloudDraft.sessionKicks ?? []);
            if (cloudDraft.partialInputs) setPartialInputs(cloudDraft.partialInputs);
            setCommitted(cloudDraft.committed ?? false);
            if (cloudDraft.committedWeather != null) setWeather(cloudDraft.committedWeather);
          }
        }
      });
    }
  }, []);

  // Persist draft on every relevant state change
  useEffect(() => {
    // Merge current input fields into partialInputs for the active kick
    const mergedPartials = sessionActive && !isPlannedLogged(currentKickIdx)
      ? { ...partialInputs, [currentKickIdx]: { result, score, opTime, starred } }
      : partialInputs;
    saveDraftForMode({
      rows,
      manualEntry,
      sessionActive,
      plannedKicks,
      plannedRowIndices,
      currentKickIdx,
      sessionKicks,
      partialInputs: mergedPartials,
      committed,
      committedWeather: committed ? weather : undefined,
      committedKicks: committed ? committedKicks : undefined,
      sessionMode,
      opponent,
      gameTime,
    }, sessionMode);
  }, [rows, manualEntry, sessionActive, plannedKicks, plannedRowIndices, currentKickIdx, sessionKicks, partialInputs, result, score, opTime, starred, committed, committedKicks, weather, sessionMode, opponent, gameTime]);

  // ── Switch between practice / game mode with independent drafts ──
  const switchMode = (newMode: "practice" | "game") => {
    if (newMode === sessionMode) return;
    // Save current state to current mode's draft
    const mergedPartials = sessionActive
      ? { ...partialInputs, [currentKickIdx]: { result, score, opTime, starred } }
      : partialInputs;
    const currentDraft: SessionDraft = {
      rows, manualEntry, sessionActive, plannedKicks, plannedRowIndices,
      currentKickIdx, sessionKicks, partialInputs: mergedPartials,
      committed, committedWeather: committed ? weather : undefined,
      committedKicks: committed ? committedKicks : undefined,
      sessionMode, opponent, gameTime,
    };
    saveDraftForMode(currentDraft, sessionMode);
    // Load new mode's draft
    const nd = loadDraftForMode(newMode);
    setRows(nd?.rows ?? Array.from({ length: INIT_ROWS }, emptyRow));
    setManualEntry(nd?.manualEntry ?? (newMode === "game"));
    setSessionActive(nd?.sessionActive ?? false);
    setPlannedKicks(nd?.plannedKicks ?? []);
    setPlannedRowIndices(nd?.plannedRowIndices ?? []);
    setCurrentKickIdx(nd?.currentKickIdx ?? 0);
    setSessionKicks(nd?.sessionKicks ?? []);
    setPartialInputs(nd?.partialInputs ?? {});
    setResult(nd?.partialInputs?.[nd?.currentKickIdx ?? 0]?.result ?? null);
    setScore(nd?.partialInputs?.[nd?.currentKickIdx ?? 0]?.score ?? 0);
    setStarred(nd?.partialInputs?.[nd?.currentKickIdx ?? 0]?.starred ?? false);
    setPendingKicks(null);
    setCommitted(nd?.committed ?? false);
    setCommittedKicks(nd?.committedKicks ?? []);
    setOpponent(nd?.opponent ?? "");
    setGameTime(nd?.gameTime ?? "");
    setWeather(nd?.committedWeather ?? "");
    setSessionMode(newMode);
  };

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
      const s = stats[a.name];
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
    isContinuing ? filledIndices.filter((_, pi) => sessionKicks.some(k => k.kickNum === pi + 1)) : []
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
      const firstUnlogged = planned.findIndex((_, i) => !sessionKicks.some(k => k.kickNum === i + 1));
      setCurrentKickIdx(firstUnlogged >= 0 ? firstUnlogged : planned.length - 1);
    } else {
      setCurrentKickIdx(0);
      setSessionKicks([]);
    }

    const startIdx = isContinuing
      ? (planned.findIndex((_, i) => !sessionKicks.some(k => k.kickNum === i + 1)) ?? 0)
      : 0;
    setResult(null);
    setScore(0);
    setStarred(!!planned[startIdx >= 0 ? startIdx : 0]?.starred);
    setSessionActive(true);
  };

  // ── Unlock a locked row (remove its logged result) ─────────
  const handleUnlockRow = (filledIdx: number) => {
    // Remove the sessionKick at this planned index and all after it
    setSessionKicks((prev) => prev.filter(k => (k.kickNum ?? 0) < filledIdx + 1));
  };

  // ── Game mode: save a single row to sessionKicks ──
  const handleSaveGameRow = (rowIdx: number) => {
    const r = rows[rowIdx];
    if (!r || !r.athlete || !r.result) {
      setErrorRows((prev) => new Set([...prev, rowIdx]));
      return;
    }
    const filledIdx = filledIndices.indexOf(rowIdx);
    const kickNum = filledIdx >= 0 ? filledIdx + 1 : sessionKicks.length + 1;
    const isPAT = r.pos === "PAT";
    // Outlier check (skip for PATs)
    if (!isPAT) {
      const warnings = checkFGOutliers(parseInt(r.dist) || 0);
      if (warnings.length > 0 && !window.confirm(`Are you sure?\n\n${warnings.join("\n")}`)) return;
    }
    const otVal = parseFloat(r.opTime) || 0;
    const kick: FGKick = {
      athleteId: r.athlete,
      athlete: r.athlete,
      dist: isPAT ? 0 : (parseInt(r.dist) || 0),
      pos: r.pos as FGPosition,
      result: r.result as FGResult,
      score: parseInt(r.score) || 0,
      opTime: otVal > 0 ? otVal : undefined,
      isPAT: isPAT || undefined,
      starred: r.starred || undefined,
      kickNum,
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
    const otVal = parseFloat(opTime) || 0;
    const kick: FGKick = {
      athleteId: plan.athlete,
      athlete: plan.athlete,
      dist: plan.isPAT ? 0 : plan.dist,
      pos: plan.pos,
      result,
      score,
      opTime: otVal > 0 ? otVal : undefined,
      isPAT: plan.isPAT || undefined,
      starred: starred || undefined,
      kickNum: currentKickIdx + 1,
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

    // Clear partial for logged kick, load partial for next kick if it exists
    let advanceIdx: number;
    if (editingKickIdx !== null) {
      const nxt = findNextUnlogged(currentKickIdx);
      advanceIdx = nxt >= 0 ? nxt : (findNextUnlogged(-1) >= 0 ? findNextUnlogged(-1) : currentKickIdx);
    } else {
      let ni = currentKickIdx + 1;
      while (ni < plannedKicks.length && isPlannedLogged(ni)) ni++;
      advanceIdx = ni < plannedKicks.length ? ni : currentKickIdx;
    }
    setPartialInputs((prev) => {
      const next = { ...prev };
      delete next[currentKickIdx];
      return next;
    });
    const nextPartial = partialInputs[advanceIdx];
    if (nextPartial) {
      setResult(nextPartial.result);
      setScore(nextPartial.score);
      setOpTime(nextPartial.opTime ?? "");
      setStarred(nextPartial.starred);
    } else {
      setResult(null);
      setScore(0);
      setOpTime("");
      setStarred(!!plannedKicks[advanceIdx]?.starred);
    }
    setShowAthleteDropdown(false);
  };

  const allKicksLogged = plannedKicks.length > 0 && sessionKicks.length >= plannedKicks.length;
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
    const deleted = sessionKicks[idx];
    setSessionKicks((prev) => prev.filter((_, i) => i !== idx));
    // Navigate to the deleted kick's planned position so user can re-log
    if (deleted?.kickNum) {
      setCurrentKickIdx(deleted.kickNum - 1);
      setEditingKickIdx(null);
    }
  };

  const handleRemoveFromPlan = () => {
    const kickNum = currentKickIdx + 1;
    const rowIdx = plannedRowIndices[currentKickIdx];
    // Remove logged kick if exists
    setSessionKicks((prev) => prev.filter(k => k.kickNum !== kickNum));
    // Remove from planned kicks
    setPlannedKicks((prev) => prev.filter((_, i) => i !== currentKickIdx));
    // Remove from row indices and shift
    const newRowIndices = plannedRowIndices.filter((_, i) => i !== currentKickIdx);
    setPlannedRowIndices(newRowIndices);
    // Remove the row from the planning table
    if (rowIdx != null) {
      setRows((prev) => prev.filter((_, i) => i !== rowIdx));
      // Adjust row indices that were after the deleted row
      setPlannedRowIndices((prev) => prev.map(ri => ri > rowIdx ? ri - 1 : ri));
    }
    // Re-number kickNums for remaining logged kicks
    setSessionKicks((prev) => prev.map(k => {
      if (k.kickNum && k.kickNum > kickNum) return { ...k, kickNum: k.kickNum - 1 };
      return k;
    }));
    // Navigate to a valid index
    const newLen = plannedKicks.length - 1;
    if (newLen === 0) {
      setSessionActive(false);
    } else {
      setCurrentKickIdx(Math.min(currentKickIdx, newLen - 1));
    }
    setEditingKickIdx(null);
    setResult(null);
    setScore(0);
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
    setPartialInputs({});
    setWeather("");
    setOpTime("");
    setCommitted(false);
    setSessionActive(false);
    setSessionMode("practice");
    setOpponent("");
    setGameTime("");
  };

  const saveDraftToCloud = () => {
    const tid = getTeamId();
    if (tid && tid !== "local-dev") {
      const mergedPartials = sessionActive && !isPlannedLogged(currentKickIdx)
        ? { ...partialInputs, [currentKickIdx]: { result, score, opTime, starred } }
        : partialInputs;
      const draft: SessionDraft = {
        rows, manualEntry, sessionActive, plannedKicks, plannedRowIndices,
        currentKickIdx, sessionKicks, partialInputs: mergedPartials,
        committed, committedWeather: committed ? weather : undefined,
        committedKicks: committed ? committedKicks : undefined,
        sessionMode, opponent, gameTime,
      };
      teamSet(tid, `fg_session_draft_${sessionMode}`, draft);
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    }
  };

  const [clearUndoData, setClearUndoData] = useState<{ rows: typeof rows; sessionKicks: typeof sessionKicks; plannedKicks: typeof plannedKicks; plannedRowIndices: number[]; partialInputs: typeof partialInputs } | null>(null);

  const clearLog = () => {
    setClearUndoData({ rows, sessionKicks, plannedKicks, plannedRowIndices, partialInputs });
    setRows(Array.from({ length: INIT_ROWS }, emptyRow));
    setErrorRows(new Set());
    setSessionKicks([]);
    setPlannedKicks([]);
    setPlannedRowIndices([]);
    setCurrentKickIdx(0);
    setPartialInputs({});
  };

  const undoClear = () => {
    if (!clearUndoData) return;
    setRows(clearUndoData.rows);
    setSessionKicks(clearUndoData.sessionKicks);
    setPlannedKicks(clearUndoData.plannedKicks);
    setPlannedRowIndices(clearUndoData.plannedRowIndices);
    setPartialInputs(clearUndoData.partialInputs);
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
                  <span className="text-sm font-black uppercase tracking-widest">GAME — FG</span>
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
                        const byAthlete: Record<string, FGKick[]> = {};
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
                              const fgKicks = ak.filter((k) => !k.isPAT);
                              const patKicks = ak.filter((k) => k.isPAT);
                              const fgAtt = fgKicks.length;
                              const fgMade = fgKicks.filter((k) => k.result.startsWith("Y")).length;
                              const fgPct = fgAtt > 0 ? `${Math.round((fgMade / fgAtt) * 100)}%` : "—";
                              const fgAvgSc = fgAtt > 0 ? (fgKicks.reduce((s, k) => s + k.score, 0) / fgAtt).toFixed(1) : "—";
                              const fgMadeKicks = fgKicks.filter((k) => k.result.startsWith("Y"));
                              const long = fgMadeKicks.length > 0 ? Math.max(...fgMadeKicks.map((k) => k.dist)) : 0;
                              const patAtt = patKicks.length;
                              const patMade = patKicks.filter((k) => k.result.startsWith("Y")).length;
                              const patPct = patAtt > 0 ? `${Math.round((patMade / patAtt) * 100)}%` : "—";
                              return (
                                <div key={name} className="card-2 p-3">
                                  <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">FG</p>
                                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                                    <div><span className="text-muted">Made</span> <span className="text-make font-medium ml-1">{fgMade}</span></div>
                                    <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{fgAtt}</span></div>
                                    <div><span className="text-muted">Pct</span> <span className="text-accent font-medium ml-1">{fgPct}</span></div>
                                    <div><span className="text-muted">Score</span> <span className="text-slate-200 font-medium ml-1">{fgAvgSc}</span></div>
                                    <div><span className="text-muted">Long</span> <span className="text-slate-200 font-medium ml-1">{long > 0 ? `${long}` : "—"}</span></div>
                                  </div>
                                  {patAtt > 0 && (
                                    <>
                                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mt-2.5 mb-1">PAT</p>
                                      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                                        <div><span className="text-muted">Made</span> <span className="text-make font-medium ml-1">{patMade}</span></div>
                                        <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{patAtt}</span></div>
                                        <div><span className="text-muted">Pct</span> <span className="text-accent font-medium ml-1">{patPct}</span></div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* Full kick table */}
                      <div className="card-2 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="table-header text-left">#</th>
                              <th className="table-header text-left">Athlete</th>
                              <th className="table-header">Dist</th>
                              <th className="table-header">Pos</th>
                              <th className="table-header">Result</th>
                              <th className="table-header">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sessionKicks.map((k, i) => (
                              <tr key={i} className="hover:bg-surface/30 transition-colors">
                                <td className="table-cell text-left text-muted">{k.kickNum ?? i + 1}{k.starred ? <span className="text-amber-400"> ★</span> : ""}</td>
                                <td className="table-name">{k.athlete}</td>
                                <td className="table-cell">{k.isPAT ? "PAT" : `${k.dist} yd`}</td>
                                <td className="table-cell text-muted">{k.isPAT ? "—" : k.pos}</td>
                                <td className="table-cell">
                                  <span className={clsx("text-xs font-semibold", k.result.startsWith("Y") ? "text-make" : "text-miss")}>
                                    {k.result}
                                  </span>
                                </td>
                                <td className="table-cell">{k.score}</td>
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
                        const isLogged = isPlannedLogged(i);
                        const hex = colorMap[k.athlete];
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              // Save current partial input before switching
                              if (!isPlannedLogged(currentKickIdx)) {
                                setPartialInputs((prev) => ({ ...prev, [currentKickIdx]: { result, score, opTime, starred } }));
                              }
                              setCurrentKickIdx(i);
                              setDistInput(plannedKicks[i].isPAT ? "" : plannedKicks[i].dist.toString());
                              setShowAthleteDropdown(false);
                              const logged = getLoggedKick(i);
                              if (logged) {
                                setResult(logged.result);
                                setScore(logged.score);
                                setStarred(!!logged.starred);
                                setEditingKickIdx(getLoggedKickArrayIdx(i));
                              } else {
                                const partial = partialInputs[i];
                                if (partial) {
                                  setResult(partial.result);
                                  setScore(partial.score);
                                  setStarred(partial.starred);
                                } else {
                                  setResult(null);
                                  setScore(0);
                                  setStarred(!!plannedKicks[i]?.starred);
                                }
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
                                key={a.name}
                                onClick={() => {
                                  updateCurrentPlan("athlete", a.name);
                                  setShowAthleteDropdown(false);
                                }}
                                className={clsx(
                                  "w-full text-left px-3 py-2 text-sm font-medium hover:bg-surface transition-colors",
                                  a.name === currentPlan.athlete ? "text-accent" : "text-slate-300"
                                )}
                              >
                                {a.name}
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
                        ? findNextUnlogged(-1)
                        : findNextUnlogged(currentKickIdx);
                      if (nextIdx < 0 || !plannedKicks[nextIdx]) return null;
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
                              onClick={() => { setResult("X"); setScore(0); }}
                              className={clsx(
                                "w-full py-3 rounded-input text-xs font-bold transition-all",
                                result === "XL" || result === "XS" || result === "XR" || result === "X"
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

                    {/* Score + Op Time */}
                    {(scoreEnabled || opTimeEnabled) && (
                    <div className="flex gap-3 items-end">
                      {scoreEnabled && (
                      <div className="flex-1 min-w-0">
                        <p className="label">Score</p>
                        <div className="flex gap-1.5 flex-wrap">
                          {scoreOptions.map((opt) => {
                            const n = parseInt(opt);
                            const value = isNaN(n) ? 0 : n;
                            return (
                            <button
                              key={opt}
                              onClick={() => setScore(value)}
                              className={clsx(
                                "min-w-[2.25rem] h-9 px-2 rounded-full text-sm font-bold transition-all",
                                score === value
                                  ? "bg-accent text-slate-900"
                                  : "bg-surface-2 text-muted border border-border hover:border-accent/50"
                              )}
                            >
                              {opt}
                            </button>
                            );
                          })}
                        </div>
                      </div>
                      )}
                      {opTimeEnabled && (
                      <div className="w-20 shrink-0">
                        <p className="label">OT</p>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="1.32"
                          value={opTime}
                          onChange={(e) => setOpTime(formatOpTime(e.target.value))}
                          className="input text-center text-sm py-2"
                        />
                      </div>
                      )}
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
                        onClick={handleLogKick}
                        disabled={!result}
                        className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        LOG KICK
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove kick #${currentKickIdx + 1} (${currentPlan.athlete}) from the plan?`)) {
                            handleRemoveFromPlan();
                          }
                        }}
                        className="px-3 py-3 rounded-input text-xs border border-miss/30 text-miss/60 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all"
                        title="Remove this kick from plan"
                      >
                        ✕
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
                  <SessionLog kicks={sessionKicks} onDelete={handleDeleteKick} />
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
                  <button
                    onClick={saveDraftToCloud}
                    className={`btn-ghost text-xs py-1.5 px-3 ${draftSaved ? "text-make" : ""}`}
                  >
                    {draftSaved ? "Saved!" : "Save Draft"}
                  </button>
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
            const byAthlete: Record<string, FGKick[]> = {};
            committedKicks.forEach((k) => { if (!byAthlete[k.athlete]) byAthlete[k.athlete] = []; byAthlete[k.athlete].push(k); });
            return Object.entries(byAthlete).map(([name, ak]) => {
              const fgKicks = ak.filter((k) => !k.isPAT);
              const patKicks = ak.filter((k) => k.isPAT);
              const fgAtt = fgKicks.length;
              const fgMade = fgKicks.filter((k) => k.result.startsWith("Y")).length;
              const fgPct = fgAtt > 0 ? `${Math.round((fgMade / fgAtt) * 100)}%` : "—";
              const fgAvgSc = fgAtt > 0 ? (fgKicks.reduce((s, k) => s + k.score, 0) / fgAtt).toFixed(1) : "—";
              const fgMadeKicks = fgKicks.filter((k) => k.result.startsWith("Y"));
              const long = fgMadeKicks.length > 0 ? Math.max(...fgMadeKicks.map((k) => k.dist)) : 0;
              const patAtt = patKicks.length;
              const patMade = patKicks.filter((k) => k.result.startsWith("Y")).length;
              return (
                <div key={name} className="card-2 p-3">
                  <p className="text-sm font-semibold text-slate-100 mb-2">{name}</p>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">FG</p>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                    <div><span className="text-muted">Made</span> <span className="text-make font-medium ml-1">{fgMade}</span></div>
                    <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{fgAtt}</span></div>
                    <div><span className="text-muted">Pct</span> <span className="text-accent font-medium ml-1">{fgPct}</span></div>
                    {scoreEnabled && <div><span className="text-muted">Score</span> <span className="text-slate-200 font-medium ml-1">{fgAvgSc}</span></div>}
                    <div><span className="text-muted">Long</span> <span className="text-slate-200 font-medium ml-1">{long > 0 ? `${long}` : "—"}</span></div>
                  </div>
                  {patAtt > 0 && (
                    <>
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mt-2.5 mb-1">PAT</p>
                      <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                        <div><span className="text-muted">Made</span> <span className="text-make font-medium ml-1">{patMade}</span></div>
                        <div><span className="text-muted">Att</span> <span className="text-slate-200 font-medium ml-1">{patAtt}</span></div>
                      </div>
                    </>
                  )}
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
                  <th className="table-header">Dist</th>
                  <th className="table-header">Pos</th>
                  <th className="table-header">Result</th>
                  {scoreEnabled && <th className="table-header">Score</th>}
                </tr>
              </thead>
              <tbody>
                {committedKicks.map((k, i) => (
                  <tr key={i} className="hover:bg-surface/30 transition-colors">
                    <td className="table-cell text-left text-muted">{k.kickNum ?? i + 1}{k.starred ? <span className="text-amber-400"> ★</span> : ""}</td>
                    <td className="table-name">{k.athlete}</td>
                    <td className="table-cell">{k.isPAT ? "PAT" : `${k.dist} yd`}</td>
                    <td className="table-cell text-muted">{k.isPAT ? "—" : k.pos}</td>
                    <td className="table-cell">
                      <span className={clsx("text-xs font-semibold", k.result.startsWith("Y") ? "text-make" : "text-miss")}>
                        {RESULT_LABELS[k.result] ?? k.result}
                      </span>
                    </td>
                    {scoreEnabled && <td className="table-cell">{k.score}</td>}
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

  if (showSetupPrompt) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-14 h-14 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center mx-auto text-2xl">
            <span>&#9881;</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100">Set Up FG Settings First</h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Before entering any stats, it&apos;s best to configure your practice log parameters — make/miss tracking detail, kick score system, operation time, and snap distance.
          </p>
          <div className="flex flex-col gap-2">
            <Link
              href="/kicking/settings"
              className="btn-primary py-3 rounded-input text-sm font-bold text-center block"
            >
              Go to FG Settings
            </Link>
            <button
              onClick={() => setShowSetupPrompt(false)}
              className="text-xs text-muted hover:text-white transition-colors py-2"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Practice Log Table */}
        <div className="lg:w-[60%] flex flex-col border-b lg:border-b-0 lg:border-r border-border min-h-0">
          {/* Weather input / display */}
          <div className="px-4 py-2 border-b border-border shrink-0">
            {weatherLocked || viewOnly ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <p className="text-[10px] text-muted">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}</p>
                  {weather && <p className="text-xs text-slate-300">{weather}</p>}
                  {!weather && viewOnly && <p className="text-xs text-muted italic">No weather set</p>}
                </div>
                {!viewOnly && (
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
          {!viewOnly && !isContinuing && (
            <div className={clsx(
              "px-4 py-2 border-b shrink-0 space-y-2 transition-colors",
              sessionMode === "game" ? "bg-red-500/10 border-red-500/40" : "border-border"
            )}>
              <div className="flex items-center gap-3">
                <div className="flex rounded-input border border-border overflow-hidden" data-tutorial="mode-toggle">
                  <button
                    onClick={() => switchMode("practice")}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-semibold transition-colors",
                      sessionMode === "practice" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                    )}
                  >
                    Practice
                  </button>
                  <button
                    onClick={() => switchMode("game")}
                    className={clsx(
                      "px-3 py-1.5 text-xs font-semibold transition-colors border-l border-border",
                      sessionMode === "game" ? "bg-red-500 text-white" : "text-red-400/60 hover:text-red-400"
                    )}
                  >
                    GAME
                  </button>
                </div>
                <div className="flex rounded-input border border-border overflow-hidden" data-tutorial="entry-mode-toggle">
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
                  <span className={clsx("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", sessionMode === "game" ? "bg-red-500" : "bg-red-500")} />
                  <span className={clsx("relative inline-flex rounded-full h-2.5 w-2.5", sessionMode === "game" ? "bg-red-500" : "bg-red-500")} />
                </span>
              )}
              {sessionMode === "game" ? (manualEntry ? "Game Log" : "Live Game Log") : (manualEntry ? "Practice Log" : "Live Practice Log")}
              {isContinuing && (
                <span className="text-accent text-xs font-normal">
                  ({sessionKicks.length} logged)
                </span>
              )}
            </h2>
            {!viewOnly && (
              <button
                onClick={addRow}
                className="text-xs px-2.5 py-1 rounded-input border border-border text-muted hover:text-white hover:bg-surface-2 font-semibold transition-all"
              >
                + Row
              </button>
            )}
          </div>

          {/* Scrollable table */}
          <div className="flex-1 overflow-y-auto min-h-0" data-tutorial="session-table">
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
                  {manualEntry && sessionMode === "game" && (
                    <>
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-24 border-b border-red-500/40 text-[10px]">Result</th>
                      {scoreEnabled && (
                        <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">Score</th>
                      )}
                      {opTimeEnabled && (
                        <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">OT</th>
                      )}
                      <th className="bg-red-500/10 text-red-400 font-bold py-2 px-1 text-center w-14 border-b border-red-500/40 text-[10px]">Save</th>
                    </>
                  )}
                  {manualEntry && sessionMode !== "game" && (
                    <>
                      <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-24 border-b border-border">
                        Result
                      </th>
                      {scoreEnabled && (
                        <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                          Score
                        </th>
                      )}
                      {opTimeEnabled && (
                        <th className="bg-surface-2 text-muted font-bold py-2 px-1 text-center w-14 border-b border-border">
                          OT
                        </th>
                      )}
                    </>
                  )}
                  {sessionMode !== "game" && (
                    <th className="bg-surface-2 text-amber-400 font-bold py-2 px-1 text-center w-8 border-b border-border">★</th>
                  )}
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
                            disabled={viewOnly}
                            className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {athletes.map((a) => (
                              <option key={a.name} value={a.name}>{a.name}</option>
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
                            readOnly={viewOnly}
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
                            disabled={viewOnly}
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
                      {manualEntry && sessionMode === "game" && (() => {
                        const isSaved = sessionKicks.some((k) => k.kickNum === filledIdx + 1);
                        return (
                          <>
                            <td className="py-1 px-1">
                              <select
                                value={row.result}
                                onChange={(e) => {
                                  updateRow(idx, "result", e.target.value);
                                  if (e.target.value.startsWith("X")) updateRow(idx, "score", "0");
                                }}
                                disabled={viewOnly || isSaved}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              >
                                <option value="">—</option>
                                {(() => {
                                  const makes = makeMode === "simple" ? ["YC"] : ["YL", "YC", "YR"];
                                  const misses = missMode === "simple" ? ["X"] : ["XL", "XS", "XR"];
                                  return [...makes, ...misses].map((r) => (
                                    <option key={r} value={r}>{RESULT_LABELS[r]}</option>
                                  ));
                                })()}
                              </select>
                            </td>
                            {scoreEnabled && (
                              <td className="py-1 px-1">
                                <select
                                  value={row.score}
                                  onChange={(e) => updateRow(idx, "score", e.target.value)}
                                  disabled={viewOnly || isSaved}
                                  className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                                >
                                  <option value="">—</option>
                                  {scoreOptions.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </td>
                            )}
                            {opTimeEnabled && (
                            <td className="py-1 px-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="sec"
                                value={row.opTime}
                                onChange={(e) => updateRow(idx, "opTime", formatOpTime(e.target.value))}
                                readOnly={viewOnly || isSaved}
                                className={clsx("w-full bg-transparent border rounded px-1 py-1 text-xs text-center focus:outline-none", isSaved ? "border-make/30 text-make" : "border-red-500/40 text-slate-200 focus:border-red-500/60")}
                              />
                            </td>
                            )}
                            <td className="py-1 px-1 text-center">
                              {isSaved ? (
                                <button
                                  onClick={() => handleUnsaveGameRow(idx)}
                                  className="text-[10px] px-1 text-make/60 hover:text-miss transition-colors"
                                  title="Unlock this kick"
                                >
                                  ✓ Saved
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleSaveGameRow(idx)}
                                  disabled={viewOnly || !row.athlete || !row.result}
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
                            <select
                              value={row.result}
                              onChange={(e) => {
                                updateRow(idx, "result", e.target.value);
                                if (e.target.value.startsWith("X")) {
                                  updateRow(idx, "score", "0");
                                }
                              }}
                              disabled={viewOnly}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                            >
                              <option value="">—</option>
                              {(() => {
                                const makes = makeMode === "simple" ? ["YC"] : ["YL", "YC", "YR"];
                                const misses = missMode === "simple" ? ["X"] : ["XL", "XS", "XR"];
                                return [...makes, ...misses].map((r) => (
                                  <option key={r} value={r}>{RESULT_LABELS[r]}</option>
                                ));
                              })()}
                            </select>
                          </td>
                          {scoreEnabled && (
                            <td className="py-1 px-1">
                              <select
                                value={row.score}
                                onChange={(e) => updateRow(idx, "score", e.target.value)}
                                disabled={viewOnly}
                                className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                              >
                                <option value="">—</option>
                                {scoreOptions.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                          )}
                          {opTimeEnabled && (
                          <td className="py-1 px-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="sec"
                              value={row.opTime}
                              onChange={(e) => updateRow(idx, "opTime", formatOpTime(e.target.value))}
                              readOnly={viewOnly}
                              className="w-full bg-transparent border border-border/50 rounded px-1 py-1 text-xs text-slate-200 text-center focus:outline-none focus:border-accent/60"
                            />
                          </td>
                          )}
                        </>
                      )}
                      {sessionMode !== "game" && (
                        <td className="py-1 px-1 text-center">
                          {!viewOnly ? (
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
                        {!viewOnly && (
                          isLocked ? (
                            <div className="flex items-center gap-0.5 justify-center">
                              {sessionMode === "game" ? (
                                <button
                                  onClick={() => handleUnsaveGameRow(idx)}
                                  className="text-accent/60 hover:text-accent transition-colors text-[10px] leading-none px-1"
                                  title="Unlock this kick for editing"
                                >
                                  ✏️
                                </button>
                              ) : (
                                <>
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
                                </>
                              )}
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
          <div className="border-t border-border p-3 flex items-center gap-2 shrink-0 flex-wrap" data-tutorial="start-session">
            <span className="text-xs text-muted flex-1">
              {filledCount === 0
                ? "0 kicks entered"
                : `${filledCount} kick${filledCount !== 1 ? "s" : ""} entered`}
            </span>
            {!viewOnly && (
              <>
                <div className="flex gap-2">
                  {deletedRowStack.length > 0 && (
                    <button
                      onClick={undoDeleteRow}
                      className="btn-ghost text-xs py-1.5 px-3"
                    >
                      ↩ Undo
                    </button>
                  )}
                  <button
                    onClick={saveDraftToCloud}
                    className={`btn-ghost text-xs py-1.5 px-3 ${draftSaved ? "text-make" : ""}`}
                  >
                    {draftSaved ? "Saved!" : "Save Draft"}
                  </button>
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
              </>
            )}
          </div>
        </div>

        {/* Right: Field view (game) or Season stats */}
        <div className={clsx("lg:w-[40%] overflow-y-auto p-4 space-y-3", sessionMode === "game" && "bg-gradient-to-b from-red-950/20 to-transparent")}>
          {sessionMode === "game" ? (
            <>
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest">
                Game Chart · {sessionKicks.length} kick{sessionKicks.length !== 1 ? "s" : ""}
              </p>
              {(() => {
                const kicks = sessionKicks.filter((k) => !k.isPAT);
                const att = kicks.length;
                const made = kicks.filter((k) => k.result.startsWith("Y")).length;
                const longFG = kicks.reduce((m, k) => k.result.startsWith("Y") ? Math.max(m, k.dist) : m, 0);
                if (sessionKicks.length === 0) {
                  return <p className="text-xs text-muted">Save a kick to see it on the field.</p>;
                }
                return (
                  <div className="grid grid-cols-3 gap-2">
                    <StatCard label="Made" value={`${made}/${att}`} accent glow />
                    <StatCard label="%" value={makePct(att, made)} />
                    <StatCard label="Long" value={longFG > 0 ? `${longFG}` : "—"} />
                  </div>
                );
              })()}
              <FGFieldView kicks={sessionKicks} />
            </>
          ) : (
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
          )}
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
