"use client";

import { useState } from "react";
import { useLongSnap } from "@/lib/longSnapContext";
import type { LongSnapEntry, SnapBenchmark, Session } from "@/types";
import clsx from "clsx";

const ACC_LABEL: Record<string, string> = {
  ON_TARGET: "✓ On Target",
  HIGH: "↑ High",
  LOW: "↓ Low",
  LEFT: "← Left",
  RIGHT: "→ Right",
};

const BM_COLORS: Record<SnapBenchmark, string> = {
  excellent: "text-make",
  good: "text-accent",
  needsWork: "text-miss",
};

export default function LongSnapHistoryPage() {
  const { history, updateSessionWeather } = useLongSnap();
  const [selectedId, setSelectedId] = useState<string | null>(
    history[history.length - 1]?.id ?? null
  );

  const selected = history.find((s) => s.id === selectedId);
  const snaps = (selected?.entries ?? []) as LongSnapEntry[];

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
              const ss = (s.entries ?? []) as LongSnapEntry[];
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
                    {ss.length} snap{ss.length !== 1 ? "s" : ""}
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
            Select a session to view snaps
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
              <p className="text-xs text-muted mt-0.5">{snaps.length} snap{snaps.length !== 1 ? "s" : ""}</p>
              {selected.weather && (
                <p className="text-xs text-muted mt-1">Weather: {selected.weather}</p>
              )}
            </div>
            {/* Editable weather */}
            <div className="mb-4 flex items-center gap-2">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Weather</label>
              <input
                type="text"
                value={selected.weather ?? ""}
                onChange={(e) => updateSessionWeather(selected.id, e.target.value)}
                placeholder="Add weather notes..."
                className="flex-1 max-w-xs bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-xs focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
              />
            </div>
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Time</th>
                    <th className="table-header">Accuracy</th>
                    <th className="table-header">Benchmark</th>
                  </tr>
                </thead>
                <tbody>
                  {snaps.map((s, i) => (
                    <tr key={i} className="hover:bg-surface/30">
                      <td className="table-cell text-left text-muted">{i + 1}</td>
                      <td className="table-name">{s.athlete}</td>
                      <td className="table-cell text-muted">{s.snapType}</td>
                      <td className="table-cell font-bold">{s.time.toFixed(3)}s</td>
                      <td className="table-cell">
                        <span className={clsx("text-xs", s.accuracy === "ON_TARGET" ? "text-make" : "text-warn")}>
                          {ACC_LABEL[s.accuracy] ?? s.accuracy}
                        </span>
                      </td>
                      <td className="table-cell">
                        {s.benchmark ? (
                          <span className={clsx("text-xs font-semibold", BM_COLORS[s.benchmark])}>
                            {s.benchmark}
                          </span>
                        ) : "—"}
                      </td>
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
