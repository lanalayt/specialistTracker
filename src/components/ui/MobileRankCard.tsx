"use client";

import clsx from "clsx";
import React from "react";

export interface MobileRep {
  label: string;
  value: React.ReactNode;
  sub?: string;
  good?: boolean | null; // true = make/good, false = miss, null/undefined = neutral
}

/**
 * Phone layout for one scout-ranking row. Replaces the wide table on small screens
 * so nothing needs horizontal scrolling: name + headline stat on top, reps wrap as
 * small tiles, actions sit underneath.
 */
export function MobileRankCard({
  rank,
  name,
  meta,
  stat,
  statSub,
  reps,
  selectMode,
  selected,
  onToggleSelect,
  onRowClick,
  onInfo,
  infoActive,
  onDelete,
  extraAction,
}: {
  rank: number;
  name: React.ReactNode;
  meta?: string;
  stat: React.ReactNode;
  statSub?: string;
  reps?: MobileRep[];
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRowClick: () => void;
  onInfo: () => void;
  infoActive: boolean;
  onDelete: () => void;
  extraAction?: { label: string; onClick: () => void };
}) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  return (
    <div
      onClick={() => (selectMode ? onToggleSelect() : onRowClick())}
      className={clsx("py-3 px-1 cursor-pointer transition-colors rounded-lg", selected ? "bg-accent/10" : "active:bg-white/5")}
    >
      <div className="flex items-start gap-2">
        {selectMode && (
          <input type="checkbox" checked={selected} onChange={onToggleSelect} onClick={(e) => e.stopPropagation()} className="accent-accent mt-1" />
        )}
        <span className="text-xs text-muted tabular-nums w-5 shrink-0 pt-0.5">{rank}.</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-100 leading-snug">{name}</div>
          {meta && <p className="text-[11px] text-muted mt-0.5">{meta}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-base font-black text-amber-400 leading-tight">{stat}</div>
          {statSub && <p className="text-[11px] text-slate-300 font-semibold">{statSub}</p>}
        </div>
      </div>

      {reps && reps.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pl-7">
          {reps.map((r, i) => (
            <div
              key={i}
              className={clsx(
                "min-w-[2.75rem] rounded-md px-1.5 py-1 text-center bg-white/5",
                r.good === true && "text-make",
                r.good === false && "text-miss",
                (r.good === null || r.good === undefined) && "text-slate-400"
              )}
            >
              <p className="text-[9px] text-muted leading-none mb-0.5">{r.label}</p>
              <p className="text-xs font-bold leading-tight">{r.value}</p>
              {r.sub && <p className="text-[9px] leading-none mt-0.5 opacity-90">{r.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {!selectMode && (
        <div className="flex items-center gap-4 mt-2 pl-7 text-[11px] font-semibold">
          {extraAction && (
            <button onClick={stop(extraAction.onClick)} className="text-amber-400 hover:text-amber-300">{extraAction.label}</button>
          )}
          <button onClick={stop(onInfo)} className={infoActive ? "text-amber-400" : "text-muted hover:text-slate-200"}>
            {infoActive ? "Info •" : "Info"}
          </button>
          <button onClick={stop(onDelete)} className="text-muted hover:text-miss ml-auto">Remove</button>
        </div>
      )}
    </div>
  );
}
