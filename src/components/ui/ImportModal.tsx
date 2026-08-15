"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import clsx from "clsx";
import { getAppPref, setAppPref } from "@/lib/settingsSync";

// ── Shared helpers ───────────────────────────────────────────────────────────
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const cellStr = (v: unknown): string => {
  if (v == null) return "";
  const s = String(v).trim();
  return s === "-" || s === "—" || s === "–" || s === "" ? "" : s;
};
export const keyOf = (s: string) => s.trim().toLowerCase();

export interface AthleteOpt { id: string; name: string; number?: string }

// A column the importer can map (header synonyms are tried in priority order).
export interface ImportColumn { key: string; label: string; synonyms: string[] }

// A field whose raw values must be translated to one of the app's options
// (e.g. XOS "CALL" → your punt type, "Comments 5" → your FG result).
export interface ImportValueGroup {
  key: string;                 // the column key this resolves
  label: string;
  hint?: string;
  optional?: boolean;          // if true, an unmapped value is left blank (skip)
  options: { id: string; label: string }[];
  autoMatch: (raw: string) => string | undefined;
}

export interface ImportPreviewCol { label: string; get: (row: Record<string, string>) => string; className?: string }

export interface ImportConfig {
  title: string;
  storageKey: string;          // app-pref key for this phase's saved value maps
  sheetHint: string;           // sheet-name substring to prefer
  columns: ImportColumn[];
  athleteKey: string;          // which column key holds the athlete
  requiredKeys: string[];      // column keys that must be mapped to import
  valueGroups: ImportValueGroup[];
  // Build one output row. Returns null to skip the row.
  buildRow: (
    get: (key: string) => string,
    resolveVal: (key: string, raw: string) => string | undefined,
    resolveAthlete: (raw: string) => string | undefined,
  ) => Record<string, string> | null;
  previewCols: ImportPreviewCol[];
}

interface Props {
  config: ImportConfig;
  athletes: AthleteOpt[];
  onClose: () => void;
  onImport: (rows: Record<string, string>[]) => void;
}

export function ImportModal({ config, athletes, onClose, onImport }: Props) {
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rawRows, setRawRows] = useState<(string | number | null)[][]>([]);
  const [sheetName, setSheetName] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [colMap, setColMap] = useState<Record<string, number>>({});

  // Saved value translations (per phase). { [groupKey]: {valueKey: id}, athlete: {valueKey: name} }
  const saved = getAppPref<Record<string, Record<string, string>>>(config.storageKey) ?? {};
  const [maps, setMaps] = useState<Record<string, Record<string, string>>>(saved);
  const setGroupVal = (groupKey: string, rawVal: string, id: string) => {
    const next = { ...maps, [groupKey]: { ...(maps[groupKey] ?? {}), [keyOf(rawVal)]: id } };
    setMaps(next);
    setAppPref(config.storageKey, next);
  };

  const handleFile = async (file: File) => {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      // Match the phase's sheet either way ("KO" ↔ "kickoff", "FG", "Punt").
      const want = norm(config.sheetHint);
      const name = wb.SheetNames.find((n) => { const sn = norm(n); return !!sn && (sn.includes(want) || want.includes(sn)); }) ?? wb.SheetNames[0];
      setSheetName(name);
      const ws = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
      let headerIdx = aoa.findIndex((r) => Array.isArray(r) && r.filter((c) => c != null && String(c).trim() !== "").length >= 2);
      if (headerIdx < 0) headerIdx = 0;
      const hdr = (aoa[headerIdx] ?? []).map((h) => String(h ?? "").trim());
      const rows = aoa.slice(headerIdx + 1).filter((r) => Array.isArray(r) && r.some((c) => cellStr(c) !== ""));
      if (hdr.length === 0 || rows.length === 0) { setError("Couldn't find a header row and data on that sheet."); return; }
      const cm: Record<string, number> = {};
      config.columns.forEach((c) => { cm[c.key] = -1; });
      const used = new Set<number>();
      const claim = (col: ImportColumn, fuzzy: boolean) => {
        if (cm[col.key] >= 0) return;
        for (const syn of col.synonyms) {
          const idx = hdr.findIndex((h, i) => {
            if (used.has(i)) return false;
            const nh = norm(h);
            if (!nh) return false;
            return nh === syn || (fuzzy && syn.length >= 4 && nh.includes(syn));
          });
          if (idx >= 0) { cm[col.key] = idx; used.add(idx); return; }
        }
      };
      config.columns.forEach((c) => claim(c, false));
      config.columns.forEach((c) => claim(c, true));
      setHeaders(hdr);
      setRawRows(rows);
      setColMap(cm);
    } catch {
      setError("That file couldn't be read as an .xlsx spreadsheet.");
    }
  };

  const autoAthlete = (raw: string): string | undefined => {
    const s = raw.trim();
    const byNum = athletes.find((a) => (a.number ?? "").trim() === s);
    if (byNum) return byNum.name;
    const k = s.toLowerCase();
    const exact = athletes.find((a) => a.name.trim().toLowerCase() === k);
    if (exact) return exact.name;
    if (k.length >= 2) {
      const partial = athletes.find((a) => a.name.toLowerCase().includes(k));
      if (partial) return partial.name;
    }
    return undefined;
  };
  const resolveAthlete = (raw: string) => maps.athlete?.[keyOf(raw)] ?? autoAthlete(raw);
  const groupByKey = (key: string) => config.valueGroups.find((g) => g.key === key);
  const resolveVal = (groupKey: string, raw: string) => {
    if (!raw) return "";
    const g = groupByKey(groupKey);
    return maps[groupKey]?.[keyOf(raw)] ?? g?.autoMatch(raw);
  };

  const distinct = (colKey: string) => {
    const idx = colMap[colKey];
    if (idx == null || idx < 0) return [] as string[];
    const seen = new Map<string, string>();
    rawRows.forEach((r) => { const s = cellStr(r[idx]); if (s && !seen.has(keyOf(s))) seen.set(keyOf(s), s); });
    return [...seen.values()];
  };
  const athleteVals = useMemo(() => distinct(config.athleteKey), [rawRows, colMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const builtRows = useMemo(() => {
    if (!headers) return [] as Record<string, string>[];
    const rows: Record<string, string>[] = [];
    rawRows.forEach((r) => {
      const get = (key: string) => { const i = colMap[key]; return i != null && i >= 0 ? cellStr(r[i]) : ""; };
      const row = config.buildRow(get, resolveVal, resolveAthlete);
      if (row) rows.push(row);
    });
    return rows;
  }, [headers, rawRows, colMap, maps]); // eslint-disable-line react-hooks/exhaustive-deps

  const unresolvedAthletes = athleteVals.filter((v) => !resolveAthlete(v));
  const unresolvedRequiredGroups = config.valueGroups
    .filter((g) => !g.optional)
    .flatMap((g) => distinct(g.key).filter((v) => !resolveVal(g.key, v)).map((v) => ({ g, v })));

  const requiredMapped = config.requiredKeys.every((k) => (colMap[k] ?? -1) >= 0) && (colMap[config.athleteKey] ?? -1) >= 0;
  const canImport = !!headers && builtRows.length > 0 && unresolvedAthletes.length === 0 && unresolvedRequiredGroups.length === 0 && requiredMapped;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-accent-lg">
        <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{config.title}</h2>
            <p className="text-sm text-muted mt-0.5">Upload an XOS / Thunder export — it fills the log for you to review.</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xl leading-none px-2">×</button>
        </div>

        <div className="p-5 space-y-4">
          {!headers && (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className={clsx(
                "card-2 flex flex-col items-center justify-center gap-2 py-12 cursor-pointer border-2 border-dashed transition-colors",
                dragOver ? "border-accent bg-accent/15" : "border-accent/40 hover:bg-accent/5"
              )}
            >
              <span className="text-3xl">⬆</span>
              <span className="text-sm font-semibold text-accent">{dragOver ? "Drop to upload" : "Drag a file here, or click to browse"}</span>
              <span className="text-xs text-muted">.xlsx — we&apos;ll read the &quot;{config.sheetHint}&quot; sheet</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          )}
          {error && <div className="bg-miss/10 border border-miss/30 text-miss text-sm rounded-input px-3 py-2">{error}</div>}

          {headers && (
            <>
              <p className="text-xs text-muted">Reading sheet <span className="text-slate-200 font-semibold">{sheetName}</span> · {rawRows.length} rows</p>

              {/* Column mapping */}
              <div className="card-2 p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Columns</p>
                {config.columns.map((c) => (
                  <div key={c.key} className="flex items-center gap-2">
                    <span className="text-xs text-slate-300 w-36 shrink-0">{c.label}</span>
                    <select
                      value={colMap[c.key] ?? -1}
                      onChange={(e) => setColMap((m) => ({ ...m, [c.key]: parseInt(e.target.value) }))}
                      className="flex-1 min-w-0 bg-surface-2 border border-border rounded-input px-2 py-1.5 text-xs text-slate-200"
                    >
                      <option value={-1}>— none —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              {/* Value groups */}
              {config.valueGroups.map((g) => {
                const vals = distinct(g.key);
                if (vals.length === 0) return null;
                return (
                  <div key={g.key} className="card-2 p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wider">{g.label} {g.hint && <span className="normal-case text-[10px] text-muted">— {g.hint}</span>}</p>
                    {vals.map((v) => {
                      const resolved = resolveVal(g.key, v);
                      return (
                        <div key={v} className="flex items-center gap-2">
                          <span className="text-xs text-slate-200 w-28 shrink-0 font-semibold truncate">{v}</span>
                          <span className="text-muted text-xs shrink-0">→</span>
                          <select
                            value={resolved ?? ""}
                            onChange={(e) => setGroupVal(g.key, v, e.target.value)}
                            className={clsx("flex-1 min-w-0 bg-surface-2 border rounded-input px-2 py-1.5 text-xs", resolved ? "border-border text-slate-200" : (g.optional ? "border-border text-slate-200" : "border-miss/50 text-miss"))}
                          >
                            <option value="">{g.optional ? "— skip —" : "— pick —"}</option>
                            {g.options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Athletes */}
              {athleteVals.length > 0 && (
                <div className="card-2 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">Athletes <span className="normal-case text-[10px] text-muted">— matched by name or jersey number</span></p>
                  {athleteVals.map((v) => {
                    const resolved = resolveAthlete(v);
                    return (
                      <div key={v} className="flex items-center gap-2">
                        <span className="text-xs text-slate-200 w-28 shrink-0 font-semibold truncate">{/^\d+$/.test(v) ? `#${v}` : v}</span>
                        <span className="text-muted text-xs shrink-0">→</span>
                        <select
                          value={resolved ?? ""}
                          onChange={(e) => setGroupVal("athlete", v, e.target.value)}
                          className={clsx("flex-1 min-w-0 bg-surface-2 border rounded-input px-2 py-1.5 text-xs", resolved ? "border-border text-slate-200" : "border-miss/50 text-miss")}
                        >
                          <option value="">— pick athlete —</option>
                          {athletes.map((a) => <option key={a.id} value={a.name}>{a.name}{a.number ? ` (#${a.number})` : ""}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Preview */}
              <div className="card-2 overflow-x-auto">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider p-2">Preview</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted">
                      {config.previewCols.map((c) => <th key={c.label} className="px-2 py-1">{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {builtRows.slice(0, 12).map((r, i) => (
                      <tr key={i} className="border-t border-border/40">
                        {config.previewCols.map((c) => <td key={c.label} className={clsx("px-2 py-1 text-center", c.className ?? "text-slate-300")}>{c.get(r) || "—"}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {builtRows.length > 12 && <p className="text-[10px] text-muted p-2">…and {builtRows.length - 12} more</p>}
              </div>

              {(unresolvedRequiredGroups.length > 0 || unresolvedAthletes.length > 0) && (
                <p className="text-xs text-warn">Resolve the highlighted values to continue.</p>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 flex gap-3 sticky bottom-0 bg-surface">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button
            onClick={() => { onImport(builtRows); onClose(); }}
            disabled={!canImport}
            className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {headers ? `Import ${builtRows.length} row${builtRows.length !== 1 ? "s" : ""}` : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
