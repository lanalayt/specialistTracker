"use client";

import clsx from "clsx";
import React from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number; // positive = up, negative = down
  glow?: boolean;
  className?: string;
  icon?: React.ReactNode;
  accent?: boolean;
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  glow,
  className,
  icon,
  accent,
}: StatCardProps) {
  const trendPositive = trend !== undefined && trend > 0;
  const trendNegative = trend !== undefined && trend < 0;

  return (
    <div
      className={clsx(
        "card flex flex-col gap-2 transition-all hover:bg-surface-2",
        glow && "shadow-accent",
        accent && "border-accent/30",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">
          {label}
        </p>
        {icon && (
          <span className="text-lg text-muted">{icon}</span>
        )}
      </div>

      <div className="flex items-end gap-2">
        <span
          className={clsx(
            "text-3xl font-extrabold leading-none tracking-tight",
            accent ? "text-accent" : "text-slate-100"
          )}
        >
          {value}
        </span>

        {trend !== undefined && (
          <span
            className={clsx(
              "text-xs font-semibold px-1.5 py-0.5 rounded-pill mb-1",
              trendPositive && "bg-make/15 text-make",
              trendNegative && "bg-miss/15 text-miss",
              !trendPositive && !trendNegative && "bg-muted/15 text-muted"
            )}
          >
            {trendPositive ? "↑" : trendNegative ? "↓" : "→"}{" "}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
