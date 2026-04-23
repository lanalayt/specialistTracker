"use client";

import React from "react";

interface GoalPostVizProps {
  missL: number;
  missR: number;
  missS: number;
  missX?: number;
  makes: number;
}

export function GoalPostViz({ missL, missR, missS, missX = 0, makes }: GoalPostVizProps) {
  const total = makes + missL + missR + missS + missX;
  const totalMiss = missL + missR + missS + missX;

  return (
    <div className="card">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
        Miss Breakdown
      </p>
      {total === 0 ? (
        <div className="h-16 flex items-center justify-center text-xs text-muted">
          Log kicks to see miss breakdown
        </div>
      ) : (
        <div className="flex items-center justify-center">
          <svg viewBox="0 0 220 160" className="w-full max-w-[260px]" fill="none">
            {/* Goal post uprights */}
            <line x1="75" y1="15" x2="75" y2="105" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
            <line x1="145" y1="15" x2="145" y2="105" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
            {/* Crossbar */}
            <line x1="75" y1="60" x2="145" y2="60" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
            {/* Post */}
            <line x1="110" y1="60" x2="110" y2="105" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
            {/* Base */}
            <line x1="100" y1="105" x2="120" y2="105" stroke="#334155" strokeWidth="4" strokeLinecap="round" />

            {/* Makes zone — teal fill between uprights */}
            <rect x="77" y="17" width="66" height="41" fill="#00d4a0" fillOpacity="0.12" rx="2" />
            {makes > 0 && (
              <>
                <text x="110" y="40" textAnchor="middle" fill="#00d4a0" fontSize="18" fontWeight="800">
                  {makes}
                </text>
                <text x="110" y="53" textAnchor="middle" fill="#00d4a0" fontSize="9" fontWeight="600" letterSpacing="1">
                  GOOD
                </text>
              </>
            )}

            {/* Miss Left */}
            <text x="32" y="42" textAnchor="middle" fill="#ef4444" fontSize="26" fontWeight="800">
              {missL > 0 ? missL : "—"}
            </text>
            <text x="32" y="55" textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="600">
              ← LEFT
            </text>

            {/* Miss Right */}
            <text x="188" y="42" textAnchor="middle" fill="#ef4444" fontSize="26" fontWeight="800">
              {missR > 0 ? missR : "—"}
            </text>
            <text x="188" y="55" textAnchor="middle" fill="#ef4444" fontSize="9" fontWeight="600">
              RIGHT →
            </text>

            {/* Miss Short */}
            <text x="110" y="130" textAnchor="middle" fill="#f59e0b" fontSize="26" fontWeight="800">
              {missS > 0 ? missS : "—"}
            </text>
            <text x="110" y="145" textAnchor="middle" fill="#f59e0b" fontSize="9" fontWeight="600">
              ↓ SHORT
            </text>
          </svg>
        </div>
      )}
      {/* Total misses */}
      {totalMiss > 0 && (
        <p className="text-center text-xs text-muted mt-1">
          Total Misses: <span className="text-miss font-bold">{totalMiss}</span>
        </p>
      )}
    </div>
  );
}
