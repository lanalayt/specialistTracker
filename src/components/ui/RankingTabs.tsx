"use client";

import { useState } from "react";
import { saveScoutRankings, newRankingId, ALL_RANKING, ALL_RANKING_ID, type ScoutRanking } from "@/lib/scoutStore";
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

/** Ranking selector dropdown for a discipline's rankings page, with inline rename/delete. */
export function RankingTabs({ teamId, sport, rankings, onRankingsChange, active, onActiveChange, onDeleteRanking }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Real, stored groups (everything except the virtual all-charts group).
  const editable = rankings.filter((r) => r.id !== ALL_RANKING_ID);
  // Shown, editable groups: hide the untouched default "overall" since the locked
  // "Overall" now covers all charts (a renamed old-overall still shows).
  const shown = editable.filter((r) => !(r.id === "overall" && r.name === "Overall"));
  // Dropdown order: locked "Overall" (all charts) first, then the stored groups.
  const displayList = [ALL_RANKING, ...shown];

  const startEdit = () => {
    setDraft(Object.fromEntries(shown.map((r) => [r.id, r.name])));
    setAdding(false);
    setNewName("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setAdding(false);
    setNewName("");
  };

  const commit = async () => {
    // Map over all stored groups so a hidden default "overall" isn't dropped.
    const updated = editable.map((r) => ({ ...r, name: (draft[r.id] ?? r.name).trim() || r.name }));
    onRankingsChange(updated);
    setEditing(false);
    await saveScoutRankings(teamId, sport, updated);
  };

  const addGroup = async () => {
    const name = newName.trim();
    if (!name) return;
    const ranking = { id: newRankingId(), name };
    const updated = [...editable, ranking];
    onRankingsChange(updated);
    setDraft((p) => ({ ...p, [ranking.id]: name }));
    setNewName("");
    setAdding(false);
    await saveScoutRankings(teamId, sport, updated);
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Edit Rankings</p>
        <p className="text-[10px] text-muted">&quot;Overall&quot; is fixed and always shows every chart.</p>
        {shown.map((r) => (
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
        {shown.length === 0 && !adding && (
          <p className="text-[10px] text-muted italic">No custom groups yet.</p>
        )}
        {adding ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
              placeholder="New group name..."
              className="input flex-1 text-sm py-1.5"
            />
            <button onClick={addGroup} disabled={!newName.trim()} className="btn-primary px-3 py-1.5 text-xs font-bold disabled:opacity-40">Add</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="text-xs text-amber-400 hover:underline font-semibold">+ Add group</button>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={cancelEdit} className="btn-ghost flex-1 py-1.5 text-xs">Cancel</button>
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
            {displayList.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button onClick={startEdit} className="px-2 py-1 text-xs text-muted hover:text-amber-400 transition-colors" title="Rename or delete rankings">✎</button>
        </div>
      </div>
    </div>
  );
}
