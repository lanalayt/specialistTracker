"use client";

import { useState } from "react";
import { saveScoutRankings, type ScoutRanking } from "@/lib/scoutStore";
import clsx from "clsx";

interface Props {
  teamId: string;
  sport: string; // short discipline key
  rankings: ScoutRanking[];
  onRankingsChange: (r: ScoutRanking[]) => void;
  active: string;
  onActiveChange: (id: string) => void;
}

/** Ranking selector tabs for a discipline's rankings page, with inline rename/delete. */
export function RankingTabs({ teamId, sport, rankings, onRankingsChange, active, onActiveChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const startEdit = () => {
    setDraft(Object.fromEntries(rankings.map((r) => [r.id, r.name])));
    setEditing(true);
  };

  const commit = async () => {
    const updated = rankings.map((r) => ({ ...r, name: (draft[r.id] ?? r.name).trim() || r.name }));
    onRankingsChange(updated);
    setEditing(false);
    await saveScoutRankings(teamId, sport, updated);
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Rename Rankings</p>
        {rankings.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              value={draft[r.id] ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, [r.id]: e.target.value }))}
              className="input flex-1 text-sm py-1.5"
            />
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(false)} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
          <button onClick={commit} className="btn-primary flex-1 py-1.5 text-xs font-bold">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {rankings.map((r) => (
        <button
          key={r.id}
          onClick={() => onActiveChange(r.id)}
          className={clsx(
            "px-3 py-1 rounded-input text-xs font-semibold transition-all border",
            active === r.id ? "bg-amber-500 text-slate-900 border-amber-500" : "bg-surface-2 text-muted border-border hover:text-white hover:border-slate-500"
          )}
        >
          {r.name}
        </button>
      ))}
      <button onClick={startEdit} className="px-2 py-1 text-xs text-muted hover:text-amber-400 transition-colors" title="Rename rankings">✎</button>
    </div>
  );
}
