"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { TrendChart, DistBarChart } from "@/components/ui/Chart";
import { FGProvider, useFG } from "@/lib/fgContext";
import { makePct } from "@/lib/stats";
import type { FGKick } from "@/types";
import { DIST_RANGES } from "@/types";
import clsx from "clsx";

type Tab = "kicking" | "punting" | "kickoff" | "longsnap";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "kicking", label: "FG Kicking", icon: "🏈" },
  { id: "punting", label: "Punting", icon: "👟" },
  { id: "kickoff", label: "Kickoff", icon: "🎯" },
  { id: "longsnap", label: "Long Snap", icon: "📏" },
];

function KickingAnalytics() {
  const { history, stats, athletes } = useFG();

  // Build trend data — make% per session
  const trendData = history.map((s) => {
    const kicks = (s.entries ?? []) as FGKick[];
    const makes = kicks.filter((k) => k.result.startsWith("Y")).length;
    return {
      label: s.label,
      "Make%": kicks.length > 0 ? Math.round((makes / kicks.length) * 100) : 0,
    };
  });

  // Build distance bar chart
  const distData = DIST_RANGES.map((dr) => {
    let made = 0, missed = 0;
    athletes.forEach((a) => {
      const s = stats[a];
      if (!s) return;
      made += s.distance[dr].made;
      missed += s.distance[dr].att - s.distance[dr].made;
    });
    return { range: dr, Made: made, Missed: missed };
  });

  // Per-athlete comparison
  const athleteRows = athletes.map((a) => {
    const s = stats[a];
    if (!s) return { athlete: a, att: 0, made: 0, score: 0, longFG: 0 };
    return {
      athlete: a,
      att: s.overall.att,
      made: s.overall.made,
      score: s.overall.score,
      longFG: s.overall.longFG,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart data={trendData} />
        <DistBarChart data={distData} />
      </div>

      {/* Comparison table */}
      <div className="card">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-4">
          Athlete Comparison
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Att</th>
                <th className="table-header">Made</th>
                <th className="table-header">Make%</th>
                <th className="table-header">Avg Score</th>
                <th className="table-header">Long FG</th>
              </tr>
            </thead>
            <tbody>
              {athleteRows.map((r) => (
                <tr key={r.athlete} className="hover:bg-surface-2 transition-colors">
                  <td className="table-name font-semibold">{r.athlete}</td>
                  <td className="table-cell">{r.att || "—"}</td>
                  <td className="table-cell">{r.made || "—"}</td>
                  <td className="table-cell make-pct">{makePct(r.att, r.made)}</td>
                  <td className="table-cell text-muted">
                    {r.att > 0 ? (r.score / r.att).toFixed(1) : "—"}
                  </td>
                  <td className="table-cell text-muted">
                    {r.longFG > 0 ? `${r.longFG} yd` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PlaceholderAnalytics({ sport }: { sport: string }) {
  return (
    <div className="card flex items-center justify-center h-48 text-muted text-sm">
      {sport} analytics — commit some sessions to see charts
    </div>
  );
}

function AnalyticsContent() {
  const [activeTab, setActiveTab] = useState<Tab>("kicking");

  return (
    <div className="lg:pl-56 min-h-screen pb-20 lg:pb-0">
      <Header title="Analytics" />

      <main className="p-4 lg:p-6 space-y-5 max-w-6xl">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Analytics</h1>
          <p className="text-sm text-muted mt-1">
            Performance trends across all sessions
          </p>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 bg-surface-2 p-1 rounded-input w-fit">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all",
                activeTab === tab.id
                  ? "bg-accent text-bg"
                  : "text-muted hover:text-slate-300"
              )}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {activeTab === "kicking" && <KickingAnalytics />}
        {activeTab === "punting" && <PlaceholderAnalytics sport="Punting" />}
        {activeTab === "kickoff" && <PlaceholderAnalytics sport="Kickoff" />}
        {activeTab === "longsnap" && <PlaceholderAnalytics sport="Long Snap" />}
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <FGProvider>
      <div className="flex">
        <Sidebar />
        <AnalyticsContent />
        <MobileNav />
      </div>
    </FGProvider>
  );
}
