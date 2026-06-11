"use client";

import { useState } from "react";
import { updateSessionAthleteEntries, scoutDisplayName, type ScoutSession } from "@/lib/scoutStore";
import clsx from "clsx";

type Rep = Record<string, unknown>;

interface KickSlot { kickNum: number; distance: number; hash: string; pointValue: number }

interface Props {
  teamId: string;
  session: ScoutSession;
  athlete: string;
  numbers?: Record<string, string>;
  /** FG preset positions (columns) so an added kick fills the right column. */
  kickSlots?: KickSlot[];
  onClose: () => void;
  onSaved: () => void;
}

const HASH = ["L", "M", "R"];
const DIRS = ["L", "M", "R"];
const round2 = (n: number) => parseFloat(n.toFixed(2));
const numOf = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "")) || 0);

function isShortSnap(label: string) {
  return label.startsWith("Short Snaps") || label.startsWith("30 Point");
}

/** Recompute a rep's derived score/points for its discipline. */
function recompute(sport: string, label: string, r: Rep): Rep {
  if (sport === "SCOUT_FG") return { ...r, score: r.result === "make" ? numOf(r.pointValue) : 0 };
  if (sport === "SCOUT_KO") return { ...r, score: round2(numOf(r.distance) + numOf(r.hangTime) * 10 + (r.directionGood === false ? -10 : 0)) };
  if (sport === "SCOUT_PUNT") return { ...r, score: round2(numOf(r.distance) + numOf(r.hangTime) * 15 + (r.directionGood === false ? -10 : 0)) };
  // SCOUT_SNAP
  if (isShortSnap(label)) {
    let pts = 0;
    if (r.accuracy === "Strike") pts += 1;
    if (r.laces === "Good") pts += 1; else if (r.laces === "1/4 Turn") pts += 0.5;
    if (r.spiral === "Good") pts += 1;
    return { ...r, points: pts, markerInZone: r.accuracy === "Strike" };
  }
  return { ...r, score: r.accuracy === "Strike" ? 1 : 0 };
}

function blankRep(sport: string, athlete: string, label: string): Rep {
  const base = { athlete };
  if (sport === "SCOUT_FG") return { ...base, distance: 30, hash: "M", pointValue: 1, result: "make", score: 1 };
  if (sport === "SCOUT_KO") return { ...base, distance: 40, hangTime: 4, directionGood: true, score: round2(40 + 40) };
  if (sport === "SCOUT_PUNT") return { ...base, distance: 40, hangTime: 4, opTime: 0, directionGood: true, score: round2(40 + 60) };
  if (isShortSnap(label)) return { ...base, accuracy: "Strike", laces: "Good", spiral: "Good", points: 3 };
  return { ...base, accuracy: "Strike", spiral: "Good", time: "", score: 1 };
}

export function EditChartModal({ teamId, session, athlete, numbers, kickSlots, onClose, onSaved }: Props) {
  const sport = session.sport;
  const short = isShortSnap(session.label);
  const [reps, setReps] = useState<Rep[]>(() =>
    (session.entries as Rep[]).filter((e) => (e as { athlete?: string }).athlete === athlete).map((e) => ({ ...e }))
  );
  const [saving, setSaving] = useState(false);

  const setField = (i: number, key: string, value: unknown) =>
    setReps((prev) => prev.map((r, j) => (j === i ? recompute(sport, session.label, { ...r, [key]: value }) : r)));
  const addRep = () => setReps((prev) => [...prev, blankRep(sport, athlete, session.label)]);
  const removeRep = (i: number) => setReps((prev) => prev.filter((_, j) => j !== i));

  // Only an FG *preset* chart has fixed kick positions (columns).
  const isPresetChart = (() => {
    if (sport !== "SCOUT_FG") return false;
    const entries = session.entries as Rep[];
    const mode = (entries.find((e) => (e as { chartMode?: string }).chartMode) as { chartMode?: string } | undefined)?.chartMode;
    if (mode) return mode === "preset";
    const names = [...new Set(entries.map((e) => (e as { athlete?: string }).athlete))];
    if (names.length < 2) return false;
    const seq = (a: string) => entries.filter((e) => (e as { athlete?: string }).athlete === a).map((e) => `${e.distance}-${e.hash}`).sort().join(",");
    const first = seq(names[0]!);
    return names.every((a) => seq(a!) === first);
  })();

  // For an FG preset chart, the kick positions (columns) come from the rankings
  // (kickSlots) or, as a fallback, the distinct kick numbers in this session.
  // Offer the ones this athlete is missing so an added kick fills the right
  // column (e.g. 35R) instead of landing in a new one.
  const presetSlots = !isPresetChart
    ? []
    : kickSlots && kickSlots.length > 0
      ? [...kickSlots].sort((a, b) => a.kickNum - b.kickNum)
      : (() => {
          const m = new Map<number, KickSlot>();
          for (const e of session.entries as Rep[]) {
            const kn = typeof e.kickNum === "number" ? (e.kickNum as number) : null;
            if (kn != null && !m.has(kn)) m.set(kn, { kickNum: kn, distance: Number(e.distance) || 0, hash: String(e.hash ?? "M"), pointValue: Number(e.pointValue) || 1 });
          }
          return [...m.values()].sort((a, b) => a.kickNum - b.kickNum);
        })();
  const usedKickNums = new Set(reps.map((r) => r.kickNum));
  const missingSlots = presetSlots.filter((s) => !usedKickNums.has(s.kickNum));
  const addSlot = (s: { kickNum: number; distance: number; hash: string; pointValue: number }) =>
    setReps((prev) => [...prev, recompute(sport, session.label, { athlete, kickNum: s.kickNum, distance: s.distance, hash: s.hash, pointValue: s.pointValue, result: "make" })]);

  const save = async () => {
    setSaving(true);
    // Preserve the athlete's note (if any) on the first rep, recompute scores.
    // Keep each rep's existing kick number (so a chart of e.g. kicks 6-10 stays
    // aligned to those columns); only assign new numbers to added reps.
    const note = (session.entries as Rep[]).find((e) => (e as { athlete?: string }).athlete === athlete && (e as { notes?: string }).notes);
    const used = reps.map((r) => (typeof r.kickNum === "number" ? (r.kickNum as number) : 0));
    let nextKick = (used.length ? Math.max(...used) : 0) + 1;
    let finalReps = reps.map((r) => {
      const kickNum = typeof r.kickNum === "number" ? r.kickNum : nextKick++;
      return recompute(sport, session.label, { ...r, athlete, kickNum });
    });
    // Preset charts: keep kicks in column (kickNum) order so an added kick slots into
    // its correct spot instead of landing at the end.
    if (isPresetChart) finalReps = [...finalReps].sort((a, b) => (a.kickNum as number) - (b.kickNum as number));
    if (note && finalReps.length > 0) (finalReps[0] as { notes?: unknown }).notes = (note as { notes?: unknown }).notes;
    const ok = await updateSessionAthleteEntries(teamId, session.id, athlete, finalReps);
    setSaving(false);
    if (ok) onSaved();
  };

  const Toggle = ({ on, onText, offText, onClick }: { on: boolean; onText: string; offText: string; onClick: () => void }) => (
    <div className="flex rounded-input border border-border overflow-hidden">
      <button onClick={onClick} className={clsx("flex-1 py-1.5 text-[10px] font-bold transition-colors", on ? "bg-make text-slate-900" : "text-muted")}>{onText}</button>
      <button onClick={onClick} className={clsx("flex-1 py-1.5 text-[10px] font-bold transition-colors border-l border-border", !on ? "bg-miss text-white" : "text-muted")}>{offText}</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-md mx-4 p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Edit Chart — {scoutDisplayName(athlete, numbers)}</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xs transition-colors">Close</button>
        </div>
        <p className="text-[10px] text-muted">{new Date(session.date).toLocaleDateString()} · {reps.length} rep{reps.length !== 1 ? "s" : ""}</p>

        <div className="space-y-2">
          {reps.map((r, i) => (
            <div key={i} className="card-2 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted">#{i + 1}</span>
                <button onClick={() => removeRep(i)} className="text-[10px] text-muted hover:text-miss transition-colors">Remove</button>
              </div>

              {sport === "SCOUT_FG" && (
                <div className="grid grid-cols-4 gap-2 items-end">
                  <div><p className="text-[8px] text-muted text-center mb-0.5">Dist</p><input inputMode="numeric" value={String(r.distance ?? "")} onChange={(e) => setField(i, "distance", parseInt(e.target.value.replace(/\D/g, "")) || 0)} className="input w-full text-center text-xs py-1" /></div>
                  <div><p className="text-[8px] text-muted text-center mb-0.5">Hash</p><select value={String(r.hash ?? "M")} onChange={(e) => setField(i, "hash", e.target.value)} className="input w-full text-center text-xs py-1">{HASH.map((h) => <option key={h}>{h}</option>)}</select></div>
                  <div><p className="text-[8px] text-muted text-center mb-0.5">Pts</p><input inputMode="numeric" value={String(r.pointValue ?? "")} onChange={(e) => setField(i, "pointValue", parseInt(e.target.value.replace(/\D/g, "")) || 0)} className="input w-full text-center text-xs py-1" /></div>
                  <Toggle on={r.result === "make"} onText="Good" offText="Miss" onClick={() => setField(i, "result", r.result === "make" ? "miss" : "make")} />
                </div>
              )}

              {(sport === "SCOUT_KO" || sport === "SCOUT_PUNT") && (
                <div className={clsx("grid gap-2 items-end", sport === "SCOUT_PUNT" ? "grid-cols-4" : "grid-cols-3")}>
                  <div><p className="text-[8px] text-muted text-center mb-0.5">Dist</p><input inputMode="numeric" value={String(r.distance ?? "")} onChange={(e) => setField(i, "distance", parseInt(e.target.value.replace(/\D/g, "")) || 0)} className="input w-full text-center text-xs py-1" /></div>
                  <div><p className="text-[8px] text-muted text-center mb-0.5">Hang</p><input inputMode="decimal" value={String(r.hangTime ?? "")} onChange={(e) => setField(i, "hangTime", e.target.value)} className="input w-full text-center text-xs py-1" /></div>
                  {sport === "SCOUT_PUNT" && <div><p className="text-[8px] text-muted text-center mb-0.5">Op</p><input inputMode="decimal" value={String(r.opTime ?? "")} onChange={(e) => setField(i, "opTime", e.target.value)} className="input w-full text-center text-xs py-1" /></div>}
                  <Toggle on={r.directionGood !== false} onText="Good" offText="Bad" onClick={() => setField(i, "directionGood", r.directionGood === false)} />
                </div>
              )}

              {sport === "SCOUT_SNAP" && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div><p className="text-[8px] text-muted text-center mb-0.5">Call</p><Toggle on={r.accuracy === "Strike"} onText="Strike" offText="Ball" onClick={() => setField(i, "accuracy", r.accuracy === "Strike" ? "Ball" : "Strike")} /></div>
                    <div><p className="text-[8px] text-muted text-center mb-0.5">Spiral</p><Toggle on={r.spiral === "Good"} onText="Tight" offText="Open" onClick={() => setField(i, "spiral", r.spiral === "Good" ? "Bad" : "Good")} /></div>
                  </div>
                  {short ? (
                    <div><p className="text-[8px] text-muted text-center mb-0.5">Laces</p>
                      <div className="grid grid-cols-3 gap-1">
                        {[["Good", "Perfect"], ["1/4 Turn", "1/4"], ["Back", "Back"]].map(([v, lbl]) => (
                          <button key={v} onClick={() => setField(i, "laces", v)} className={clsx("py-1 rounded-input text-[10px] font-bold border", r.laces === v ? "bg-amber-500 text-slate-900 border-amber-500" : "bg-surface-2 text-muted border-border")}>{lbl}</button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div><p className="text-[8px] text-muted text-center mb-0.5">Time</p><input inputMode="decimal" value={String(r.time ?? "")} onChange={(e) => setField(i, "time", e.target.value)} placeholder="0.65" className="input w-full text-center text-xs py-1" /></div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {missingSlots.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] text-muted">Add a missing kick:</p>
            <div className="flex flex-wrap gap-1.5">
              {missingSlots.map((s) => (
                <button key={s.kickNum} onClick={() => addSlot(s)} className="px-2.5 py-1 rounded-input text-[10px] font-bold bg-surface-2 text-amber-400 border border-amber-500/40 hover:bg-amber-500/10 transition-all">+ {s.distance}{s.hash}</button>
              ))}
            </div>
          </div>
        )}

        <button onClick={addRep} className="btn-ghost w-full py-2 text-xs font-bold border border-amber-500/40 text-amber-400">+ Add Rep</button>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1 py-2.5 text-sm font-bold disabled:opacity-40">{saving ? "Saving..." : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}
