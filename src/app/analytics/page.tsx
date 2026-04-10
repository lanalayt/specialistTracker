"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { TrendChart, DistBarChart, LineTrendChart } from "@/components/ui/Chart";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { LongSnapProvider } from "@/lib/longSnapContext";
import { makePct } from "@/lib/stats";
import type { FGKick, PuntEntry } from "@/types";
import { DIST_RANGES } from "@/types";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import clsx from "clsx";
import React from "react";

type Tab = "kicking" | "punting" | "kickoff" | "longsnap";

const TABS: { id: Tab; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { id: "kicking", label: "FG Kicking", iconEl: <GoalpostIcon size={18} /> },
  { id: "punting", label: "Punting", iconEl: <PuntFootIcon size={18} /> },
  { id: "kickoff", label: "Kickoff", iconEl: <KickoffTeeIcon size={18} /> },
  { id: "longsnap", label: "Long Snap", icon: "📏" },
];

function KickingAnalytics({ selectedAthlete }: { selectedAthlete: string }) {
  const { history, stats, athletes } = useFG();
  const filteredAthletes = selectedAthlete ? [selectedAthlete] : athletes;
  const filteredHistory = selectedAthlete
    ? history.map((s) => ({ ...s, entries: ((s.entries ?? []) as FGKick[]).filter((k) => k.athlete === selectedAthlete) })).filter((s) => (s.entries as FGKick[]).length > 0)
    : history;

  // Build trend data — make% per session
  const trendData = filteredHistory.map((s) => {
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
    filteredAthletes.forEach((a) => {
      const s = stats[a];
      if (!s) return;
      made += s.distance[dr].made;
      missed += s.distance[dr].att - s.distance[dr].made;
    });
    return { range: dr, Made: made, Missed: missed };
  });

  // Per-athlete comparison
  const athleteRows = filteredAthletes.map((a) => {
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
                <th className="table-header">Made</th>
                <th className="table-header">Att</th>
                <th className="table-header">Make%</th>
                <th className="table-header">Avg Score</th>
                <th className="table-header">Long FG</th>
              </tr>
            </thead>
            <tbody>
              {athleteRows.map((r) => (
                <tr key={r.athlete} className="hover:bg-surface-2 transition-colors">
                  <td className="table-name font-semibold">{r.athlete}</td>
                  <td className="table-cell">{r.made || "—"}</td>
                  <td className="table-cell">{r.att || "—"}</td>
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

function PuntingAnalytics({ selectedAthlete }: { selectedAthlete: string }) {
  const { history, stats, athletes } = usePunt();
  const filteredAthletes = selectedAthlete ? [selectedAthlete] : athletes;
  const filteredHistory = selectedAthlete
    ? history.map((s) => ({ ...s, entries: ((s.entries ?? []) as PuntEntry[]).filter((p) => p.athlete === selectedAthlete) })).filter((s) => (s.entries as PuntEntry[]).length > 0)
    : history;

  if (filteredHistory.length === 0) {
    return (
      <div className="card flex items-center justify-center h-48 text-muted text-sm">
        Punting analytics — commit some sessions to see charts
      </div>
    );
  }

  // Avg distance per session trend (only count punts with yards > 0)
  const distTrend = filteredHistory.map((s) => {
    const punts = ((s.entries ?? []) as PuntEntry[]).filter((p) => p.yards > 0);
    const totalYds = punts.reduce((sum, p) => sum + p.yards, 0);
    return {
      label: s.label,
      "Avg Dist": punts.length > 0 ? Math.round((totalYds / punts.length) * 10) / 10 : 0,
    };
  });

  // Avg hang time per session trend (only count punts with hangTime > 0)
  const htTrend = filteredHistory.map((s) => {
    const punts = ((s.entries ?? []) as PuntEntry[]).filter((p) => p.hangTime > 0);
    const totalHT = punts.reduce((sum, p) => sum + p.hangTime, 0);
    return {
      label: s.label,
      "Avg HT": punts.length > 0 ? Math.round((totalHT / punts.length) * 100) / 100 : 0,
    };
  });

  // Directional accuracy % per session (only count punts with DA defined)
  const daTrend = filteredHistory.map((s) => {
    const punts = ((s.entries ?? []) as PuntEntry[]).filter((p) => p.directionalAccuracy != null);
    const totalDA = punts.reduce((sum, p) => sum + p.directionalAccuracy, 0);
    return {
      label: s.label,
      "DA%": punts.length > 0 ? Math.round((totalDA / punts.length) * 100) : 0,
    };
  });

  // Op time trend (only count punts with opTime > 0)
  const otTrend = filteredHistory.map((s) => {
    const punts = ((s.entries ?? []) as PuntEntry[]).filter((p) => p.opTime > 0);
    const totalOT = punts.reduce((sum, p) => sum + p.opTime, 0);
    return {
      label: s.label,
      "Avg OT": punts.length > 0 ? Math.round((totalOT / punts.length) * 100) / 100 : 0,
    };
  });


  // Per-athlete comparison
  const athleteRows = filteredAthletes.map((a) => {
    const s = stats[a];
    if (!s) return { athlete: a, att: 0, avgDist: "—", avgHT: "—", avgOT: "—", da: "—", long: 0, critDir: 0 };
    const o = s.overall;
    return {
      athlete: a,
      att: o.att,
      avgDist: (o.yardsAtt ?? o.att) > 0 ? (o.totalYards / (o.yardsAtt ?? o.att)).toFixed(1) : "—",
      avgHT: (o.hangAtt ?? o.att) > 0 ? (o.totalHang / (o.hangAtt ?? o.att)).toFixed(2) : "—",
      avgOT: (o.opTimeAtt ?? o.att) > 0 ? (o.totalOpTime / (o.opTimeAtt ?? o.att)).toFixed(2) : "—",
      da: (o.daAtt ?? o.att) > 0 ? `${Math.round((o.totalDirectionalAccuracy / (o.daAtt ?? o.att)) * 100)}%` : "—",
      long: o.long,
      critDir: o.criticalDirections,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineTrendChart
          data={distTrend}
          dataKey="Avg Dist"
          title="Avg Distance Over Sessions"
          unit=" yd"
        />
        <LineTrendChart
          data={htTrend}
          dataKey="Avg HT"
          title="Avg Hang Time Over Sessions"
          unit="s"
          domain={[
            Math.min(4, ...htTrend.map((d) => d["Avg HT"] as number).filter(Boolean)) - 0.1,
            Math.max(5, ...htTrend.map((d) => d["Avg HT"] as number).filter(Boolean)) + 0.1,
          ]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineTrendChart
          data={daTrend}
          dataKey="DA%"
          title="Directional Accuracy Over Sessions"
          unit="%"
          domain={[0, 100]}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineTrendChart
          data={otTrend}
          dataKey="Avg OT"
          title="Avg Operation Time Over Sessions"
          unit="s"
          domain={[
            Math.min(1.2, ...otTrend.map((d) => d["Avg OT"] as number).filter(Boolean)) - 0.05,
            Math.max(1.5, ...otTrend.map((d) => d["Avg OT"] as number).filter(Boolean)) + 0.05,
          ]}
        />
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
                <th className="table-header">Avg Dist</th>
                <th className="table-header">Avg HT</th>
                <th className="table-header">Avg OT</th>
                <th className="table-header">DA%</th>
                <th className="table-header">Long</th>
                <th className="table-header">Crit Dir</th>
              </tr>
            </thead>
            <tbody>
              {athleteRows.map((r) => (
                <tr key={r.athlete} className="hover:bg-surface-2 transition-colors">
                  <td className="table-name font-semibold">{r.athlete}</td>
                  <td className="table-cell">{r.att || "—"}</td>
                  <td className="table-cell">{r.avgDist}</td>
                  <td className="table-cell">{r.avgHT}</td>
                  <td className="table-cell">{r.avgOT}</td>
                  <td className="table-cell">{r.da}</td>
                  <td className="table-cell text-muted">
                    {r.long > 0 ? `${r.long} yd` : "—"}
                  </td>
                  <td className={clsx("table-cell", r.critDir > 0 ? "text-miss" : "text-muted")}>
                    {r.critDir || "—"}
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
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const fg = useFG();
  const punt = usePunt();
  const ko = useKickoff();

  // Get athletes for the active tab
  const currentAthletes = activeTab === "kicking" ? fg.athletes
    : activeTab === "punting" ? punt.athletes
    : activeTab === "kickoff" ? ko.athletes
    : [];

  // Reset athlete selection when switching tabs
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSelectedAthlete("");
  };

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
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
              onClick={() => handleTabChange(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all",
                activeTab === tab.id
                  ? "bg-accent text-bg"
                  : "text-muted hover:text-white"
              )}
            >
              {tab.iconEl ?? <span>{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Athlete filter */}
        {currentAthletes.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedAthlete("")}
              className={clsx(
                "px-3 py-1.5 rounded-input text-xs font-semibold transition-all border",
                !selectedAthlete
                  ? "bg-accent text-slate-900 border-accent"
                  : "border-border text-muted hover:text-white hover:bg-surface-2"
              )}
            >
              All
            </button>
            {currentAthletes.map((a) => (
              <button
                key={a}
                onClick={() => setSelectedAthlete(a)}
                className={clsx(
                  "px-3 py-1.5 rounded-input text-xs font-semibold transition-all border",
                  selectedAthlete === a
                    ? "bg-accent text-slate-900 border-accent"
                    : "border-border text-muted hover:text-white hover:bg-surface-2"
                )}
              >
                {a}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {activeTab === "kicking" && <KickingAnalytics selectedAthlete={selectedAthlete} />}
        {activeTab === "punting" && <PuntingAnalytics selectedAthlete={selectedAthlete} />}
        {activeTab === "kickoff" && <PlaceholderAnalytics sport="Kickoff" />}
        {activeTab === "longsnap" && <PlaceholderAnalytics sport="Long Snap" />}
      </main>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <FGProvider>
      <PuntProvider>
        <KickoffProvider>
          <LongSnapProvider>
            <div className="flex overflow-x-hidden max-w-[100vw]">
              <Sidebar />
              <AnalyticsContent />
              <MobileNav />
            </div>
          </LongSnapProvider>
        </KickoffProvider>
      </PuntProvider>
    </FGProvider>
  );
}
