import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoutSession } from "@/lib/scoutStore";
import { addLogoToPDF, addAppLogoToPDFFooter } from "@/lib/exportStats";

// ── Helpers ─────────────────────────────────────────────────────────────────

function calcAvg(scores: number[], dropWorst: boolean): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];
  if (!dropWorst) return parseFloat((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2));
  const sorted = [...scores].sort((a, b) => a - b);
  const best = sorted.slice(1);
  return parseFloat((best.reduce((s, v) => s + v, 0) / best.length).toFixed(2));
}

// ── FG Export ───────────────────────────────────────────────────────────────

interface FGEntry { athlete: string; kickNum: number; distance: number; hash: string; pointValue: number; result: string; score: number }

function buildFGRows(sessions: ScoutSession[]) {
  const allRows: { session: string; date: string; head: string[]; body: string[][]; isPreset: boolean }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as (FGEntry & { chartMode?: string })[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    // Determine preset vs manual
    const mode = entries[0]?.chartMode;
    let isPreset: boolean;
    if (mode) {
      isPreset = mode === "preset";
    } else {
      const firstAthlete = athletes[0];
      const firstKicks = entries.filter((e) => e.athlete === firstAthlete).map((e) => `${e.distance}-${e.hash}`);
      isPreset = athletes.length >= 2 && athletes.every((a) => {
        const kicks = entries.filter((e) => e.athlete === a).map((e) => `${e.distance}-${e.hash}`);
        return kicks.length === firstKicks.length && kicks.every((k, i) => k === firstKicks[i]);
      });
    }

    if (isPreset) {
      const kicks = [...new Set(entries.map((e) => e.kickNum))].sort((a, b) => a - b);
      const kickLabels = kicks.map((k) => {
        const e = entries.find((en) => en.kickNum === k);
        return `${e?.distance ?? ""}yd ${e?.hash ?? ""}`;
      });
      const head = ["Rank", "Name", ...kickLabels, "Total"];
      const ranked = athletes
        .map((name) => ({ name, entries: entries.filter((e) => e.athlete === name), total: entries.filter((e) => e.athlete === name).reduce((s, e) => s + e.score, 0) }))
        .sort((a, b) => b.total - a.total);
      const body = ranked.map((r, i) => [
        String(i + 1), r.name,
        ...kicks.map((k) => { const e = r.entries.find((en) => en.kickNum === k); return e ? String(e.score) : "—"; }),
        String(r.total),
      ]);
      const cleanLabel = s.label.replace(/ — .*$/, "");
      allRows.push({ session: cleanLabel, date: new Date(s.date).toLocaleDateString(), head, body, isPreset: true });
    } else {
      // Manual chart: show distance+hash per kick, makes/att (pct%)
      const maxKicks = Math.max(...athletes.map((n) => entries.filter((e) => e.athlete === n).length));
      const kickHeaders = Array.from({ length: maxKicks }, (_, i) => `K${i + 1}`);
      const head = ["Rank", "Name", ...kickHeaders, "Result"];
      const ranked = athletes
        .map((name) => {
          const ae = entries.filter((e) => e.athlete === name);
          const makes = ae.filter((e) => e.result === "make").length;
          return { name, entries: ae, makes, att: ae.length };
        })
        .sort((a, b) => {
          const pctA = a.att > 0 ? a.makes / a.att : 0;
          const pctB = b.att > 0 ? b.makes / b.att : 0;
          return pctB - pctA;
        });
      const body = ranked.map((r, i) => {
        const pct = r.att > 0 ? Math.round((r.makes / r.att) * 100) : 0;
        return [
          String(i + 1), r.name,
          ...r.entries.map((e) => `${e.distance}${e.hash} ${e.result === "make" ? "GOOD" : "MISS"}`),
          ...Array.from({ length: maxKicks - r.entries.length }, () => "—"),
          `${r.makes}/${r.att} (${pct}%)`,
        ];
      });
      const cleanLabel = s.label.replace(/ — .*$/, "");
      allRows.push({ session: cleanLabel, date: new Date(s.date).toLocaleDateString(), head, body, isPreset: false });
    }
  }
  return allRows;
}

export function exportFGScoutExcel(sessions: ScoutSession[]) {
  const wb = XLSX.utils.book_new();
  const rows = buildFGRows(sessions);
  for (const r of rows) {
    const aoa = [r.head, ...r.body];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const name = r.date.replace(/\//g, "-").slice(0, 28);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, "FG_Scout_Rankings.xlsx");
}

export async function exportFGScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = buildFGRows(sessions);
  let y = 15;
  rows.forEach((r, i) => {
    if (i > 0) y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
    doc.setFontSize(14);
    doc.text(r.session, 14, y);
    doc.setFontSize(10);
    doc.text(r.date, 14, y + 7);
    autoTable(doc, { head: [r.head], body: r.body, startY: y + 11, styles: { fontSize: 9 } });
  });
  addLogoToPDF(doc as any, true);
  await addAppLogoToPDFFooter(doc as any, true);
  doc.save("FG_Scout_Rankings.pdf");
}

// ── Punt / KO Export ────────────────────────────────────────────────────────

interface PuntKOEntry { athlete: string; kickNum: number; distance: number; hangTime: number; opTime?: number; directionGood: boolean; score: number; dropWorst?: boolean }

function buildPuntKORows(sessions: ScoutSession[], sport: "Punt" | "KO") {
  const allRows: { session: string; date: string; head: string[]; body: string[][] }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as PuntKOEntry[];
    const dw = entries[0]?.dropWorst ?? false;
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    const maxKicks = Math.max(...athletes.map((n) => entries.filter((e) => e.athlete === n).length));
    const kickHeaders = Array.from({ length: maxKicks }, (_, i) => `${sport === "Punt" ? "P" : "K"}${i + 1}`);
    const head = ["Rank", "Name", ...kickHeaders, "Avg"];
    const ranked = athletes
      .map((name) => {
        const ae = entries.filter((e) => e.athlete === name);
        const scores = ae.map((e) => e.score);
        return { name, entries: ae, avg: calcAvg(scores, dw) };
      })
      .sort((a, b) => b.avg - a.avg);
    const body = ranked.map((r, i) => [
      String(i + 1), r.name,
      ...r.entries.map((e) => `${e.distance}yd / ${e.hangTime.toFixed(2)}s${e.directionGood ? "" : " (bad)"}`),
      ...Array.from({ length: maxKicks - r.entries.length }, () => "—"),
      r.avg.toFixed(2),
    ]);
    const cleanLabel = s.label.replace(/ — .*$/, "");
    allRows.push({ session: cleanLabel, date: new Date(s.date).toLocaleDateString(), head, body });
  }
  return allRows;
}

export function exportPuntScoutExcel(sessions: ScoutSession[]) {
  const wb = XLSX.utils.book_new();
  const rows = buildPuntKORows(sessions, "Punt");
  for (const r of rows) {
    const ws = XLSX.utils.aoa_to_sheet([r.head, ...r.body]);
    XLSX.utils.book_append_sheet(wb, ws, r.date.replace(/\//g, "-").slice(0, 28));
  }
  XLSX.writeFile(wb, "Punt_Scout_Rankings.xlsx");
}

export async function exportPuntScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = buildPuntKORows(sessions, "Punt");
  let y = 15;
  rows.forEach((r, i) => {
    if (i > 0) y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
    doc.setFontSize(14);
    doc.text(r.session, 14, y);
    doc.setFontSize(10);
    doc.text(r.date, 14, y + 7);
    autoTable(doc, { head: [r.head], body: r.body, startY: y + 11, styles: { fontSize: 8 } });
  });
  addLogoToPDF(doc as any, true);
  await addAppLogoToPDFFooter(doc as any, true);
  doc.save("Punt_Scout_Rankings.pdf");
}

export function exportKOScoutExcel(sessions: ScoutSession[]) {
  const wb = XLSX.utils.book_new();
  const rows = buildPuntKORows(sessions, "KO");
  for (const r of rows) {
    const ws = XLSX.utils.aoa_to_sheet([r.head, ...r.body]);
    XLSX.utils.book_append_sheet(wb, ws, r.date.replace(/\//g, "-").slice(0, 28));
  }
  XLSX.writeFile(wb, "KO_Scout_Rankings.xlsx");
}

export async function exportKOScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = buildPuntKORows(sessions, "KO");
  let y = 15;
  rows.forEach((r, i) => {
    if (i > 0) y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
    doc.setFontSize(14);
    doc.text(r.session, 14, y);
    doc.setFontSize(10);
    doc.text(r.date, 14, y + 7);
    autoTable(doc, { head: [r.head], body: r.body, startY: y + 11, styles: { fontSize: 8 } });
  });
  addLogoToPDF(doc as any, true);
  await addAppLogoToPDFFooter(doc as any, true);
  doc.save("KO_Scout_Rankings.pdf");
}

// ── Snap Export ─────────────────────────────────────────────────────────────

interface SnapEntry { athlete: string; points?: number; score?: number; accuracy?: string; laces?: string; spiral?: string; time?: string; markerX?: number; markerY?: number; markerInZone?: boolean }

function buildSnapRanked(sessions: ScoutSession[]) {
  const all: { name: string; count: number; total: number; maxScore: number; pct: number; is30Point: boolean; avgTime?: number }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as SnapEntry[];
    const is30Point = s.label.startsWith("30 Point") || s.label.startsWith("Short Snap");
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    for (const name of athletes) {
      const ae = entries.filter((e) => e.athlete === name);
      const total = ae.reduce((sum, e) => sum + (e.points ?? e.score ?? 0), 0);
      const maxScore = is30Point ? ae.length * 3 : ae.length;
      const pct = maxScore > 0 ? Math.round((total / maxScore) * 100) : 0;
      const timedEntries = ae.filter((e) => e.time && parseFloat(e.time) > 0);
      const avgTime = timedEntries.length > 0 ? timedEntries.reduce((sum, e) => sum + parseFloat(e.time!), 0) / timedEntries.length : undefined;
      all.push({ name, count: ae.length, total, maxScore, pct, is30Point, avgTime });
    }
  }
  const short = all.filter((r) => r.is30Point).sort((a, b) => b.pct - a.pct);
  const long = all.filter((r) => !r.is30Point).sort((a, b) => b.pct - a.pct);
  return { short, long };
}

export function exportSnapScoutExcel(sessions: ScoutSession[]) {
  const wb = XLSX.utils.book_new();
  const { short, long } = buildSnapRanked(sessions);
  if (short.length > 0) {
    const aoa = [["Rank", "Name", "Snaps", "Score", "%"], ...short.map((r, i) => [String(i + 1), r.name, String(r.count), `${r.total}/${r.maxScore}`, `${r.pct}%`])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Short Snaps");
  }
  if (long.length > 0) {
    const aoa = [["Rank", "Name", "Snaps", "Avg Time", "Score", "%"], ...long.map((r, i) => [String(i + 1), r.name, String(r.count), r.avgTime ? `${r.avgTime.toFixed(2)}s` : "—", `${r.total}/${r.maxScore}`, `${r.pct}%`])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 6 }, { wch: 18 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, ws, "Long Snaps");
  }
  XLSX.writeFile(wb, "Snap_Scout_Rankings.xlsx");
}

// ── Individual snap chart export ──────────────────────────────────────────

interface SnapChartData {
  name: string;
  date: string;
  label: string;
  is30Point: boolean;
  count: number;
  total: number;
  maxScore: number;
  pct: number;
  entries: SnapEntry[];
}

export function exportIndividualSnapExcel(data: SnapChartData) {
  const wb = XLSX.utils.book_new();
  const header = data.is30Point
    ? ["#", "Accuracy", "Laces", "Spiral", "Score"]
    : ["#", "Accuracy", "Spiral", "Time", "Score"];
  const rows = data.entries.map((e, i) => {
    if (data.is30Point) {
      return [String(i + 1), e.accuracy ?? "", e.laces === "Good" ? "Perfect" : e.laces ?? "", e.spiral === "Good" ? "Tight" : e.spiral === "Bad" ? "Open" : "", String(e.points ?? e.score ?? 0)];
    }
    return [String(i + 1), e.accuracy ?? "", e.spiral === "Good" ? "Tight" : e.spiral === "Bad" ? "Open" : "", e.time ?? "", String(e.points ?? e.score ?? 0)];
  });
  const summary = [[], ["Total", "", "", data.is30Point ? "" : "", `${data.total}/${data.maxScore} (${data.pct}%)`]];
  const aoa = [[`${data.name} — ${data.label}`], [new Date(data.date).toLocaleDateString()], [], header, ...rows, ...summary];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, data.name.slice(0, 28));
  XLSX.writeFile(wb, `${data.name}_Snap_Chart.xlsx`);
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const resp = await fetch(src);
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function drawSnapDiagram(doc: jsPDF, entries: SnapEntry[], x: number, y: number, w: number, h: number, isShort: boolean) {
  // Background
  doc.setFillColor(20, 20, 20);
  doc.rect(x, y, w, h, "F");
  // Border
  doc.setDrawColor(140, 140, 140);
  doc.setLineWidth(0.5);
  doc.rect(x, y, w, h);

  // Holder silhouette for short snaps
  if (isShort) {
    const imgData = await loadImageAsDataUrl("/holder-silhouette.png?v=7");
    if (imgData) {
      try {
        const imgH = h * 1.3;
        const imgW = imgH * 0.58;
        doc.setGState(new (doc as any).GState({ opacity: 0.7 }));
        doc.addImage(imgData, "PNG", x - imgW * 0.07, y + h - imgH * 0.77, imgW, imgH);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
      } catch {}
    }
  }

  // Strike zone — use holder zone for short, punter zone for long
  const zone = isShort
    ? { top: 0.45, bottom: 0.78, left: 0.42, right: 0.76 }
    : { top: 0.34, bottom: 0.68, left: 0.25, right: 0.75 };
  const zLeft = x + w * zone.left;
  const zTop = y + h * zone.top;
  const zW = w * (zone.right - zone.left);
  const zH = h * (zone.bottom - zone.top);
  doc.setDrawColor(220, 60, 60);
  doc.setLineWidth(0.4);
  doc.rect(zLeft, zTop, zW, zH);
  // Light fill inside zone
  doc.setFillColor(220, 60, 60);
  doc.setGState(new (doc as any).GState({ opacity: 0.06 }));
  doc.rect(zLeft, zTop, zW, zH, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  // Draw markers
  entries.forEach((e, i) => {
    if (e.markerX == null || e.markerY == null) return;
    const mx = x + (e.markerX / 100) * w;
    const my = y + (e.markerY / 100) * h;
    const inZone = e.markerInZone ?? false;
    doc.setFillColor(inZone ? 0 : 220, inZone ? 200 : 60, inZone ? 160 : 60);
    doc.circle(mx, my, 3.5, "F");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), mx, my + 1.8, { align: "center" });
    doc.setTextColor(0, 0, 0);
  });
}

export async function exportIndividualSnapPDF(data: SnapChartData, diagramImage?: string) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(data.name, 14, 15);
  doc.setFontSize(11);
  doc.text(data.is30Point ? "Short Snaps" : "Long Snaps", 14, 22);
  doc.setFontSize(9);
  doc.text(new Date(data.date).toLocaleDateString(), 14, 28);
  doc.setFontSize(12);
  let infoY = 36;
  doc.text(`Score: ${data.total}/${data.maxScore} (${data.pct}%)`, 14, infoY);
  // Avg snap time for long snaps
  if (!data.is30Point) {
    const times = data.entries.filter((e) => e.time && parseFloat(e.time) > 0).map((e) => parseFloat(e.time!));
    if (times.length > 0) {
      const avgTime = (times.reduce((s, t) => s + t, 0) / times.length).toFixed(2);
      infoY += 7;
      doc.text(`Avg Snap Time: ${avgTime}s`, 14, infoY);
    }
  }

  const diagramY = infoY + 8;
  let tableStartY = diagramY;
  if (diagramImage) {
    const imgW = 120;
    const imgH = 100;
    const imgX = (210 - imgW) / 2;
    doc.addImage(diagramImage, "PNG", imgX, diagramY, imgW, imgH);
    tableStartY = diagramY + imgH + 6;
  } else {
    const hasMarkers = data.entries.some((e) => e.markerX != null && e.markerY != null);
    if (hasMarkers) {
      await drawSnapDiagram(doc, data.entries, 50, diagramY, 110, 85, data.is30Point);
      tableStartY = diagramY + 91;
    }
  }

  // Table
  const head = data.is30Point
    ? [["#", "Accuracy", "Laces", "Spiral", "Score"]]
    : [["#", "Accuracy", "Spiral", "Time", "Score"]];
  const body = data.entries.map((e, i) => {
    if (data.is30Point) {
      return [String(i + 1), e.accuracy ?? "", e.laces === "Good" ? "Perfect" : e.laces ?? "", e.spiral === "Good" ? "Tight" : e.spiral === "Bad" ? "Open" : "", `${e.points ?? e.score ?? 0}/${data.is30Point ? 3 : 1}`];
    }
    return [String(i + 1), e.accuracy ?? "", e.spiral === "Good" ? "Tight" : e.spiral === "Bad" ? "Open" : "", e.time ?? "", `${e.points ?? e.score ?? 0}/1`];
  });
  autoTable(doc, { head, body, startY: tableStartY, styles: { fontSize: 9 } });
  addLogoToPDF(doc as any);
  await addAppLogoToPDFFooter(doc as any, false);
  doc.save(`${data.name}_Snap_Chart.pdf`);
}

export async function exportSnapScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF();
  const { short, long } = buildSnapRanked(sessions);

  if (short.length > 0) {
    doc.setFontSize(14);
    doc.text("Short Snap Rankings", 14, 15);
    autoTable(doc, {
      head: [["Rank", "Name", "Snaps", "Score", "%"]],
      body: short.map((r, i) => [String(i + 1), r.name, String(r.count), `${r.total}/${r.maxScore}`, `${r.pct}%`]),
      startY: 22,
      styles: { fontSize: 10 },
    });
  }

  if (long.length > 0) {
    if (short.length > 0) doc.addPage();
    doc.setFontSize(14);
    doc.text("Long Snap Rankings", 14, 15);
    autoTable(doc, {
      head: [["Rank", "Name", "Snaps", "Avg Time", "Score", "%"]],
      body: long.map((r, i) => [String(i + 1), r.name, String(r.count), r.avgTime ? `${r.avgTime.toFixed(2)}s` : "—", `${r.total}/${r.maxScore}`, `${r.pct}%`]),
      startY: 22,
      styles: { fontSize: 10 },
    });
  }
  addLogoToPDF(doc as any);
  await addAppLogoToPDFFooter(doc as any, false);
  doc.save("Snap_Scout_Rankings.pdf");
}

// ── Single chart (one athlete) PDF — download or share ───────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function singleChartTable(session: ScoutSession, athlete: string): { sub: string; head: string[]; body: string[][]; summary: string } {
  const sport = session.sport;
  const entries = (session.entries as any[]).filter((e) => e.athlete === athlete);
  const date = new Date(session.date).toLocaleDateString();
  if (sport === "SCOUT_FG") {
    const makes = entries.filter((e) => e.result === "make").length;
    const pts = entries.reduce((s, e) => s + (Number(e.score) || 0), 0);
    return {
      sub: `FG Chart · ${date}`,
      head: ["#", "Dist", "Hash", "Pts", "Result"],
      body: entries.map((e, i) => [String(i + 1), String(e.distance), String(e.hash), String(e.pointValue), e.result === "make" ? "Good" : "Miss"]),
      summary: `${makes}/${entries.length} made · ${pts} pts`,
    };
  }
  if (sport === "SCOUT_KO" || sport === "SCOUT_PUNT") {
    const scores = entries.map((e) => Number(e.score) || 0);
    const avg = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
    const isP = sport === "SCOUT_PUNT";
    return {
      sub: `${isP ? "Punt" : "Kickoff"} Chart · ${date}`,
      head: isP ? ["#", "Dist", "Hang", "Op", "Dir", "Score"] : ["#", "Dist", "Hang", "Dir", "Score"],
      body: entries.map((e, i) => isP
        ? [String(i + 1), String(e.distance), Number(e.hangTime).toFixed(2), e.opTime != null ? Number(e.opTime).toFixed(2) : "-", e.directionGood === false ? "Bad" : "Good", Number(e.score).toFixed(2)]
        : [String(i + 1), String(e.distance), Number(e.hangTime).toFixed(2), e.directionGood === false ? "Bad" : "Good", Number(e.score).toFixed(2)]),
      summary: `${avg.toFixed(2)} avg score`,
    };
  }
  const isShort = session.label.startsWith("Short Snaps") || session.label.startsWith("30 Point");
  const total = entries.reduce((s, e) => s + (typeof e.points === "number" ? e.points : (Number(e.score) || 0)), 0);
  const max = isShort ? entries.length * 3 : entries.length;
  return {
    sub: `Snap (${isShort ? "Short" : "Long"}) Chart · ${date}`,
    head: isShort ? ["#", "Loc", "Laces", "Spiral", "Pts"] : ["#", "Call", "Time", "Spiral", "Score"],
    body: entries.map((e, i) => isShort
      ? [String(i + 1), e.accuracy ?? "", e.laces === "Good" ? "Perfect" : (e.laces ?? ""), e.spiral === "Good" ? "Tight" : "Open", String(e.points ?? 0)]
      : [String(i + 1), e.accuracy ?? "", e.time || "-", e.spiral === "Good" ? "Tight" : "Open", String(e.score ?? 0)]),
    summary: `${total}/${max}`,
  };
}

async function chartPDFDoc(session: ScoutSession, athlete: string): Promise<jsPDF> {
  const doc = new jsPDF();
  const t = singleChartTable(session, athlete);
  doc.setFontSize(16);
  doc.text(athlete, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(t.sub, 14, 25);
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(t.summary, 14, 33);
  autoTable(doc, { head: [t.head], body: t.body, startY: 38, styles: { fontSize: 10 } });
  addLogoToPDF(doc as any);
  await addAppLogoToPDFFooter(doc as any, false);
  return doc;
}

const chartFileName = (session: ScoutSession, athlete: string) =>
  `${athlete}_${session.sport.replace("SCOUT_", "")}_Chart.pdf`.replace(/\s+/g, "_");

export async function downloadChartPDF(session: ScoutSession, athlete: string): Promise<void> {
  const doc = await chartPDFDoc(session, athlete);
  doc.save(chartFileName(session, athlete));
}

/** Share a single chart PDF via the native share sheet (email/text/etc.); falls back to download. */
export async function shareChartPDF(session: ScoutSession, athlete: string): Promise<"shared" | "downloaded"> {
  const doc = await chartPDFDoc(session, athlete);
  const filename = chartFileName(session, athlete);
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${athlete} — Scout Chart` });
      return "shared";
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  doc.save(filename);
  return "downloaded";
}
