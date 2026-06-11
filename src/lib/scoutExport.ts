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
    // Determine preset vs manual (tag may have shifted off index 0 after an edit;
    // fall back to an order-independent kick-set comparison).
    const mode = entries.find((e) => e.chartMode)?.chartMode;
    let isPreset: boolean;
    if (mode) {
      isPreset = mode === "preset";
    } else {
      const sig = (a: string) => entries.filter((e) => e.athlete === a).map((e) => `${e.distance}-${e.hash}`).sort().join(",");
      const firstSig = sig(athletes[0]);
      isPreset = athletes.length >= 2 && athletes.every((a) => sig(a) === firstSig);
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
  const r = Math.min(w, h) * 0.03; // rounded-corner radius

  // Black panel background (matches on-screen strike-zone)
  doc.setFillColor(0, 0, 0);
  doc.roundedRect(x, y, w, h, r, r, "F");

  // Strike zone defaults (fraction of panel) mirror DEFAULT_HOLDER_ZONE / DEFAULT_ZONE.
  let zone = isShort
    ? { top: 0.45, bottom: 0.78, left: 0.42, right: 0.76 }
    : { top: 0.34, bottom: 0.68, left: 0.33, right: 0.67 };

  // Short snaps: the holder silhouette PNG doesn't render cleanly (baked-in background),
  // so we omit it and instead CENTER the zone in the panel, translating every marker by
  // the same offset so in/out-of-zone stays exactly correct. Long snaps keep the punter
  // silhouette, which is a clean transparent cutout that renders well.
  let shiftX = 0;
  let shiftY = 0;
  if (isShort) {
    shiftX = 0.5 - (zone.left + zone.right) / 2;
    shiftY = 0.5 - (zone.top + zone.bottom) / 2;
    zone = { left: zone.left + shiftX, right: zone.right + shiftX, top: zone.top + shiftY, bottom: zone.bottom + shiftY };
    // Holder figure (white line-art on black) sized to fit INSIDE the panel so its black
    // background blends with the panel and never spills outside. Bottom-left anchored.
    const imgData = await loadImageAsDataUrl("/holder-silhouette.png?v=7");
    if (imgData) {
      try {
        const imgH = h * 0.96;
        const imgW = imgH * (544 / 720); // preserve the PNG's aspect ratio
        doc.setGState(new (doc as any).GState({ opacity: 0.9 }));
        doc.addImage(imgData, "PNG", x + w * 0.01, y + h - imgH, imgW, imgH);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
      } catch {}
    }
  } else {
    const imgData = await loadImageAsDataUrl("/punter-silhouette.png");
    if (imgData) {
      try {
        doc.saveGraphicsState();
        doc.rect(x, y, w, h);
        (doc as any).clip();
        (doc as any).discardPath();
        doc.setGState(new (doc as any).GState({ opacity: 0.75 }));
        const imgW = w * 0.62;
        const imgH = imgW * 1.9;
        doc.addImage(imgData, "PNG", x + (w - imgW) / 2, y + h * 0.06, imgW, imgH);
        doc.setGState(new (doc as any).GState({ opacity: 1 }));
        doc.restoreGraphicsState();
      } catch { doc.restoreGraphicsState(); }
    }
  }

  const zLeft = x + w * zone.left;
  const zTop = y + h * zone.top;
  const zW = w * (zone.right - zone.left);
  const zH = h * (zone.bottom - zone.top);
  const zr = Math.min(zW, zH) * 0.06;
  // Light fill inside zone
  doc.setFillColor(239, 68, 68);
  doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
  doc.roundedRect(zLeft, zTop, zW, zH, zr, zr, "F");
  doc.setGState(new (doc as any).GState({ opacity: 1 }));
  // Zone outline (red-500)
  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.6);
  doc.roundedRect(zLeft, zTop, zW, zH, zr, zr);

  // Markers — green if in zone, red if miss (matches on-screen colors)
  const mr = w * 0.038;
  entries.forEach((e, i) => {
    if (e.markerX == null || e.markerY == null) return;
    const mx = x + (e.markerX / 100 + shiftX) * w;
    const my = y + (e.markerY / 100 + shiftY) * h;
    // Long snaps don't persist markerInZone — fall back to accuracy (Strike = in zone).
    const inZone = e.markerInZone != null ? e.markerInZone : e.accuracy === "Strike";
    if (inZone) { doc.setFillColor(0, 212, 160); doc.setDrawColor(0, 212, 160); }
    else { doc.setFillColor(239, 68, 68); doc.setDrawColor(239, 68, 68); }
    doc.setLineWidth(0.5);
    doc.circle(mx, my, mr, "FD");
    doc.setFontSize(Math.max(6, mr * 2));
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), mx, my + mr * 0.55, { align: "center" });
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
      body: entries.map((e, i) => [String(i + 1), String(e.distance), String(e.hash), String(e.result === "make" ? (Number(e.pointValue) || 0) : 0), e.result === "make" ? "Good" : "Miss"]),
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

/** Does this snap chart have placed markers worth drawing a diagram for? */
function snapDiagramInfo(session: ScoutSession, athlete: string): { isShort: boolean; boxW: number; boxH: number } | null {
  if (session.sport !== "SCOUT_SNAP") return null;
  const entries = (session.entries as any[]).filter((e) => e.athlete === athlete);
  if (!entries.some((e) => e.markerX != null && e.markerY != null)) return null;
  const isShort = session.label.startsWith("Short Snaps") || session.label.startsWith("30 Point");
  const boxW = 90;
  const boxH = isShort ? boxW * 260 / 300 : boxW * 1.25;
  return { isShort, boxW, boxH };
}

/** Estimate the vertical space a chart block needs, so several can be packed per page. */
function chartBlockHeight(session: ScoutSession, athlete: string): number {
  const t = singleChartTable(session, athlete);
  let h = 24; // title + sub + summary header block
  const diag = snapDiagramInfo(session, athlete);
  if (diag) h += diag.boxH + 6;
  h += (t.body.length + 1) * 9 + 6; // body rows + head row, conservative row height
  return h;
}

/** Draw one chart block with its top edge at `top`; returns the Y where it ends. */
async function drawChart(doc: jsPDF, session: ScoutSession, athlete: string, top = 14): Promise<number> {
  const t = singleChartTable(session, athlete);
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text(athlete, 14, top + 4);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(t.sub, 14, top + 11);
  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.text(t.summary, 14, top + 19);
  let startY = top + 24;

  // Snap charts: render the strike-zone diagram above the table when markers exist
  const diag = snapDiagramInfo(session, athlete);
  if (diag) {
    const entries = (session.entries as any[]).filter((e) => e.athlete === athlete);
    const boxX = (210 - diag.boxW) / 2;
    await drawSnapDiagram(doc, entries, boxX, startY, diag.boxW, diag.boxH, diag.isShort);
    startY = startY + diag.boxH + 6;
  }

  autoTable(doc, { head: [t.head], body: t.body, startY, styles: { fontSize: 10 }, margin: { left: 14, right: 14 } });
  return (doc as any).lastAutoTable?.finalY ?? startY;
}

async function chartPDFDoc(session: ScoutSession, athlete: string): Promise<jsPDF> {
  const doc = new jsPDF();
  await drawChart(doc, session, athlete);
  addLogoToPDF(doc as any);
  await addAppLogoToPDFFooter(doc as any, false);
  return doc;
}

/**
 * A single PDF combining several charts. Charts flow down the page and pack as many
 * as fully fit; a chart only moves to a new page when it won't fit in the space left.
 */
async function chartsPDFDoc(items: { session: ScoutSession; athlete: string }[]): Promise<jsPDF> {
  const doc = new jsPDF();
  const TOP = 14;
  const BOTTOM_LIMIT = 270; // leave room for the footer logo
  let cursor = TOP;
  for (const { session, athlete } of items) {
    const onFreshPage = cursor <= TOP + 0.01;
    if (!onFreshPage && cursor + chartBlockHeight(session, athlete) > BOTTOM_LIMIT) {
      doc.addPage();
      cursor = TOP;
    }
    // Thin divider between stacked charts on the same page
    if (cursor > TOP + 0.01) {
      doc.setDrawColor(210);
      doc.setLineWidth(0.2);
      doc.line(14, cursor - 4, 196, cursor - 4);
    }
    const finalY = await drawChart(doc, session, athlete, cursor);
    cursor = finalY + 12;
  }
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

/** Download several charts combined into one PDF. */
export async function downloadChartsPDF(items: { session: ScoutSession; athlete: string }[], athlete: string): Promise<void> {
  if (items.length === 0) return;
  const doc = await chartsPDFDoc(items);
  doc.save(`${athlete}_Charts.pdf`.replace(/\s+/g, "_"));
}

/** Share several charts as one combined PDF via the native share sheet; falls back to download. */
export async function shareChartsPDF(items: { session: ScoutSession; athlete: string }[], athlete: string): Promise<"shared" | "downloaded"> {
  if (items.length === 0) return "downloaded";
  const doc = await chartsPDFDoc(items);
  const filename = `${athlete}_Charts.pdf`.replace(/\s+/g, "_");
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: `${athlete} — Scout Charts` });
      return "shared";
    } catch {
      // fall through
    }
  }
  doc.save(filename);
  return "downloaded";
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
