"use client";

import { useState } from "react";
import { usePunt } from "@/lib/puntContext";
import type { PuntEntry, Session } from "@/types";
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

export default function PuntHistoryPage() {
  const { history, updateSessionDate } = usePunt();
  const [selectedId, setSelectedId] = useState<string | null>(
    history[history.length - 1]?.id ?? null
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const selected = history.find((s) => s.id === selectedId);
  const punts = (selected?.entries ?? []) as PuntEntry[];

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
              const sp = (s.entries ?? []) as PuntEntry[];
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
                    {sp.length} punt{sp.length !== 1 ? "s" : ""}
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
            Select a session to view punts
          </div>
        ) : (
          <>
            <div className="mb-4">
              {editingId === selected.id ? (
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
                  <button
                    onClick={() => setEditingId(selected.id)}
                    className="text-xs text-muted hover:text-accent transition-colors"
                    title="Change date"
                  >
                    ✏️
                  </button>
                </div>
              )}
              <p className="text-xs text-muted mt-0.5">{punts.length} punt{punts.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Yds</th>
                    <th className="table-header">Hang</th>
                    <th className="table-header">OT</th>
                  </tr>
                </thead>
                <tbody>
                  {punts.map((p, i) => (
                    <tr key={i} className="hover:bg-surface/30">
                      <td className="table-cell text-left text-muted">{i + 1}</td>
                      <td className="table-name">{p.athlete}</td>
                      <td className="table-cell text-muted">{p.type}</td>
                      <td className="table-cell">{p.yards} yd</td>
                      <td className="table-cell text-muted">{p.hangTime.toFixed(2)}s</td>
                      <td className="table-cell text-muted">{(p.opTime || 0).toFixed(2)}s</td>
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
