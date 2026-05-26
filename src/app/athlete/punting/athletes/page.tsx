"use client";

import { useState } from "react";
import { usePunt } from "@/lib/puntContext";
import { getTeamId } from "@/lib/teamData";
import { loadAthletes, removeAthlete as removeAthleteById } from "@/lib/athleteStore";

const MIRROR_KEY = "PUNTING";

export default function AthletePuntingAthletesPage() {
  const { athletes, addAthletes, removeAthlete } = usePunt();
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    addAthletes([name]);
    setInput("");
  };

  const handleRemove = async (id: string, name: string) => {
    removeAthlete(id);
    const tid = getTeamId();
    if (tid) {
      const teamList = await loadAthletes(tid, MIRROR_KEY);
      const found = teamList.find((a) => a.name === name);
      if (found) await removeAthleteById(tid, found.id);
    }
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Athlete Roster</h2>
        <p className="text-xs text-muted">Add or remove athletes from the Punting roster.</p>
      </div>

      <div className="space-y-2">
        {athletes.length === 0 && (
          <p className="text-xs text-muted">No athletes added yet.</p>
        )}
        {athletes.map((a) => (
          <div key={a.id} className="card-2 flex items-center justify-between px-4 py-2.5">
            <span className="text-sm font-medium text-slate-200">{a.name}</span>
            <button
              onClick={() => handleRemove(a.id, a.name)}
              className="text-xs text-muted hover:text-miss transition-colors px-2 py-1"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="Athlete name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button onClick={handleAdd} className="btn-primary px-4 py-2 text-sm">
          Add
        </button>
      </div>
    </main>
  );
}
