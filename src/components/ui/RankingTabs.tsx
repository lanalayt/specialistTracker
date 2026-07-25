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
  /** Delete a custom ranking group (parent handles cleanup + reload). */
  onDeleteRanking?: (id: string) => void;
}

/** Ranking selector tabs for a discipline's rankings page, with inline rename/delete. */
export function RankingTabs({ teamId, sport, rankings, onRankingsChange, active, onActiveChange, onDeleteRanking }: Props) {
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
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Edit Rankings</p>
        {rankings.map((r) => (
          <div key={r.id} className="flex items-center gap-2">
            <input
              value={draft[r.id] ?? ""}
              onChange={(e) => setDraft((p) => ({ ...p, [r.id]: e.target.value }))}
              className="input flex-1 text-sm py-1.5"
            />
            {r.id !== "overall" && onDeleteRanking && (
              <button
                onClick={() => {
                  if (window.confirm(`Delete the "${r.name}" ranking? Its charts stay in Overall.`)) onDeleteRanking(r.id);
                }}
                className="text-[10px] text-muted hover:text-miss px-1 transition-colors"
              >
                Delete
              </button>
            )}
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
    <div className="flex items-center gap-2">
      <div>
        <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Ranking Group</p>
        <div className="flex items-center gap-2">
          <select
            value={active}
            onChange={(e) => onActiveChange(e.target.value)}
            className="input w-auto min-w-[10rem] text-sm font-semibold py-1.5 pr-8"
          >
            {rankings.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button onClick={startEdit} className="px-2 py-1 text-xs text-muted hover:text-amber-400 transition-colors" title="Rename or delete rankings">✎</button>
        </div>
      </div>
    </div>
  );
}
