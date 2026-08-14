"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import clsx from "clsx";
import { getAppPref, setAppPref } from "@/lib/settingsSync";

// ── Types the modal produces (a partial punt log row) ────────────────────────
export interface ImportedPuntRow {
  athlete: string;
  type: string;
  hash: string;
  yards: string;
  poochYL: string;
  hangTime: string;
  opTime: string;
  directionalAccuracy: string;
}

interface PuntTypeOpt { id: string; label: string; category: string; metric: "distance" | "yardline" }
interface DirOpt { id: string; label: string; score?: number }
interface HashOpt { id: string; label: string }
interface AthleteOpt { id: string; name: string; number?: string }

interface Props {
  onClose: () => void;
  onImport: (rows: ImportedPuntRow[]) => void;
  athletes: AthleteOpt[];
  puntTypes: PuntTypeOpt[];
  directionOptions: DirOpt[];
  hashOptions: HashOpt[];
}

// Logical fields we map spreadsheet columns onto.
type Field = "athlete" | "type" | "direction" | "yards" | "hang" | "optime" | "hash";
const FIELD_LABELS: Record<Field, string> = {
  athlete: "Athlete (jersey #)",
  type: "Punt type",
  direction: "Direction score",
  yards: "Distance / Pooch YL",
  hang: "Hang time",
  optime: "Op time",
  hash: "Hash / position",
};
// Header synonyms (normalized: lowercase, alphanumerics only).
const SYNONYMS: Record<Field, string[]> = {
  athlete: ["pffkicker", "kicker", "punter", "jersey", "number", "kickernum", "playernum", "player"],
  type: ["call", "type", "punttype", "kicktype"],
  direction: ["landzn", "landzone", "landingzone", "direction", "dir"],
  yards: ["pffkickdepth", "kickdepth", "distance", "dist", "yards", "yds", "gross", "depth"],
  hang: ["pffhangtime", "hangtime", "hang", "ht"],
  optime: ["oper", "optime", "operation", "operationtime", "op"],
  hash: ["hash", "pos", "position"],
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const MAP_PREF = "puntImportValueMaps_v1"; // per-user saved value translations

export function PuntImportModal({ onClose, onImport, athletes, puntTypes, directionOptions, hashOptions }: Props) {
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rawRows, setRawRows] = useState<(string | number | null)[][]>([]);
  const [sheetName, setSheetName] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // column → field index mapping (field → column index or -1)
  const [colMap, setColMap] = useState<Record<Field, number>>({ athlete: -1, type: -1, direction: -1, yards: -1, hang: -1, optime: -1, hash: -1 });
  // value translations, keyed by raw value → resolved id
  const saved = (getAppPref<{ type?: Record<string, string>; hash?: Record<string, string>; athlete?: Record<string, string> }>(MAP_PREF)) ?? {};
  const [typeMap, setTypeMap] = useState<Record<string, string>>(saved.type ?? {});
  const [hashMap, setHashMap] = useState<Record<string, string>>(saved.hash ?? {});
  const [athleteMap, setAthleteMap] = useState<Record<string, string>>(saved.athlete ?? {}); // raw number → athlete name

  const persist = (t: Record<string, string>, h: Record<string, string>, a: Record<string, string>) =>
    setAppPref(MAP_PREF, { type: t, hash: h, athlete: a });

  const handleFile = async (file: File) => {
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const name = wb.SheetNames.find((n) => n.toLowerCase().includes("punt")) ?? wb.SheetNames[0];
      setSheetName(name);
      const ws = wb.Sheets[name];
      const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null });
      const hdr = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
      const rows = aoa.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c != null && c !== ""));
      if (hdr.length === 0 || rows.length === 0) { setError("Couldn't find a header row and data on that sheet."); return; }
      // Auto-map columns by synonym.
      const cm: Record<Field, number> = { athlete: -1, type: -1, direction: -1, yards: -1, hang: -1, optime: -1, hash: -1 };
      (Object.keys(SYNONYMS) as Field[]).forEach((f) => {
        const idx = hdr.findIndex((h) => SYNONYMS[f].includes(norm(h)));
        cm[f] = idx;
      });
      setHeaders(hdr);
      setRawRows(rows);
      setColMap(cm);
    } catch {
      setError("That file couldn't be read as an .xlsx spreadsheet.");
    }
  };

  // Auto-match a raw type value against configured type labels.
  const autoType = (raw: string): string | undefined => {
    const n = norm(raw);
    return puntTypes.find((t) => norm(t.label) === n || norm(t.id) === n)?.id;
  };
  const autoHash = (raw: string): string | undefined => {
    const n = norm(raw);
    return hashOptions.find((h) => norm(h.label) === n || norm(h.id) === n)?.id;
  };
  const autoAthlete = (rawNum: string): string | undefined => {
    const n = String(rawNum).trim();
    return athletes.find((a) => (a.number ?? "").trim() === n)?.name;
  };
  const dirScoreOf = (raw: string): string | null => {
    const s = String(raw).trim();
    if (s === "") return "";
    // numeric direction values map straight through
    if (directionOptions.some((d) => d.id === s)) return s;
    const numeric = parseFloat(s);
    if (!isNaN(numeric)) return s;
    return null; // non-numeric direction code — left blank (rare; can extend later)
  };

  // Case-insensitive key so "Ru" and "RU" (or "Pooch red"/"Pooch Red") are the
  // same value — mapped once, applied to every matching row.
  const keyOf = (s: string) => s.trim().toLowerCase();

  // Distinct raw values needing resolution (deduped case-insensitively).
  const distinct = (field: Field) => {
    const idx = colMap[field];
    if (idx < 0) return [] as string[];
    const seen = new Map<string, string>();
    rawRows.forEach((r) => {
      const v = r[idx];
      if (v != null && String(v).trim() !== "") {
        const s = String(v).trim();
        if (!seen.has(keyOf(s))) seen.set(keyOf(s), s);
      }
    });
    return [...seen.values()];
  };
  const typeVals = useMemo(() => distinct("type"), [rawRows, colMap.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const hashVals = useMemo(() => distinct("hash"), [rawRows, colMap.hash]); // eslint-disable-line react-hooks/exhaustive-deps
  const athleteVals = useMemo(() => distinct("athlete"), [rawRows, colMap.athlete]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolveType = (raw: string) => typeMap[keyOf(raw)] ?? autoType(raw);
  const resolveHash = (raw: string) => hashMap[keyOf(raw)] ?? autoHash(raw);
  const resolveAthlete = (raw: string) => athleteMap[keyOf(raw)] ?? autoAthlete(raw);

  const unresolvedTypes = typeVals.filter((v) => !resolveType(v));
  const unresolvedAthletes = athleteVals.filter((v) => !resolveAthlete(v));

  // Build the final rows.
  const builtRows: ImportedPuntRow[] = useMemo(() => {
    if (!headers) return [];
    const get = (r: (string | number | null)[], f: Field) => (colMap[f] >= 0 ? r[colMap[f]] : null);
    return rawRows.map((r) => {
      const rawType = String(get(r, "type") ?? "").trim();
      const typeId = rawType ? resolveType(rawType) ?? "" : "";
      const cfg = puntTypes.find((t) => t.id === typeId);
      const isYL = cfg?.metric === "yardline";
      const depthRaw = get(r, "yards");
      const depth = depthRaw != null && String(depthRaw).trim() !== "" ? String(depthRaw).trim() : "";
      const rawNum = String(get(r, "athlete") ?? "").trim();
      const hangRaw = get(r, "hang");
      const opRaw = get(r, "optime");
      const dirRaw = String(get(r, "direction") ?? "").trim();
      const rawHash = String(get(r, "hash") ?? "").trim();
      return {
        athlete: rawNum ? resolveAthlete(rawNum) ?? "" : "",
        type: typeId,
        hash: rawHash ? resolveHash(rawHash) ?? "" : "",
        yards: isYL ? "" : depth,
        poochYL: isYL ? depth : "",
        hangTime: hangRaw != null && String(hangRaw).trim() !== "" ? String(hangRaw).trim() : "",
        opTime: opRaw != null && String(opRaw).trim() !== "" ? String(opRaw).trim() : "",
        directionalAccuracy: dirScoreOf(dirRaw) ?? "",
      };
    });
  }, [headers, rawRows, colMap, typeMap, hashMap, athleteMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const canImport = headers && builtRows.length > 0 && unresolvedTypes.length === 0 && unresolvedAthletes.length === 0 && colMap.athlete >= 0 && colMap.type >= 0;

  const doImport = () => {
    persist(typeMap, hashMap, athleteMap);
    onImport(builtRows);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-accent-lg">
        <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Import Punt Report</h2>
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
              <span className="text-xs text-muted">.xlsx — we&apos;ll read the &quot;Punt&quot; sheet</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </label>
          )}
          {error && <div className="bg-miss/10 border border-miss/30 text-miss text-sm rounded-input px-3 py-2">{error}</div>}

          {headers && (
            <>
              <p className="text-xs text-muted">Reading sheet <span className="text-slate-200 font-semibold">{sheetName}</span> · {rawRows.length} rows</p>

              {/* Column mapping */}
              <div className="card-2 p-3 space-y-2">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider">Columns</p>
                <div className="space-y-1.5">
                  {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                    <div key={f} className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 w-36 shrink-0">{FIELD_LABELS[f]}</span>
                      <select
                        value={colMap[f]}
                        onChange={(e) => setColMap((m) => ({ ...m, [f]: parseInt(e.target.value) }))}
                        className="flex-1 min-w-0 bg-surface-2 border border-border rounded-input px-2 py-1.5 text-xs text-slate-200"
                      >
                        <option value={-1}>— none —</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h || `Col ${i + 1}`}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Resolve unknown type values */}
              {typeVals.length > 0 && (
                <div className="card-2 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">Punt types <span className="normal-case text-[10px] text-muted">— match your report&apos;s calls to your types</span></p>
                  {typeVals.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs text-slate-200 w-28 shrink-0 font-semibold truncate">{v}</span>
                      <span className="text-muted text-xs shrink-0">→</span>
                      <select
                        value={resolveType(v) ?? ""}
                        onChange={(e) => { const t = { ...typeMap, [keyOf(v)]: e.target.value }; setTypeMap(t); persist(t, hashMap, athleteMap); }}
                        className={clsx("flex-1 min-w-0 bg-surface-2 border rounded-input px-2 py-1.5 text-xs", resolveType(v) ? "border-border text-slate-200" : "border-miss/50 text-miss")}
                      >
                        <option value="">— pick a type —</option>
                        {puntTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Resolve unknown hash values (optional) */}
              {hashVals.length > 0 && (
                <div className="card-2 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">Hash / position <span className="normal-case text-[10px] text-muted">— optional</span></p>
                  {hashVals.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs text-slate-200 w-28 shrink-0 font-semibold truncate">{v}</span>
                      <span className="text-muted text-xs shrink-0">→</span>
                      <select
                        value={resolveHash(v) ?? ""}
                        onChange={(e) => { const h = { ...hashMap, [keyOf(v)]: e.target.value }; setHashMap(h); persist(typeMap, h, athleteMap); }}
                        className="flex-1 min-w-0 bg-surface-2 border border-border rounded-input px-2 py-1.5 text-xs text-slate-200"
                      >
                        <option value="">— skip —</option>
                        {hashOptions.map((h) => <option key={h.id} value={h.id}>{h.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Resolve unmatched athlete numbers */}
              {athleteVals.length > 0 && (
                <div className="card-2 p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wider">Athletes <span className="normal-case text-[10px] text-muted">— matched by jersey number</span></p>
                  {athleteVals.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="text-xs text-slate-200 w-28 shrink-0 font-semibold truncate">#{v}</span>
                      <span className="text-muted text-xs shrink-0">→</span>
                      <select
                        value={resolveAthlete(v) ?? ""}
                        onChange={(e) => { const a = { ...athleteMap, [keyOf(v)]: e.target.value }; setAthleteMap(a); persist(typeMap, hashMap, a); }}
                        className={clsx("flex-1 min-w-0 bg-surface-2 border rounded-input px-2 py-1.5 text-xs", resolveAthlete(v) ? "border-border text-slate-200" : "border-miss/50 text-miss")}
                      >
                        <option value="">— pick athlete —</option>
                        {athletes.map((a) => <option key={a.id} value={a.name}>{a.name}{a.number ? ` (#${a.number})` : ""}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              <div className="card-2 overflow-x-auto">
                <p className="text-xs font-semibold text-muted uppercase tracking-wider p-2">Preview</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted">
                      <th className="text-left px-2 py-1">Athlete</th>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">Dist / YL</th>
                      <th className="px-2 py-1">Hang</th>
                      <th className="px-2 py-1">OT</th>
                      <th className="px-2 py-1">Dir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {builtRows.slice(0, 12).map((r, i) => {
                      const cfg = puntTypes.find((t) => t.id === r.type);
                      return (
                        <tr key={i} className="border-t border-border/40">
                          <td className={clsx("px-2 py-1", r.athlete ? "text-slate-200" : "text-miss")}>{r.athlete || "—"}</td>
                          <td className="px-2 py-1 text-center text-slate-300">{cfg?.label ?? "—"}</td>
                          <td className="px-2 py-1 text-center text-slate-300">{r.poochYL ? `${r.poochYL} YL` : r.yards ? `${r.yards} yd` : "—"}</td>
                          <td className="px-2 py-1 text-center text-muted">{r.hangTime || "—"}</td>
                          <td className="px-2 py-1 text-center text-muted">{r.opTime || "—"}</td>
                          <td className="px-2 py-1 text-center text-accent">{r.directionalAccuracy || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {builtRows.length > 12 && <p className="text-[10px] text-muted p-2">…and {builtRows.length - 12} more</p>}
              </div>

              {(unresolvedTypes.length > 0 || unresolvedAthletes.length > 0) && (
                <p className="text-xs text-warn">Resolve the highlighted {unresolvedTypes.length > 0 ? "punt type" : ""}{unresolvedTypes.length > 0 && unresolvedAthletes.length > 0 ? " and " : ""}{unresolvedAthletes.length > 0 ? "athlete" : ""} values to continue.</p>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-5 pt-2 flex gap-3 sticky bottom-0 bg-surface">
          <button onClick={onClose} className="btn-ghost flex-1">Cancel</button>
          <button onClick={doImport} disabled={!canImport} className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
            {headers ? `Import ${builtRows.length} punt${builtRows.length !== 1 ? "s" : ""}` : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
