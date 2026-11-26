"use client";

import { useState } from "react";
import { saveScoutRankings, saveArchivedRankingIds, newRankingId, ALL_RANKING, ALL_RANKING_ID, type ScoutRanking } from "@/lib/scoutStore";
import clsx from "clsx";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  teamId: string;
  sport: string; // short discipline key
  rankings: ScoutRanking[];
  onRankingsChange: (r: ScoutRanking[]) => void;
  active: string;
  onActiveChange: (id: string) => void;
  /** Delete a custom ranking group (parent handles cleanup + reload). */
  onDeleteRanking?: (id: string) => void;
  /** Ids of archived groups (hidden from the dropdown and from Overall). */
  archived?: string[];
  onArchivedChange?: (ids: string[]) => void;
}

/** Ranking selector dropdown for a discipline's rankings page, with inline rename/delete. */
export function RankingTabs({ teamId, sport, rankings, onRankingsChange, active, onActiveChange, onDeleteRanking, archived = [], onArchivedChange }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  // Real, stored groups (everything except the virtual all-charts group).
  const editable = rankings.filter((r) => r.id !== ALL_RANKING_ID);
  // Shown, editable groups: hide the untouched default "overall" since the locked
  // "Overall" now covers all charts (a renamed old-overall still shows).
  const visible = editable.filter((r) => !(r.id === "overall" && r.name === "Overall"));
  // Archived groups are hidden from the dropdown and the edit list (they get their own section).
  const shown = visible.filter((r) => !archived.includes(r.id));
  const archivedGroups = visible.filter((r) => archived.includes(r.id));
  const activeArchived = archivedGroups.find((r) => r.id === active);
  // Dropdown order: locked "Overall" (all charts) first, then the stored groups.
  // An archived group only appears while you're viewing it (e.g. from Scout Archives).
  const displayList = [ALL_RANKING, ...shown, ...(activeArchived ? [{ ...activeArchived, name: `${activeArchived.name} (archived)` }] : [])];

  const setArchived = async (ids: string[]) => {
    onArchivedChange?.(ids);
    try {
      await saveArchivedRankingIds(teamId, ids);
    } catch {
      window.alert("Couldn't save that change. Check your connection and try again.");
      onArchivedChange?.(archived);
    }
  };

  const archiveGroup = async (r: ScoutRanking) => {
    if (!window.confirm(`Archive "${r.name}"?\n\nIt will be hidden from the rankings and from Overall on every sport. Nothing is deleted, and you can restore it anytime.`)) return;
    if (active === r.id) onActiveChange(ALL_RANKING_ID);
    await setArchived([...archived.filter((id) => id !== r.id), r.id]);
  };

  const restoreGroup = async (id: string) => {
    await setArchived(archived.filter((x) => x !== id));
  };

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

  const editSheet = editing && (
    <BottomSheet onClose={cancelEdit}>
      <div className="flex items-start justify-between gap-3 px-5 pt-3 sm:pt-4 pb-2">
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-slate-100">Edit Ranking Groups</h3>
          <p className="text-xs text-muted">&quot;Overall&quot; is fixed and always shows every chart.</p>
        </div>
        <button onClick={cancelEdit} aria-label="Close" className="hidden sm:flex h-8 w-8 shrink-0 rounded-full bg-white/5 text-muted hover:text-white items-center justify-center text-lg leading-none">&times;</button>
      </div>

      <div data-sheet-scroll className="overflow-y-auto overscroll-contain px-5 pb-3 space-y-4">
        <div className="space-y-2">
          {shown.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <input
                value={draft[r.id] ?? ""}
                onChange={(e) => setDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                className="input flex-1 min-w-0 text-sm py-2"
              />
              {onArchivedChange && (
                <button onClick={() => archiveGroup(r)} className="text-xs font-semibold text-slate-300 hover:text-amber-400 px-1.5 py-2 transition-colors">
                  Archive
                </button>
              )}
              {r.id !== "overall" && onDeleteRanking && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete the "${r.name}" ranking? Its charts stay in Overall.`)) onDeleteRanking(r.id);
                  }}
                  className="text-xs font-semibold text-miss opacity-80 hover:opacity-100 px-1.5 py-2 transition-opacity"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
          {shown.length === 0 && !adding && (
            <p className="text-xs text-muted italic">No custom groups yet.</p>
          )}
          {adding ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addGroup(); }}
                placeholder="New group name..."
                className="input flex-1 min-w-0 text-sm py-2"
              />
              <button onClick={addGroup} disabled={!newName.trim()} className="btn-primary px-4 py-2 text-xs font-bold disabled:opacity-40">Add</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="text-sm text-amber-400 hover:underline font-semibold py-1">+ Add group</button>
          )}
        </div>

        {onArchivedChange && archivedGroups.length > 0 && (
          <div className="pt-3 border-t border-white/5 space-y-1">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">Archived</p>
            {archivedGroups.map((r) => (
              <div key={r.id} className="flex items-center gap-2 py-1.5">
                <span className="flex-1 text-sm text-muted truncate">{r.name}</span>
                <button onClick={() => restoreGroup(r.id)} className="text-xs font-semibold text-amber-400 hover:underline px-1.5">Restore</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-white/5">
        <button onClick={cancelEdit} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
        <button onClick={commit} className="btn-primary flex-1 py-2.5 text-sm font-bold">Save</button>
      </div>
    </BottomSheet>
  );

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
          <button onClick={startEdit} className="px-2 py-1 text-xs text-muted hover:text-amber-400 transition-colors" title="Rename, archive or delete rankings">✎</button>
        </div>
        {activeArchived && (
          <div className="mt-2 flex items-center gap-3 rounded-input bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-[11px]">
            <span className="text-amber-300">Archived group — hidden from Overall.</span>
            {onArchivedChange && <button onClick={() => restoreGroup(activeArchived.id)} className="font-semibold text-amber-400 hover:underline">Restore</button>}
          </div>
        )}
      </div>
      {editSheet}
    </div>
  );
}
