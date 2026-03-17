"use client";

import { useState } from "react";
import { useFG } from "@/lib/fgContext";
import { useAuth } from "@/lib/auth";
import { makePct } from "@/lib/stats";
import type { FGKick, Session } from "@/types";
import clsx from "clsx";

function formatDateForInput(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
}

export default function KickingHistoryPage() {
  const { history, updateSessionDate, updateSessionWeather, deleteSession } = useFG();
  const { isAthlete } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(
    history[history.length - 1]?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingWeatherId, setEditingWeatherId] = useState<string | null>(null);

  const selected = history.find((s) => s.id === selectedId);
  const kicks = (selected?.entries ?? []) as FGKick[];
  const makes = kicks.filter((k) => k.result.startsWith("Y")).length;

  return (
    <main className="flex flex-col lg:flex-row h-[calc(100vh-100px)] overflow-hidden">
      {/* Session list */}
      <div className="lg:w-64 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto shrink-0">
        <div className="p-4 border-b border-border">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">
            Sessions ({history.length})
          </p>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted p-4">No sessions yet</p>
        ) : (
          <div className="divide-y divide-border/30">
            {[...history].reverse().map((s: Session) => {
              const sk = (s.entries ?? []) as FGKick[];
              const sm = sk.filter((k) => k.result.startsWith("Y")).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors hover:bg-surface-2",
                    selectedId === s.id && "bg-accent/10 border-l-2 border-accent"
                  )}
                >
                  <p className="text-sm font-semibold text-slate-200">{s.label}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {sk.length} kick{sk.length !== 1 ? "s" : ""} ·{" "}
                    <span className="text-accent">{makePct(sk.length, sm)}</span>
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Session detail */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selected ? (
          <div className="flex items-center justify-center h-40 text-muted text-sm">
            Select a session to view kicks
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex-1">
                {!isAthlete && editingId === selected.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      defaultValue={formatDateForInput(selected.date)}
                      onChange={(e) => {
                        if (e.target.value) {
                          updateSessionDate(
                            selected.id,
                            new Date(e.target.value + "T12:00:00").toISOString(),
                            formatLabel(e.target.value)
                          );
                        }
                      }}
                      className="input text-sm px-2 py-1"
                    />
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-accent hover:underline"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                    {!isAthlete && (
                      <button
                        onClick={() => setEditingId(selected.id)}
                        className="text-xs text-muted hover:text-accent transition-colors"
                        title="Change date"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted mt-0.5">
                  {kicks.length} kicks · {makes} makes ·{" "}
                  <span className="text-accent font-semibold">{makePct(kicks.length, makes)}</span>
                </p>
              </div>
              {!isAthlete && (
                <button
                  onClick={() => {
                    if (window.confirm(`Delete session "${selected.label}"? This cannot be undone.`)) {
                      deleteSession(selected.id);
                      setSelectedId(history.find((s) => s.id !== selected.id)?.id ?? null);
                    }
                  }}
                  className="text-xs px-2.5 py-1.5 rounded-input border border-miss/30 text-miss/70 hover:text-miss hover:border-miss/50 hover:bg-miss/10 transition-all ml-3 shrink-0"
                >
                  Delete Session
                </button>
              )}
            </div>
            {/* Weather display / edit */}
            <div className="mb-4">
              {!isAthlete && editingWeatherId === selected.id ? (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
                  <input
                    type="text"
                    value={selected.weather ?? ""}
                    onChange={(e) => updateSessionWeather(selected.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setEditingWeatherId(null); } }}
                    placeholder="Add weather notes..."
                    className="flex-1 max-w-xs bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                    autoFocus
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {selected.weather ? (
                    <p className="text-xs text-slate-300">{selected.weather}</p>
                  ) : (
                    <p className="text-xs text-muted italic">No weather set</p>
                  )}
                  {!isAthlete && (
                    <button
                      onClick={() => setEditingWeatherId(selected.id)}
                      className="text-muted hover:text-white transition-colors p-1"
                      title="Edit weather"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Dist</th>
                    <th className="table-header">Pos</th>
                    <th className="table-header">Result</th>
                    <th className="table-header">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {kicks.map((k, i) => (
                    <tr key={i} className="hover:bg-surface/30 transition-colors">
                      <td className="table-cell text-left text-muted">{i + 1}{k.starred ? <span className="text-amber-400"> ★</span> : ""}</td>
                      <td className="table-name">{k.athlete}</td>
                      <td className="table-cell">{k.dist} yd</td>
                      <td className="table-cell text-muted">{k.pos}</td>
                      <td className="table-cell">
                        <span className={clsx("text-xs font-semibold", k.result.startsWith("Y") ? "text-make" : "text-miss")}>
                          {k.result}
                        </span>
                      </td>
                      <td className="table-cell">{k.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
