"use client";

import React, { useState, useCallback } from "react";
import type { FGKick, FGPosition, FGResult } from "@/types";
import { POSITIONS, RESULTS, MAKE_RESULTS } from "@/types";
import { RoleGuard } from "@/components/auth/RoleGuard";
import clsx from "clsx";

const RESULT_LABELS: Record<FGResult, string> = {
  YL: "✓ Good ←",
  YC: "✓ Good",
  YR: "✓ Good →",
  XL: "← Miss Left",
  XR: "Miss Right →",
  XS: "↓ Miss Short",
};

interface LogRow {
  id: string;
  athlete: string;
  dist: string;
  pos: FGPosition | "";
  result: FGResult | "";
  score: string;
  error?: boolean;
}

function newRow(): LogRow {
  return {
    id: `row-${Date.now()}-${Math.random()}`,
    athlete: "",
    dist: "",
    pos: "",
    result: "",
    score: "",
  };
}

const DEFAULT_ROW_COUNT = 8;

interface SportLogProps {
  athletes: string[];
  onCommit: (kicks: FGKick[]) => void;
  onClear?: () => void;
  canUndo?: boolean;
  onUndo?: () => void;
}

export function SportLog({
  athletes,
  onCommit,
  onClear,
  canUndo,
  onUndo,
}: SportLogProps) {
  const [rows, setRows] = useState<LogRow[]>(() =>
    Array.from({ length: DEFAULT_ROW_COUNT }, newRow)
  );

  const updateRow = useCallback(
    (id: string, field: keyof LogRow, value: string) => {
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, [field]: value, error: false } : r))
      );
    },
    []
  );

  const clearRow = useCallback((id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, athlete: "", dist: "", pos: "", result: "", score: "", error: false }
          : r
      )
    );
  }, []);

  const addRow = () => {
    setRows((prev) => [...prev, newRow()]);
  };

  const clearAll = () => {
    setRows(Array.from({ length: DEFAULT_ROW_COUNT }, newRow));
    onClear?.();
  };

  const filledRows = rows.filter(
    (r) => r.athlete || r.dist || r.pos || r.result || r.score
  );

  const handleCommit = () => {
    if (filledRows.length === 0) return;

    // Validate
    let hasErrors = false;
    const validated = rows.map((r) => {
      const filled = !!(r.athlete || r.dist || r.pos || r.result || r.score);
      const complete = !!(
        r.athlete &&
        r.dist &&
        r.pos &&
        r.result &&
        r.score !== ""
      );
      if (filled && !complete) {
        hasErrors = true;
        return { ...r, error: true };
      }
      return { ...r, error: false };
    });

    if (hasErrors) {
      setRows(validated);
      return;
    }

    const kicks: FGKick[] = rows
      .filter(
        (r) =>
          r.athlete && r.dist && r.pos && r.result && r.score !== ""
      )
      .map((r) => ({
        athleteId: r.athlete,
        athlete: r.athlete,
        dist: parseInt(r.dist),
        pos: r.pos as FGPosition,
        result: r.result as FGResult,
        score: parseInt(r.score),
      }));

    onCommit(kicks);
  };

  const kickCount = filledRows.length;

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface z-10">
            <tr>
              <th className="table-header text-left w-6">#</th>
              <th className="table-header text-left">Athlete</th>
              <th className="table-header">Dist</th>
              <th className="table-header">Pos</th>
              <th className="table-header">Result</th>
              <th className="table-header">Score</th>
              <th className="table-header w-8"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={clsx(
                  "transition-colors",
                  row.error && "bg-miss/10",
                  !row.error && "hover:bg-surface-2/50"
                )}
              >
                <td className="table-cell text-left text-muted text-xs py-1.5 px-3">
                  {idx + 1}
                </td>
                <td className="py-1.5 px-2">
                  <RoleGuard disableForAthletes>
                    <select
                      className="select py-1.5 text-xs min-w-[90px]"
                      value={row.athlete}
                      onChange={(e) => updateRow(row.id, "athlete", e.target.value)}
                    >
                      <option value="">—</option>
                      {athletes.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </RoleGuard>
                </td>
                <td className="py-1.5 px-2">
                  <RoleGuard disableForAthletes>
                    <input
                      className="input py-1.5 text-xs w-16 text-right"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="yds"
                      value={row.dist}
                      onChange={(e) => updateRow(row.id, "dist", e.target.value)}
                    />
                  </RoleGuard>
                </td>
                <td className="py-1.5 px-2">
                  <RoleGuard disableForAthletes>
                    <select
                      className="select py-1.5 text-xs"
                      value={row.pos}
                      onChange={(e) => updateRow(row.id, "pos", e.target.value)}
                    >
                      <option value="">—</option>
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </RoleGuard>
                </td>
                <td className="py-1.5 px-2">
                  <RoleGuard disableForAthletes>
                    <select
                      className={clsx(
                        "select py-1.5 text-xs",
                        row.result && MAKE_RESULTS.includes(row.result as FGResult) && "text-make",
                        row.result !== "" && !MAKE_RESULTS.includes(row.result as FGResult) && "text-miss"
                      )}
                      value={row.result}
                      onChange={(e) => updateRow(row.id, "result", e.target.value)}
                    >
                      <option value="">—</option>
                      {RESULTS.map((r) => (
                        <option key={r} value={r}>
                          {RESULT_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </RoleGuard>
                </td>
                <td className="py-1.5 px-2">
                  <RoleGuard disableForAthletes>
                    <input
                      className="input py-1.5 text-xs w-14 text-right"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="—"
                      value={row.score}
                      onChange={(e) => updateRow(row.id, "score", e.target.value)}
                    />
                  </RoleGuard>
                </td>
                <td className="py-1.5 px-2">
                  <RoleGuard disableForAthletes>
                    <button
                      onClick={() => clearRow(row.id)}
                      className="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-xs"
                      title="Clear row"
                    >
                      ×
                    </button>
                  </RoleGuard>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <RoleGuard disableForAthletes>
        <div className="border-t border-border p-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted flex-1">
            {kickCount === 0
              ? "0 kicks entered"
              : `${kickCount} kick${kickCount !== 1 ? "s" : ""} entered`}
          </span>
          <button onClick={addRow} className="btn-ghost text-xs py-1.5 px-3">
            + Row
          </button>
          {canUndo && (
            <button onClick={onUndo} className="btn-ghost text-xs py-1.5 px-3">
              ↩ Undo
            </button>
          )}
          <button
            onClick={clearAll}
            className="btn-ghost text-xs py-1.5 px-3 text-miss/80 border-miss/30 hover:bg-miss/10"
          >
            Clear
          </button>
          <button
            onClick={handleCommit}
            disabled={kickCount === 0}
            className="btn-primary text-xs py-1.5 px-4"
          >
            Commit Practice
          </button>
        </div>
      </RoleGuard>
    </div>
  );
}
