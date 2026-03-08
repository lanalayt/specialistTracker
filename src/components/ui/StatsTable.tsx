"use client";

import React from "react";
import { makePct, avgScore } from "@/lib/stats";
import clsx from "clsx";

export interface StatsRow {
  label: string;
  att: number;
  made: number;
  score: number;
  extra?: string; // e.g. "long FG: 52"
}

interface StatsTableProps {
  title: string;
  rows: StatsRow[];
  showScore?: boolean;
  className?: string;
}

export function StatsTable({
  title,
  rows,
  showScore = true,
  className,
}: StatsTableProps) {
  return (
    <div className={clsx("card-2", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        {title}
      </p>
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-header text-left">Name</th>
            <th className="table-header">Att</th>
            <th className="table-header">Made</th>
            <th className="table-header">%</th>
            {showScore && <th className="table-header">Avg</th>}
            {rows.some((r) => r.extra) && (
              <th className="table-header">Note</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={showScore ? 5 : 4}
                className="text-center text-muted text-xs py-4"
              >
                No data yet
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface/30 transition-colors">
                <td className="table-name">{row.label}</td>
                <td className="table-cell">{row.att || "—"}</td>
                <td className="table-cell">{row.made || "—"}</td>
                <td
                  className={clsx(
                    "table-cell",
                    row.att > 0 && "make-pct"
                  )}
                >
                  {makePct(row.att, row.made)}
                </td>
                {showScore && (
                  <td className="table-cell text-muted">
                    {avgScore(row.att, row.score)}
                  </td>
                )}
                {rows.some((r) => r.extra) && (
                  <td className="table-cell text-muted text-xs">
                    {row.extra ?? ""}
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Multi-athlete stats table ────────────────────────────────────────────────

export interface AthleteStatRow {
  athlete: string;
  att: number;
  made: number;
  score: number;
  longFG?: number;
}

interface MultiAthleteTableProps {
  title: string;
  rows: AthleteStatRow[];
  className?: string;
}

export function MultiAthleteTable({
  title,
  rows,
  className,
}: MultiAthleteTableProps) {
  return (
    <div className={clsx("card-2", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        {title}
      </p>
      <table className="w-full">
        <thead>
          <tr>
            <th className="table-header text-left">Athlete</th>
            <th className="table-header">Att</th>
            <th className="table-header">Made</th>
            <th className="table-header">%</th>
            <th className="table-header">Avg</th>
            <th className="table-header">Long</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                className="text-center text-muted text-xs py-4"
              >
                No kicks recorded yet
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="hover:bg-surface/30 transition-colors">
                <td className="table-name font-semibold">{row.athlete}</td>
                <td className="table-cell">{row.att || "—"}</td>
                <td className="table-cell">{row.made || "—"}</td>
                <td
                  className={clsx(
                    "table-cell",
                    row.att > 0 && "make-pct"
                  )}
                >
                  {makePct(row.att, row.made)}
                </td>
                <td className="table-cell text-muted">
                  {avgScore(row.att, row.score)}
                </td>
                <td className="table-cell text-muted">
                  {row.longFG ? `${row.longFG} yd` : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Miss chart ───────────────────────────────────────────────────────────────

interface MissChartProps {
  miss: { XL: number; XR: number; XS: number };
  className?: string;
}

export function MissChart({ miss, className }: MissChartProps) {
  const total = miss.XL + miss.XR + miss.XS;

  const bars = [
    { label: "Miss Left (XL)", count: miss.XL, color: "#f59e0b" },
    { label: "Miss Right (XR)", count: miss.XR, color: "#ef4444" },
    { label: "Miss Short (XS)", count: miss.XS, color: "#8b5cf6" },
  ];

  return (
    <div className={clsx("card-2", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Miss Chart
      </p>
      {total === 0 ? (
        <p className="text-xs text-muted py-2">No misses recorded</p>
      ) : (
        <div className="space-y-2">
          {bars.map((bar) => (
            <div key={bar.label} className="flex items-center gap-2">
              <span className="text-xs text-muted w-28 flex-shrink-0">
                {bar.label}
              </span>
              <div className="flex-1 h-5 bg-surface rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{
                    width: total > 0 ? `${(bar.count / total) * 100}%` : "0%",
                    backgroundColor: bar.color,
                    opacity: 0.85,
                  }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-300 w-4 text-right">
                {bar.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
