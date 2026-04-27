"use client";

import { useState } from "react";
import { useLongSnap } from "@/lib/longSnapContext";
import { useAuth } from "@/lib/auth";

export default function LongSnapAthletesPage() {
  const { athletes, addAthletes, removeAthlete } = useLongSnap();
  const { isAthlete } = useAuth();
  const viewOnly = isAthlete;
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    addAthletes([name]);
    setNewName("");
  };

  const handleRemove = (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    removeAthlete(id);
    setConfirmDelete(null);
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Snapping Athletes</h2>
        <p className="text-xs text-muted">Add or remove athletes for snapping sessions.</p>
      </div>

      {!viewOnly && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            placeholder="Athlete name"
            className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      )}

      <div className="space-y-2">
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No athletes added yet.</p>
        ) : athletes.map((a) => (
          <div key={a.id} className="card-2 flex items-center justify-between px-4 py-2.5">
            <span className="text-sm font-medium text-slate-200">{a.name}</span>
            {!viewOnly && (
              <button
                onClick={() => handleRemove(a.id)}
                className={`text-xs px-2.5 py-1 rounded-input border transition-all ${
                  confirmDelete === a.id
                    ? "bg-miss/20 border-miss/50 text-miss"
                    : "border-border text-muted hover:text-miss hover:border-miss/50"
                }`}
              >
                {confirmDelete === a.id ? "Confirm" : "Remove"}
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
