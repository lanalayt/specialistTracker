import * as XLSX from "xlsx";
import type {
  AthleteStats,
  FGKick,
  FGPosition,
  DistRange,
  PuntAthleteStats,
  PuntEntry,
  PuntStatBucket,
  KickoffAthleteStats,
  KickoffEntry,
  LongSnapAthleteStats,
  LongSnapEntry,
  LongSnapStatBucket,
} from "@/types";
import { POSITIONS, DIST_RANGES, PUNT_HASHES, SNAP_TYPES } from "@/types";
import {
  processKick,
  emptyAthleteStats,
  makePct,
  processPunt,
  emptyPuntStats,
  processKickoff,
  emptyKickoffStats,
  processLongSnap,
  emptyLongSnapStats,
} from "@/lib/stats";

// ─── Team logo helper ────────────────────────────────────────────────────────

export function getTeamLogo(): string | null {
  try { return localStorage.getItem("team_logo"); } catch { return null; }
}

export function addLogoToPDF(doc: { addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void; internal: { pageSize: { getWidth: () => number } } }, landscape?: boolean): void {
  const logo = getTeamLogo();
  if (!logo) return;
  const pageW = landscape ? 297 : 210;
  try { doc.addImage(logo, "PNG", pageW - 28, 5, 18, 18); } catch {}
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96"><rect x="0" y="0" width="96" height="96" rx="22" fill="#0E1318" stroke="rgba(46,224,168,0.25)" stroke-width="1"/><g fill="none" stroke="#2EE0A8" stroke-width="3.5" stroke-linecap="round"><path d="M11 24 L11 11 L24 11"/><path d="M85 24 L85 11 L72 11"/><path d="M11 72 L11 85 L24 85"/><path d="M85 72 L85 85 L72 85"/></g><text x="29" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="30" letter-spacing="-1.2" fill="#FFFFFF">S</text><text x="67" y="58" text-anchor="middle" font-family="Arial,sans-serif" font-weight="800" font-size="30" letter-spacing="-1.2" fill="#FFFFFF">T</text><circle cx="48" cy="50" r="7" fill="#E5B649" opacity="0.18"/><circle cx="48" cy="50" r="4" fill="#E5B649"/></svg>`;

let _appLogoCache: string | null = null;
export async function addAppLogoToPDFFooter(doc: { addImage: (data: string, format: string, x: number, y: number, w: number, h: number) => void; internal: { pageSize: { getHeight: () => number; getWidth: () => number } } }, landscape?: boolean): Promise<void> {
  try {
    if (!_appLogoCache) {
      const canvas = document.createElement("canvas");
      canvas.width = 96; canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Logo image failed to load"));
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(LOGO_SVG);
      });
      ctx.drawImage(img, 0, 0, 96, 96);
      _appLogoCache = canvas.toDataURL("image/png");
    }
    const pageW = landscape ? 297 : 210;
    const pageH = landscape ? 210 : 297;
    doc.addImage(_appLogoCache, "PNG", (pageW - 10) / 2, pageH - 18, 10, 10);
  } catch (err) { console.error("PDF footer logo failed:", err); }
}

// ─── Shared types ───────────────────────────────────────────────────────────

type CellValue = string | number;
type Row = CellValue[];

// ─── Date helpers ───────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getSunday(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function filterSessions<T extends { date?: string }>(sessions: T[], start: Date, end: Date): T[] {
  return sessions.filter((s) => {
    if (!s.date) return true;
    const d = new Date(s.date);
    return d >= start && d <= end;
  });
}

// ─── AOA helpers ────────────────────────────────────────────────────────────

function aoaToSheet(rows: Row[]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto-size columns based on max content width
  const colWidths: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      const len = String(cell ?? "").length;
      colWidths[i] = Math.max(colWidths[i] ?? 0, len);
    });
  });
  ws["!cols"] = colWidths.map((w) => ({ wch: Math.min(w + 2, 30) }));
  return ws;
}

// ─── FG Kicking Export ──────────────────────────────────────────────────────

const POS_LABELS: Record<FGPosition, string> = { LH: "Left Hash", RH: "Right Hash", LM: "Left Mid", M: "Middle", RM: "Right Mid" };
const DIST_LABELS: Record<DistRange, string> = { "20-29": "20-29 yds", "30-39": "30-39 yds", "40-49": "40-49 yds", "50-60": "50-60 yds", "60+": "60+ yds" };

function computeFGStats(athletes: string[], history: { entries?: FGKick[] }[], filter: (k: FGKick) => boolean): Record<string, AthleteStats> {
  let statsMap: Record<string, AthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyAthleteStats(); });
  history.forEach((session) => {
    (session.entries ?? [] as FGKick[]).filter(filter).forEach((k) => {
      statsMap = processKick(k as FGKick, statsMap);
    });
  });
  return statsMap;
}

function fgStatsToAOA(athletes: string[], statsMap: Record<string, AthleteStats>): Row[] {
  const rows: Row[] = [];

  // ── Overall FG ──
  rows.push(["OVERALL FG"]);
  rows.push(["Athlete", "Made", "Att", "%", "Kick Score", "Long FG"]);
  athletes.forEach((a) => {
    const s = statsMap[a];
    if (!s) return;
    const o = s.overall;
    rows.push([
      a,
      o.made,
      o.att,
      o.att > 0 ? `${Math.round((o.made / o.att) * 100)}%` : "—",
      o.att > 0 ? +(o.score / o.att).toFixed(1) : "—",
      o.longFG > 0 ? o.longFG : "—",
    ]);
  });

  // ── Miss Chart ──
  rows.push([]);
  rows.push(["MISS CHART"]);
  rows.push(["Athlete", "Miss Left", "Miss Right", "Miss Short", "Total"]);
  athletes.forEach((a) => {
    const s = statsMap[a];
    if (!s) return;
    rows.push([a, s.miss.XL, s.miss.XR, s.miss.XS, s.miss.XL + s.miss.XR + s.miss.XS + (s.miss.X || 0)]);
  });

  // ── By Hash / Position ──
  rows.push([]);
  rows.push(["BY HASH / POSITION"]);
  POSITIONS.forEach((pos) => {
    rows.push([]);
    rows.push([POS_LABELS[pos]]);
    rows.push(["Athlete", "Made", "Att", "%", "Kick Score"]);
    athletes.forEach((a) => {
      const s = statsMap[a];
      if (!s) return;
      const b = s.position[pos];
      rows.push([
        a,
        b.made,
        b.att,
        b.att > 0 ? `${Math.round((b.made / b.att) * 100)}%` : "—",
        b.att > 0 ? +(b.score / b.att).toFixed(1) : "—",
      ]);
    });
  });

  // ── By Distance ──
  rows.push([]);
  rows.push(["BY DISTANCE"]);
  DIST_RANGES.forEach((range) => {
    rows.push([]);
    rows.push([DIST_LABELS[range]]);
    rows.push(["Athlete", "Made", "Att", "%", "Kick Score"]);
    athletes.forEach((a) => {
      const s = statsMap[a];
      if (!s) return;
      const b = s.distance[range];
      rows.push([
        a,
        b.made,
        b.att,
        b.att > 0 ? `${Math.round((b.made / b.att) * 100)}%` : "—",
        b.att > 0 ? +(b.score / b.att).toFixed(1) : "—",
      ]);
    });
  });

  // ── PAT ──
  rows.push([]);
  rows.push(["PAT"]);
  rows.push(["Athlete", "Made", "Att", "%"]);
  athletes.forEach((a) => {
    const s = statsMap[a];
    if (!s) return;
    const p = s.pat;
    rows.push([
      a,
      p.made,
      p.att,
      p.att > 0 ? `${Math.round((p.made / p.att) * 100)}%` : "—",
    ]);
  });

  return rows;
}

export function exportFGStats(
  athletes: string[],
  history: { date?: string; entries?: FGKick[] }[],
  hasStarred: boolean
) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  // All Time
  const allStats = computeFGStats(athletes, history, () => true);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(fgStatsToAOA(athletes, allStats)), "All Time");

  // Weekly
  const weekStart = getMonday(now);
  const weekEnd = getSunday(weekStart);
  const weekHistory = filterSessions(history, weekStart, weekEnd);
  const weekStats = computeFGStats(athletes, weekHistory, () => true);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(fgStatsToAOA(athletes, weekStats)), "Weekly");

  // Monthly
  const monthStart = getMonthStart(now);
  const monthEnd = getMonthEnd(now);
  const monthHistory = filterSessions(history, monthStart, monthEnd);
  const monthStats = computeFGStats(athletes, monthHistory, () => true);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(fgStatsToAOA(athletes, monthStats)), "Monthly");

  // Live Reps
  if (hasStarred) {
    const starredStats = computeFGStats(athletes, history, (k) => !!k.starred);
    XLSX.utils.book_append_sheet(wb, aoaToSheet(fgStatsToAOA(athletes, starredStats)), "Live Reps");
  }

  XLSX.writeFile(wb, "FG_Kicking_Stats.xlsx");
}

// ─── Punting Export ─────────────────────────────────────────────────────────

const HASH_LABELS: Record<string, string> = { LH: "Left Hash", LM: "Left Mid", M: "Middle", RM: "Right Mid", RH: "Right Hash" };

function computePuntStats(athletes: string[], history: { entries?: PuntEntry[] }[], filter: (p: PuntEntry) => boolean): Record<string, PuntAthleteStats> {
  let statsMap: Record<string, PuntAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyPuntStats(); });
  history.forEach((session) => {
    (session.entries ?? [] as PuntEntry[]).filter(filter).forEach((p) => {
      statsMap = processPunt(p as PuntEntry, statsMap);
    });
  });
  return statsMap;
}

function puntBucketRows(athletes: string[], statsMap: Record<string, PuntAthleteStats>, getBucket: (s: PuntAthleteStats) => PuntStatBucket): Row[] {
  const rows: Row[] = [];
  rows.push(["Athlete", "Att", "Avg Yds", "Avg HT", "Avg OT", "DA%", "Crit"]);
  athletes.forEach((a) => {
    const s = statsMap[a];
    if (!s) return;
    const b = getBucket(s);
    if (!b) return;
    const yAtt = b.yardsAtt ?? b.att;
    const hAtt = b.hangAtt ?? b.att;
    const oAtt = b.opTimeAtt ?? b.att;
    const dAtt = b.daAtt ?? b.att;
    rows.push([
      a,
      b.att,
      yAtt > 0 ? +(b.totalYards / yAtt).toFixed(1) : "—",
      hAtt > 0 ? +(b.totalHang / hAtt).toFixed(2) : "—",
      oAtt > 0 ? +(b.totalOpTime / oAtt).toFixed(2) : "—",
      dAtt > 0 ? `${Math.round((b.totalDirectionalAccuracy / dAtt) * 100)}%` : "—",
      b.criticalDirections,
    ]);
  });
  return rows;
}

function loadPuntTypes(): { id: string; label: string }[] {
  if (typeof window === "undefined") return [
    { id: "BLUE", label: "Blue" }, { id: "RED", label: "Red" },
    { id: "POOCH_BLUE", label: "Pooch Blue" }, { id: "POOCH_RED", label: "Pooch Red" },
    { id: "BROWN", label: "Brown" },
  ];
  try {
    const raw = localStorage.getItem("puntSettings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.puntTypes && parsed.puntTypes.length > 0) return parsed.puntTypes;
    }
  } catch {}
  return [
    { id: "BLUE", label: "Blue" }, { id: "RED", label: "Red" },
    { id: "POOCH_BLUE", label: "Pooch Blue" }, { id: "POOCH_RED", label: "Pooch Red" },
    { id: "BROWN", label: "Brown" },
  ];
}

function puntStatsToAOA(athletes: string[], statsMap: Record<string, PuntAthleteStats>, puntTypes: { id: string; label: string }[]): Row[] {
  const rows: Row[] = [];

  // ── Overall ──
  rows.push(["OVERALL PUNTING"]);
  rows.push(...puntBucketRows(athletes, statsMap, (s) => s.overall));

  // ── By Type ──
  rows.push([]);
  rows.push(["BY TYPE"]);
  puntTypes.forEach(({ id, label }) => {
    rows.push([]);
    rows.push([label]);
    rows.push(...puntBucketRows(athletes, statsMap, (s) => s.byType[id]));
  });

  // ── By Hash / Position ──
  rows.push([]);
  rows.push(["BY HASH / POSITION"]);
  PUNT_HASHES.forEach((h) => {
    rows.push([]);
    rows.push([HASH_LABELS[h] || h]);
    rows.push(...puntBucketRows(athletes, statsMap, (s) => s.byHash[h]));
  });

  return rows;
}

export function exportPuntStats(
  athletes: string[],
  history: { date?: string; entries?: PuntEntry[] }[],
  hasStarred: boolean
) {
  const wb = XLSX.utils.book_new();
  const now = new Date();
  const puntTypes = loadPuntTypes();

  const allStats = computePuntStats(athletes, history, () => true);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(puntStatsToAOA(athletes, allStats, puntTypes)), "All Time");

  const weekHistory = filterSessions(history, getMonday(now), getSunday(getMonday(now)));
  const weekStats = computePuntStats(athletes, weekHistory, () => true);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(puntStatsToAOA(athletes, weekStats, puntTypes)), "Weekly");

  const monthHistory = filterSessions(history, getMonthStart(now), getMonthEnd(now));
  const monthStats = computePuntStats(athletes, monthHistory, () => true);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(puntStatsToAOA(athletes, monthStats, puntTypes)), "Monthly");

  if (hasStarred) {
    const starredStats = computePuntStats(athletes, history, (p) => !!p.starred);
    XLSX.utils.book_append_sheet(wb, aoaToSheet(puntStatsToAOA(athletes, starredStats, puntTypes)), "Live Reps");
  }

  XLSX.writeFile(wb, "Punting_Stats.xlsx");
}

// ─── Kickoff Export ─────────────────────────────────────────────────────────

function computeKOStats(athletes: string[], history: { entries?: KickoffEntry[] }[]): Record<string, KickoffAthleteStats> {
  let statsMap: Record<string, KickoffAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyKickoffStats(); });
  history.forEach((session) => {
    (session.entries ?? [] as KickoffEntry[]).forEach((e) => {
      statsMap = processKickoff(e as KickoffEntry, statsMap);
    });
  });
  return statsMap;
}

function koStatsToAOA(athletes: string[], statsMap: Record<string, KickoffAthleteStats>): Row[] {
  const rows: Row[] = [];

  rows.push(["KICKOFF STATS"]);
  rows.push(["Athlete", "Kickoffs", "Touchbacks", "TB%", "OOB", "Avg Dist", "Avg Hang"]);
  athletes.forEach((a) => {
    const s = statsMap[a];
    if (!s) return;
    const o = s.overall;
    const dAtt = o.distAtt ?? o.att;
    const hAtt = o.hangAtt ?? o.att;
    rows.push([
      a,
      o.att,
      o.touchbacks,
      o.att > 0 ? `${Math.round((o.touchbacks / o.att) * 100)}%` : "—",
      o.oob,
      dAtt > 0 ? +(o.totalDist / dAtt).toFixed(1) : "—",
      hAtt > 0 ? +(o.totalHang / hAtt).toFixed(2) : "—",
    ]);
  });

  return rows;
}

export function exportKickoffStats(
  athletes: string[],
  history: { date?: string; entries?: KickoffEntry[] }[]
) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  const allStats = computeKOStats(athletes, history);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(koStatsToAOA(athletes, allStats)), "All Time");

  const weekHistory = filterSessions(history, getMonday(now), getSunday(getMonday(now)));
  XLSX.utils.book_append_sheet(wb, aoaToSheet(koStatsToAOA(athletes, computeKOStats(athletes, weekHistory))), "Weekly");

  const monthHistory = filterSessions(history, getMonthStart(now), getMonthEnd(now));
  XLSX.utils.book_append_sheet(wb, aoaToSheet(koStatsToAOA(athletes, computeKOStats(athletes, monthHistory))), "Monthly");

  XLSX.writeFile(wb, "Kickoff_Stats.xlsx");
}

// ─── Long Snap Export ───────────────────────────────────────────────────────

function computeSnapStats(athletes: string[], history: { entries?: LongSnapEntry[] }[]): Record<string, LongSnapAthleteStats> {
  let statsMap: Record<string, LongSnapAthleteStats> = {};
  athletes.forEach((a) => { statsMap[a] = emptyLongSnapStats(); });
  history.forEach((session) => {
    (session.entries ?? [] as LongSnapEntry[]).forEach((e) => {
      statsMap = processLongSnap(e as LongSnapEntry, statsMap);
    });
  });
  return statsMap;
}

function snapBucketRows(athletes: string[], statsMap: Record<string, LongSnapAthleteStats>, getBucket: (s: LongSnapAthleteStats) => LongSnapStatBucket): Row[] {
  const rows: Row[] = [];
  rows.push(["Athlete", "Snaps", "On Target%", "Avg Time"]);
  athletes.forEach((a) => {
    const s = statsMap[a];
    if (!s) return;
    const b = getBucket(s);
    rows.push([
      a,
      b.att,
      b.att > 0 ? `${Math.round((b.onTarget / b.att) * 100)}%` : "—",
      b.att > 0 ? +(b.totalTime / b.att).toFixed(3) : "—",
    ]);
  });
  return rows;
}

function snapStatsToAOA(athletes: string[], statsMap: Record<string, LongSnapAthleteStats>): Row[] {
  const rows: Row[] = [];

  // ── Overall ──
  rows.push(["OVERALL LONG SNAP"]);
  rows.push(...snapBucketRows(athletes, statsMap, (s) => s.overall));

  // ── By Type ──
  rows.push([]);
  rows.push(["BY SNAP TYPE"]);
  SNAP_TYPES.forEach((t) => {
    rows.push([]);
    rows.push([t]);
    rows.push(...snapBucketRows(athletes, statsMap, (s) => s.byType[t]));
  });

  return rows;
}

export function exportLongSnapStats(
  athletes: string[],
  history: { date?: string; entries?: LongSnapEntry[] }[]
) {
  const wb = XLSX.utils.book_new();
  const now = new Date();

  const allStats = computeSnapStats(athletes, history);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(snapStatsToAOA(athletes, allStats)), "All Time");

  const weekHistory = filterSessions(history, getMonday(now), getSunday(getMonday(now)));
  XLSX.utils.book_append_sheet(wb, aoaToSheet(snapStatsToAOA(athletes, computeSnapStats(athletes, weekHistory))), "Weekly");

  const monthHistory = filterSessions(history, getMonthStart(now), getMonthEnd(now));
  XLSX.utils.book_append_sheet(wb, aoaToSheet(snapStatsToAOA(athletes, computeSnapStats(athletes, monthHistory))), "Monthly");

  XLSX.writeFile(wb, "Long_Snap_Stats.xlsx");
}

export function exportLongSnapStatsPDF(
  athletes: string[],
  history: { date?: string; entries?: LongSnapEntry[] }[]
) {
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(async ({ default: autoTable }) => {
      const doc = new jsPDF();
      addLogoToPDF(doc as any);
      const statsMap = computeSnapStats(athletes, history);

      doc.setFontSize(16);
      doc.text("Long Snap Statistics", 14, 15);

      const overallHead = [["Athlete", "Snaps", "On Target %", "Avg Time"]];
      const overallBody: string[][] = [];
      athletes.forEach((a) => {
        const s = statsMap[a];
        if (!s || s.overall.att === 0) return;
        const b = s.overall;
        overallBody.push([a, String(b.att), b.att > 0 ? `${Math.round((b.onTarget / b.att) * 100)}%` : "—", b.att > 0 && b.totalTime > 0 ? `${(b.totalTime / b.att).toFixed(2)}s` : "—"]);
      });
      if (overallBody.length > 0) {
        doc.setFontSize(12);
        doc.text("Overall", 14, 24);
        autoTable(doc, { head: overallHead, body: overallBody, startY: 28, styles: { fontSize: 9 } });
      }

      const snapTypes = ["FG", "PAT", "PUNT"] as const;
      snapTypes.forEach((t) => {
        const typeBody: string[][] = [];
        athletes.forEach((a) => {
          const s = statsMap[a];
          if (!s) return;
          const b = s.byType[t];
          if (!b || b.att === 0) return;
          typeBody.push([a, String(b.att), b.att > 0 ? `${Math.round((b.onTarget / b.att) * 100)}%` : "—", b.att > 0 && b.totalTime > 0 ? `${(b.totalTime / b.att).toFixed(2)}s` : "—"]);
        });
        if (typeBody.length > 0) {
          const finalY = (doc as any).lastAutoTable?.finalY ?? 40;
          doc.setFontSize(11);
          doc.text(t === "FG" ? "FG / Short Snap" : t === "PAT" ? "PAT" : "Punt / Long Snap", 14, finalY + 10);
          autoTable(doc, { head: overallHead, body: typeBody, startY: finalY + 14, styles: { fontSize: 9 } });
        }
      });

      await addAppLogoToPDFFooter(doc as any, false);
      doc.save("Long_Snap_Stats.pdf");
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
//  Individual Session Exports (Excel + PDF)
// ═══════════════════════════════════════════════════════════════════════

/** Export a single FG session to Excel */
export function exportFGSession(label: string, kicks: FGKick[]): void {
  const hasScore = kicks.some((k) => k.score > 0);
  const hasOT = kicks.some((k) => k.opTime && k.opTime > 0);
  const header: Row = ["#", "Athlete", "Distance", "Position", "Result"];
  if (hasScore) header.push("Score");
  if (hasOT) header.push("OT");
  const rows: Row[] = [
    ["FG Session — " + label],
    [],
    header,
    ...kicks.map((k, i) => {
      const row: Row = [
        k.kickNum ?? i + 1,
        k.athlete,
        k.isPAT ? "PAT" : k.dist,
        k.isPAT ? "—" : k.pos,
        k.result.startsWith("Y") ? "GOOD" : k.result === "XL" ? "MISS LEFT" : k.result === "XR" ? "MISS RIGHT" : k.result === "XS" ? "MISS SHORT" : "MISS",
      ];
      if (hasScore) row.push(k.score);
      if (hasOT) row.push(k.opTime && k.opTime > 0 ? Number(k.opTime.toFixed(2)) : "—");
      return row;
    }),
  ];
  // Summary
  const fgKicks = kicks.filter((k) => !k.isPAT);
  const makes = fgKicks.filter((k) => k.result.startsWith("Y")).length;
  rows.push([], ["Summary"], ["Made", makes], ["Attempted", fgKicks.length], ["Pct", fgKicks.length > 0 ? `${Math.round((makes / fgKicks.length) * 100)}%` : "—"]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaToSheet(rows), "Session");
  XLSX.writeFile(wb, `FG_${label.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
}

/** Export a single punt session to Excel */
export function exportPuntSession(label: string, punts: PuntEntry[]): void {
  const rows: Row[] = [
    ["Punt Session — " + label],
    [],
    ["#", "Athlete", "Type", "Yards", "Hang Time", "Op Time", "Dir Accuracy"],
    ...punts.map((p, i) => [
      p.kickNum ?? i + 1,
      p.athlete,
      p.type || "—",
      p.yards,
      p.hangTime,
      p.opTime || 0,
      p.directionalAccuracy ?? "—",
    ]),
  ];
  const ydsE = punts.filter((p) => p.yards > 0);
  const htE = punts.filter((p) => p.hangTime > 0);
  const avgYds = ydsE.length > 0 ? (ydsE.reduce((s, p) => s + p.yards, 0) / ydsE.length).toFixed(1) : "—";
  const avgHT = htE.length > 0 ? (htE.reduce((s, p) => s + p.hangTime, 0) / htE.length).toFixed(2) : "—";
  rows.push([], ["Summary"], ["Punts", punts.length], ["Avg Distance", avgYds], ["Avg Hang Time", avgHT]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaToSheet(rows), "Session");
  XLSX.writeFile(wb, `Punt_${label.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
}

/** Export a single kickoff session to Excel */
export function exportKOSession(label: string, kicks: KickoffEntry[]): void {
  const rows: Row[] = [
    ["Kickoff Session — " + label],
    [],
    ["#", "Athlete", "Type", "Distance", "Hang Time", "Direction"],
    ...kicks.map((k, i) => [
      k.kickNum ?? i + 1,
      k.athlete,
      k.type || "—",
      k.distance,
      k.hangTime,
      k.direction || "—",
    ]),
  ];
  const distE = kicks.filter((k) => k.distance > 0);
  const htE = kicks.filter((k) => k.hangTime > 0);
  const avgDist = distE.length > 0 ? (distE.reduce((s, k) => s + k.distance, 0) / distE.length).toFixed(1) : "—";
  const avgHT = htE.length > 0 ? (htE.reduce((s, k) => s + k.hangTime, 0) / htE.length).toFixed(2) : "—";
  rows.push([], ["Summary"], ["Kickoffs", kicks.length], ["Avg Distance", avgDist], ["Avg Hang Time", avgHT]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, aoaToSheet(rows), "Session");
  XLSX.writeFile(wb, `KO_${label.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`);
}

/** Export a single session to a printable PDF (opens browser print dialog) */
export function exportSessionPDF(
  title: string,
  headers: string[],
  rows: string[][],
  summary: Record<string, string>,
  athleteBreakdowns?: { name: string; stats: Record<string, string> }[]
): void {
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(async ({ default: autoTable }) => {
      const doc = new jsPDF();
      addLogoToPDF(doc as any);

      doc.setFontSize(14);
      doc.text(title, 14, 15);

      // Summary line
      const summaryText = Object.entries(summary).map(([k, v]) => `${k}: ${v}`).join("  |  ");
      doc.setFontSize(9);
      doc.text(summaryText, 14, 22);

      // Main table
      autoTable(doc, { head: [headers], body: rows, startY: 26, styles: { fontSize: 9 } });

      // Athlete breakdowns
      if (athleteBreakdowns && athleteBreakdowns.length > 0) {
        let y = (doc as any).lastAutoTable?.finalY ?? 40;
        y += 8;
        doc.setFontSize(12);
        doc.text("By Athlete", 14, y);
        y += 4;
        for (const a of athleteBreakdowns) {
          const statHead = [Object.keys(a.stats)];
          const statBody = [Object.values(a.stats)];
          doc.setFontSize(10);
          y += 4;
          doc.text(a.name, 14, y);
          y += 2;
          autoTable(doc, { head: statHead, body: statBody, startY: y, styles: { fontSize: 9 }, margin: { left: 14 } });
          y = (doc as any).lastAutoTable?.finalY ?? y + 10;
        }
      }

      await addAppLogoToPDFFooter(doc as any, false);
      doc.save(`${title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
    });
  });
}

// ─── PDF Stats Export ──────────────────────────────────────────────────────

export function exportFGStatsPDF(
  athletes: string[],
  history: { date?: string; entries?: FGKick[] }[],
  hasStarred: boolean
) {
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(async ({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: "landscape" });
      addLogoToPDF(doc as any, true);

      const addSheet = (title: string, aoa: Row[]) => {
        if (doc.getNumberOfPages() > 1 || title !== "All Time") doc.addPage();
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        if (aoa.length > 0) {
          autoTable(doc, {
            head: [aoa[0].map(String)],
            body: aoa.slice(1).map((r) => r.map(String)),
            startY: 20,
            styles: { fontSize: 8 },
          });
        }
      };

      const allStats = computeFGStats(athletes, history, () => true);
      addSheet("All Time", fgStatsToAOA(athletes, allStats));

      const now = new Date();
      const weekStart = getMonday(now);
      const weekEnd = getSunday(weekStart);
      addSheet("Weekly", fgStatsToAOA(athletes, computeFGStats(athletes, filterSessions(history, weekStart, weekEnd), () => true)));

      const monthStart = getMonthStart(now);
      const monthEnd = getMonthEnd(now);
      addSheet("Monthly", fgStatsToAOA(athletes, computeFGStats(athletes, filterSessions(history, monthStart, monthEnd), () => true)));

      if (hasStarred) {
        addSheet("Live Reps", fgStatsToAOA(athletes, computeFGStats(athletes, history, (k) => !!k.starred)));
      }

      await addAppLogoToPDFFooter(doc as any, false);
      doc.save("FG_Kicking_Stats.pdf");
    });
  });
}

export function exportPuntStatsPDF(
  athletes: string[],
  history: { date?: string; entries?: PuntEntry[] }[],
  puntTypes: { id: string; label: string }[]
) {
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(async ({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: "landscape" });
      addLogoToPDF(doc as any, true);

      const addSheet = (title: string, aoa: Row[]) => {
        if (doc.getNumberOfPages() > 1 || title !== "All Time") doc.addPage();
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        if (aoa.length > 0) {
          autoTable(doc, {
            head: [aoa[0].map(String)],
            body: aoa.slice(1).map((r) => r.map(String)),
            startY: 20,
            styles: { fontSize: 7 },
          });
        }
      };

      const allStats = computePuntStats(athletes, history, () => true);
      addSheet("All Time", puntStatsToAOA(athletes, allStats, puntTypes));

      const now = new Date();
      const weekStart = getMonday(now);
      const weekEnd = getSunday(weekStart);
      addSheet("Weekly", puntStatsToAOA(athletes, computePuntStats(athletes, filterSessions(history, weekStart, weekEnd), () => true), puntTypes));

      addSheet("Monthly", puntStatsToAOA(athletes, computePuntStats(athletes, filterSessions(history, getMonthStart(now), getMonthEnd(now)), () => true), puntTypes));

      await addAppLogoToPDFFooter(doc as any, true);
      doc.save("Punting_Stats.pdf");
    });
  });
}

export function exportKickoffStatsPDF(
  athletes: string[],
  history: { date?: string; entries?: KickoffEntry[] }[]
) {
  import("jspdf").then(({ default: jsPDF }) => {
    import("jspdf-autotable").then(async ({ default: autoTable }) => {
      const doc = new jsPDF({ orientation: "landscape" });
      addLogoToPDF(doc as any, true);

      const addSheet = (title: string, aoa: Row[]) => {
        if (doc.getNumberOfPages() > 1 || title !== "All Time") doc.addPage();
        doc.setFontSize(14);
        doc.text(title, 14, 15);
        if (aoa.length > 0) {
          autoTable(doc, {
            head: [aoa[0].map(String)],
            body: aoa.slice(1).map((r) => r.map(String)),
            startY: 20,
            styles: { fontSize: 8 },
          });
        }
      };

      const allStats = computeKOStats(athletes, history);
      addSheet("All Time", koStatsToAOA(athletes, allStats));

      const now = new Date();
      const weekStart = getMonday(now);
      const weekEnd = getSunday(weekStart);
      addSheet("Weekly", koStatsToAOA(athletes, computeKOStats(athletes, filterSessions(history, weekStart, weekEnd))));

      addSheet("Monthly", koStatsToAOA(athletes, computeKOStats(athletes, filterSessions(history, getMonthStart(now), getMonthEnd(now)))));

      await addAppLogoToPDFFooter(doc as any, true);
      doc.save("Kickoff_Stats.pdf");
    });
  });
}
