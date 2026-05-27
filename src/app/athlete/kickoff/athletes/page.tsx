"use client";

import { useState } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import { getTeamId } from "@/lib/teamData";
import { createClient } from "@/lib/supabase";

const MIRROR_KEY = "KICKOFF";
const BLOCK_KEY = "blocked_athletes_ATHLETE_KICKOFF";

export default function AthleteKickoffAthletesPage() {
  const { athletes, addAthletes, removeAthlete } = useKickoff();
  const [input, setInput] = useState("");
  const [blocked, setBlocked] = useState<Set<string>>(() => {
    try { const b = JSON.parse(localStorage.getItem(BLOCK_KEY) ?? "[]"); return new Set(b); } catch { return new Set(); }
  });

  const visibleAthletes = athletes.filter((a) => !blocked.has(a.name));

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    if (blocked.has(name)) {
      const next = new Set(blocked);
      next.delete(name);
      setBlocked(next);
      try { localStorage.setItem(BLOCK_KEY, JSON.stringify([...next])); } catch {}
    }
    addAthletes([name]);
    setInput("");
  };

  const handleRemove = async (id: string, name: string) => {
    removeAthlete(id);
    const next = new Set(blocked);
    next.add(name);
    setBlocked(next);
    try { localStorage.setItem(BLOCK_KEY, JSON.stringify([...next])); } catch {}
    const tid = getTeamId();
    if (tid) {
      const supabase = createClient();
      await supabase.from("athletes").delete().eq("team_id", tid).eq("sport", MIRROR_KEY).eq("name", name);
      await supabase.from("athletes").delete().eq("team_id", tid).eq("sport", "ATHLETE_KICKOFF").eq("name", name);
    }
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Athlete Roster</h2>
        <p className="text-xs text-muted">Add or remove athletes from the Kickoff roster.</p>
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
