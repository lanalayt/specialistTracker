"use client";

import { useState, useEffect } from "react";
import { usePunt } from "@/lib/puntContext";
import { getTeamId } from "@/lib/teamData";
import { createClient } from "@/lib/supabase";
import { getAppPref, setAppPref } from "@/lib/settingsSync";

const MIRROR_KEY = "PUNTING";
const BLOCK_PREF = "blockedAthletesPunting";

export default function AthletePuntingAthletesPage() {
  const { athletes, addAthletes, removeAthlete } = usePunt();
  const [input, setInput] = useState("");
  const [blocked, setBlocked] = useState<Set<string>>(() => new Set(getAppPref<string[]>(BLOCK_PREF) ?? []));

  const visibleAthletes = athletes.filter((a) => !blocked.has(a.name));

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    // Unblock if re-adding
    if (blocked.has(name)) {
      const next = new Set(blocked);
      next.delete(name);
      setBlocked(next);
      setAppPref(BLOCK_PREF, [...next]);
    }
    addAthletes([name]);
    setInput("");
  };

  const handleRemove = async (id: string, name: string) => {
    removeAthlete(id);
    // Block locally so realtime sync can't bring them back
    const next = new Set(blocked);
    next.add(name);
    setBlocked(next);
    setAppPref(BLOCK_PREF, [...next]);
    const tid = getTeamId();
    if (tid) {
      const supabase = createClient();
      await supabase.from("athletes").delete().eq("team_id", tid).eq("sport", MIRROR_KEY).eq("name", name);
      await supabase.from("athletes").delete().eq("team_id", tid).eq("sport", "ATHLETE_PUNTING").eq("name", name);
    }
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Athlete Roster</h2>
        <p className="text-xs text-muted">Add or remove athletes from the Punting roster.</p>
      </div>

      <div className="space-y-2">
        {visibleAthletes.length === 0 && (
          <p className="text-xs text-muted">No athletes added yet.</p>
        )}
        {visibleAthletes.map((a) => (
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
