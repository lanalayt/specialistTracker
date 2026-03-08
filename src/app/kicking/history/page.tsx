"use client";

import { useState } from "react";
import { useFG } from "@/lib/fgContext";
import { makePct } from "@/lib/stats";
import type { FGKick, Session } from "@/types";
import clsx from "clsx";

export default function KickingHistoryPage() {
  const { history } = useFG();
  const [selectedId, setSelectedId] = useState<string | null>(
    history[history.length - 1]?.id ?? null
  );

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
              <div>
                <h2 className="text-lg font-bold text-slate-100">{selected.label}</h2>
                <p className="text-xs text-muted mt-0.5">
                  {kicks.length} kicks · {makes} makes ·{" "}
                  <span className="text-accent font-semibold">{makePct(kicks.length, makes)}</span>
                </p>
              </div>
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
                      <td className="table-cell text-left text-muted">{i + 1}</td>
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
