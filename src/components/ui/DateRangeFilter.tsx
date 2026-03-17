"use client";

import { useState, useMemo } from "react";
import clsx from "clsx";

export type DateRangeMode = "all" | "week" | "month" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getSunday(monday: Date): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getMonthStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthEnd(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromInputDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function useDateRangeFilter() {
  const [mode, setMode] = useState<DateRangeMode>("all");
  const [weekAnchor, setWeekAnchor] = useState(() => getMonday(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [customStart, setCustomStart] = useState(() => toInputDate(new Date()));
  const [customEnd, setCustomEnd] = useState(() => toInputDate(new Date()));

  const range: DateRange | null = useMemo(() => {
    if (mode === "all") return null;
    if (mode === "week") return { start: weekAnchor, end: getSunday(weekAnchor) };
    if (mode === "month") return { start: getMonthStart(monthAnchor), end: getMonthEnd(monthAnchor) };
    // custom
    const s = fromInputDate(customStart);
    const e = fromInputDate(customEnd);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }, [mode, weekAnchor, monthAnchor, customStart, customEnd]);

  const filterByDate = <T extends { date?: string }>(sessions: T[]): T[] => {
    if (!range) return sessions;
    return sessions.filter((s) => {
      if (!s.date) return true;
      const d = new Date(s.date);
      return d >= range.start && d <= range.end;
    });
  };

  const prevWeek = () => {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const nextWeek = () => {
    setWeekAnchor((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const prevMonth = () => {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setMonthAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return {
    mode, setMode,
    range, filterByDate,
    weekAnchor, prevWeek, nextWeek,
    monthAnchor, prevMonth, nextMonth,
    customStart, setCustomStart, customEnd, setCustomEnd,
  };
}

export function DateRangeFilter({
  mode, setMode,
  weekAnchor, prevWeek, nextWeek,
  monthAnchor, prevMonth, nextMonth,
  customStart, setCustomStart, customEnd, setCustomEnd,
}: ReturnType<typeof useDateRangeFilter>) {
  const modes: { id: DateRangeMode; label: string }[] = [
    { id: "all", label: "All" },
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-input border border-border overflow-hidden">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={clsx(
                "px-3 py-1.5 text-xs font-semibold transition-colors",
                m.id !== "all" && "border-l border-border",
                mode === m.id
                  ? "bg-accent text-slate-900"
                  : "text-muted hover:text-slate-300"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {mode === "week" && (
          <div className="flex items-center gap-1.5">
            <button onClick={prevWeek} className="text-muted hover:text-slate-300 text-sm px-1.5 py-0.5 rounded hover:bg-surface-2 transition-colors">‹</button>
            <span className="text-xs text-slate-300 font-medium min-w-[120px] text-center">
              {formatShortDate(weekAnchor)} – {formatShortDate(getSunday(weekAnchor))}
            </span>
            <button onClick={nextWeek} className="text-muted hover:text-slate-300 text-sm px-1.5 py-0.5 rounded hover:bg-surface-2 transition-colors">›</button>
          </div>
        )}

        {mode === "month" && (
          <div className="flex items-center gap-1.5">
            <button onClick={prevMonth} className="text-muted hover:text-slate-300 text-sm px-1.5 py-0.5 rounded hover:bg-surface-2 transition-colors">‹</button>
            <span className="text-xs text-slate-300 font-medium min-w-[120px] text-center">
              {formatMonthYear(monthAnchor)}
            </span>
            <button onClick={nextMonth} className="text-muted hover:text-slate-300 text-sm px-1.5 py-0.5 rounded hover:bg-surface-2 transition-colors">›</button>
          </div>
        )}

        {mode === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-surface-2 border border-border text-slate-200 px-2 py-1 rounded-input text-xs focus:outline-none focus:border-accent/60"
            />
            <span className="text-xs text-muted">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-surface-2 border border-border text-slate-200 px-2 py-1 rounded-input text-xs focus:outline-none focus:border-accent/60"
            />
          </div>
        )}
      </div>
    </div>
  );
}
