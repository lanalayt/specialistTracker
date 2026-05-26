import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ScoutSession } from "@/lib/scoutStore";

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
  const allRows: { session: string; date: string; head: string[]; body: string[][] }[] = [];
  for (const s of sessions) {
    const entries = s.entries as unknown as FGEntry[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
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
    allRows.push({ session: s.label, date: new Date(s.date).toLocaleDateString(), head, body });
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

export function exportFGScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = buildFGRows(sessions);
  rows.forEach((r, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(14);
    doc.text(r.session, 14, 15);
    doc.setFontSize(10);
    doc.text(r.date, 14, 22);
    autoTable(doc, { head: [r.head], body: r.body, startY: 26, styles: { fontSize: 9 } });
  });
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
    allRows.push({ session: s.label, date: new Date(s.date).toLocaleDateString(), head, body });
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

export function exportPuntScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = buildPuntKORows(sessions, "Punt");
  rows.forEach((r, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(14);
    doc.text(r.session, 14, 15);
    doc.setFontSize(10);
    doc.text(r.date, 14, 22);
    autoTable(doc, { head: [r.head], body: r.body, startY: 26, styles: { fontSize: 8 } });
  });
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

export function exportKOScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const rows = buildPuntKORows(sessions, "KO");
  rows.forEach((r, i) => {
    if (i > 0) doc.addPage();
    doc.setFontSize(14);
    doc.text(r.session, 14, 15);
    doc.setFontSize(10);
    doc.text(r.date, 14, 22);
    autoTable(doc, { head: [r.head], body: r.body, startY: 26, styles: { fontSize: 8 } });
  });
  doc.save("KO_Scout_Rankings.pdf");
}

// ── Snap Export ─────────────────────────────────────────────────────────────

interface SnapEntry { athlete: string; points?: number; score?: number; accuracy?: string; laces?: string; spiral?: string; time?: string; markerX?: number; markerY?: number; markerInZone?: boolean }

export function exportSnapScoutExcel(sessions: ScoutSession[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sessions) {
    const entries = s.entries as unknown as SnapEntry[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    const ranked = athletes
      .map((name) => {
        const ae = entries.filter((e) => e.athlete === name);
        return { name, count: ae.length, total: ae.reduce((sum, e) => sum + (e.points ?? e.score ?? 0), 0) };
      })
      .sort((a, b) => b.total - a.total);
    const aoa = [["Rank", "Name", "Snaps", "Score"], ...ranked.map((r, i) => [String(i + 1), r.name, String(r.count), String(r.total)])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, new Date(s.date).toLocaleDateString().replace(/\//g, "-").slice(0, 28));
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

export async function exportIndividualSnapPDF(data: SnapChartData) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(data.name, 14, 15);
  doc.setFontSize(11);
  doc.text(data.label, 14, 22);
  doc.setFontSize(9);
  doc.text(new Date(data.date).toLocaleDateString(), 14, 28);
  doc.setFontSize(12);
  doc.text(`Score: ${data.total}/${data.maxScore} (${data.pct}%)`, 14, 36);

  // Draw snap diagram
  const hasMarkers = data.entries.some((e) => e.markerX != null && e.markerY != null);
  let tableStartY = 42;
  if (hasMarkers) {
    await drawSnapDiagram(doc, data.entries, 50, 42, 110, 85, data.is30Point);
    tableStartY = 133;
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
  doc.save(`${data.name}_Snap_Chart.pdf`);
}

export function exportSnapScoutPDF(sessions: ScoutSession[]) {
  const doc = new jsPDF();
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    if (i > 0) doc.addPage();
    const entries = s.entries as unknown as SnapEntry[];
    const athletes = [...new Set(entries.map((e) => e.athlete))];
    const ranked = athletes
      .map((name) => {
        const ae = entries.filter((e) => e.athlete === name);
        return { name, count: ae.length, total: ae.reduce((sum, e) => sum + (e.points ?? e.score ?? 0), 0) };
      })
      .sort((a, b) => b.total - a.total);
    doc.setFontSize(14);
    doc.text(s.label, 14, 15);
    doc.setFontSize(10);
    doc.text(new Date(s.date).toLocaleDateString(), 14, 22);
    autoTable(doc, {
      head: [["Rank", "Name", "Snaps", "Score"]],
      body: ranked.map((r, j) => [String(j + 1), r.name, String(r.count), String(r.total)]),
      startY: 26,
      styles: { fontSize: 10 },
    });
  }
  doc.save("Snap_Scout_Rankings.pdf");
}
