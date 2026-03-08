"use client";

import { useState } from "react";
import { useKickoff } from "@/lib/kickoffContext";
import type { KickoffEntry, Session } from "@/types";
import clsx from "clsx";

export default function KickoffHistoryPage() {
  const { history } = useKickoff();
  const [selectedId, setSelectedId] = useState<string | null>(
    history[history.length - 1]?.id ?? null
  );

  const selected = history.find((s) => s.id === selectedId);
  const entries = (selected?.entries ?? []) as KickoffEntry[];

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
              const se = (s.entries ?? []) as KickoffEntry[];
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
                    {se.length} kickoff{se.length !== 1 ? "s" : ""}
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
            Select a session to view kickoffs
          </div>
        ) : (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
              <p className="text-xs text-muted mt-0.5">{entries.length} kickoff{entries.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="card-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="table-header text-left">#</th>
                    <th className="table-header text-left">Athlete</th>
                    <th className="table-header">Dist</th>
                    <th className="table-header">Hang</th>
                    <th className="table-header">Zone</th>
                    <th className="table-header">Result</th>
                    <th className="table-header">Ret Yds</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, i) => (
                    <tr key={i} className="hover:bg-surface/30">
                      <td className="table-cell text-left text-muted">{i + 1}</td>
                      <td className="table-name">{e.athlete}</td>
                      <td className="table-cell">{e.distance > 0 ? `${e.distance} yd` : "—"}</td>
                      <td className="table-cell text-muted">{e.hangTime > 0 ? `${e.hangTime.toFixed(2)}s` : "—"}</td>
                      <td className="table-cell text-muted">{e.landingZone}</td>
                      <td className="table-cell">
                        <span className={clsx("text-xs font-semibold",
                          e.result === "TB" ? "text-make" : e.result === "OOB" ? "text-miss" : "text-slate-300"
                        )}>
                          {e.result}
                        </span>
                      </td>
                      <td className="table-cell text-muted">{e.returnYards > 0 ? `${e.returnYards} yd` : "—"}</td>
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
