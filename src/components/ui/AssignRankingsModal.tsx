"use client";

import { useState, useEffect } from "react";
import { loadScoutRankings, saveScoutRankings, newRankingId, type ScoutRanking } from "@/lib/scoutStore";
import clsx from "clsx";

interface Props {
  teamId: string;
  sport: string; // short discipline key: fg / punt / kickoff / snap
  onConfirm: (rankingIds: string[]) => void;
  onClose: () => void;
}

/**
 * Shown when saving a completed chart — pick which ranking(s) to add it to.
 * "Overall" is the default, and new rankings can be created on the fly.
 */
export function AssignRankingsModal({ teamId, sport, onConfirm, onClose }: Props) {
  const [rankings, setRankings] = useState<ScoutRanking[]>([{ id: "overall", name: "Overall" }]);
  const [selected, setSelected] = useState<Set<string>>(new Set(["overall"]));
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const list = await loadScoutRankings(teamId, sport);
      if (active) setRankings(list);
    })();
    return () => { active = false; };
  }, [teamId, sport]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const addRanking = async () => {
    const name = newName.trim();
    if (!name) return;
    const ranking = { id: newRankingId(), name };
    const updated = [...rankings, ranking];
    setRankings(updated);
    setSelected((prev) => new Set(prev).add(ranking.id));
    setNewName("");
    setAdding(false);
    await saveScoutRankings(teamId, sport, updated);
  };

  const confirm = () => {
    const ids = [...selected];
    onConfirm(ids.length > 0 ? ids : ["overall"]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Save to Rankings</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xs transition-colors">Close</button>
        </div>
        <p className="text-[10px] text-muted">Choose which ranking(s) to add this chart to.</p>

        <div className="space-y-1.5">
          {rankings.map((r) => (
            <button
              key={r.id}
              onClick={() => toggle(r.id)}
              className={clsx(
                "w-full flex items-center gap-2 px-3 py-2 rounded-input border text-xs font-semibold transition-all",
                selected.has(r.id) ? "bg-amber-500/15 text-amber-400 border-amber-500/40" : "bg-surface-2 text-slate-300 border-border hover:border-slate-500"
              )}
            >
              <span className={clsx("w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0", selected.has(r.id) ? "bg-amber-500 border-amber-500 text-slate-900" : "border-border")}>
                {selected.has(r.id) ? "✓" : ""}
              </span>
              <span className="truncate">{r.name}</span>
            </button>
          ))}
        </div>

        {adding ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addRanking(); }}
              placeholder="Ranking name..."
              className="input flex-1 text-sm py-1.5"
            />
            <button onClick={addRanking} disabled={!newName.trim()} className="btn-primary px-3 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="text-xs text-amber-400 hover:underline font-semibold">+ Add ranking</button>
        )}

        <button onClick={confirm} className="btn-primary w-full py-2.5 text-sm font-bold">Save to Rankings</button>
      </div>
    </div>
  );
}
