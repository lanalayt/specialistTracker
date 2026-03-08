"use client";

import { useState } from "react";
import { useFG } from "@/lib/fgContext";

export default function KickingAthletesPage() {
  const { athletes, addAthletes, removeAthlete } = useFG();
  const [input, setInput] = useState("");

  const handleAdd = () => {
    const name = input.trim();
    if (!name) return;
    addAthletes([name]);
    setInput("");
  };

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Athlete Roster</h2>
        <p className="text-xs text-muted">Add or remove athletes from the FG Kicking roster.</p>
      </div>

      <div className="space-y-2">
        {athletes.length === 0 && (
          <p className="text-xs text-muted">No athletes added yet.</p>
        )}
        {athletes.map((a) => (
          <div key={a} className="card-2 flex items-center justify-between px-4 py-2.5">
            <span className="text-sm font-medium text-slate-200">{a}</span>
            <button
              onClick={() => removeAthlete(a)}
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
