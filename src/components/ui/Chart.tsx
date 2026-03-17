"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  Cell,
} from "recharts";
import clsx from "clsx";

const ACCENT = "#00d4a0";
const SURFACE2 = "#1a2535";
const MUTED = "#64748b";
const MISS = "#ef4444";

// ─── Shared tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-2 border border-border rounded-input px-3 py-2 text-xs shadow-lg">
      <p className="text-muted mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-slate-200 font-semibold">
          {p.name}: {p.value}
          {p.name.toLowerCase().includes("%") ? "%" : ""}
        </p>
      ))}
    </div>
  );
}

// ─── Make% trend line chart ──────────────────────────────────────────────────

export interface TrendDataPoint {
  label: string;
  "Make%": number;
}

interface TrendChartProps {
  data: TrendDataPoint[];
  className?: string;
}

export function TrendChart({ data, className }: TrendChartProps) {
  return (
    <div className={clsx("card", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
        Make% Over Sessions
      </p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-muted text-xs">
          No sessions yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="makeGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2f42" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="Make%"
              stroke={ACCENT}
              strokeWidth={2.5}
              fill="url(#makeGradient)"
              dot={{ fill: ACCENT, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: ACCENT, stroke: SURFACE2, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Attempts by distance bar chart ──────────────────────────────────────────

export interface DistDataPoint {
  range: string;
  Made: number;
  Missed: number;
}

interface DistBarChartProps {
  data: DistDataPoint[];
  className?: string;
}

export function DistBarChart({ data, className }: DistBarChartProps) {
  return (
    <div className={clsx("card", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
        Attempts by Distance
      </p>
      {data.every((d) => d.Made + d.Missed === 0) ? (
        <div className="h-40 flex items-center justify-center text-muted text-xs">
          No kicks recorded yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2f42" vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="Made" fill={ACCENT} radius={[4, 4, 0, 0]} />
            <Bar dataKey="Missed" fill={MISS} opacity={0.7} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Donut chart ─────────────────────────────────────────────────────────────

interface DonutChartProps {
  made: number;
  total: number;
  label: string;
  className?: string;
}

export function DonutChart({ made, total, label, className }: DonutChartProps) {
  const pct = total > 0 ? Math.round((made / total) * 100) : 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const filled = total > 0 ? (made / total) * circumference : 0;
  const color = pct >= 70 ? ACCENT : pct >= 50 ? "#f59e0b" : MISS;

  return (
    <div className={clsx("flex flex-col items-center", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 self-start">
        {label}
      </p>
      <div className="relative">
        <svg width="110" height="110" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke={SURFACE2} strokeWidth="14" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeDasharray={`${filled} ${circumference}`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-slate-100">
            {total > 0 ? `${pct}%` : "—"}
          </span>
          <span className="text-[10px] text-muted">
            {made}/{total}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Kickoff zone ring chart ──────────────────────────────────────────────────

export interface ZoneDataPoint {
  zone: string;
  count: number;
}

interface ZoneBarChartProps {
  data: ZoneDataPoint[];
  className?: string;
}

// ─── Generic line trend chart ────────────────────────────────────────────────

export interface LineTrendDataPoint {
  label: string;
  [key: string]: string | number;
}

interface LineTrendChartProps {
  data: LineTrendDataPoint[];
  dataKey: string;
  title: string;
  unit?: string;
  domain?: [number, number];
  className?: string;
}

export function LineTrendChart({ data, dataKey, title, unit = "", domain, className }: LineTrendChartProps) {
  return (
    <div className={clsx("card", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
        {title}
      </p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-muted text-xs">
          No sessions yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`grad_${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2f42" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={ACCENT}
              strokeWidth={2.5}
              fill={`url(#grad_${dataKey})`}
              dot={{ fill: ACCENT, r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: ACCENT, stroke: SURFACE2, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

// ─── Multi-line trend chart ─────────────────────────────────────────────────

interface MultiLineTrendChartProps {
  data: LineTrendDataPoint[];
  dataKeys: { key: string; color: string }[];
  title: string;
  unit?: string;
  domain?: [number, number];
  className?: string;
}

export function MultiLineTrendChart({ data, dataKeys, title, unit = "", domain, className }: MultiLineTrendChartProps) {
  return (
    <div className={clsx("card", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
        {title}
      </p>
      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-muted text-xs">
          No sessions yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2f42" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              tick={{ fill: MUTED, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}${unit}`}
            />
            <Tooltip content={<CustomTooltip />} />
            {dataKeys.map((dk) => (
              <Line
                key={dk.key}
                type="monotone"
                dataKey={dk.key}
                stroke={dk.color}
                strokeWidth={2}
                dot={{ fill: dk.color, r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: dk.color, stroke: SURFACE2, strokeWidth: 2 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function ZoneBarChart({ data, className }: ZoneBarChartProps) {
  const colors = [ACCENT, "#3b82f6", "#8b5cf6", "#f59e0b", MISS, "#06b6d4", "#84cc16"];

  return (
    <div className={clsx("card", className)}>
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
        Landing Zones
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2f42" vertical={false} />
          <XAxis
            dataKey="zone"
            tick={{ fill: MUTED, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
