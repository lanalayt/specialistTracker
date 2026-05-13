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

interface SnapEntry { athlete: string; points?: number; score?: number; accuracy?: string }

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
