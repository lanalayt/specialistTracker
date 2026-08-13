"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { TrendChart, DistBarChart, LineTrendChart, PositionMakeChart } from "@/components/ui/Chart";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { LongSnapProvider, useLongSnap } from "@/lib/longSnapContext";
import { getCachedSettings } from "@/lib/settingsSync";
import { makePct } from "@/lib/stats";
import type { FGKick, PuntEntry, LongSnapEntry } from "@/types";
import { DIST_RANGES } from "@/types";
import { KickerIcon, PuntFootIcon, KickoffTeeIcon, SnapperIcon } from "@/components/ui/SportIcons";
import clsx from "clsx";
import React from "react";

type Tab = "kicking" | "punting" | "kickoff" | "longsnap";

const TABS: { id: Tab; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { id: "kicking", label: "FG Kicking", iconEl: <KickerIcon size={18} /> },
  { id: "punting", label: "Punting", iconEl: <PuntFootIcon size={18} /> },
  { id: "kickoff", label: "Kickoff", iconEl: <KickoffTeeIcon size={18} /> },
  { id: "longsnap", label: "Snap", iconEl: <SnapperIcon size={18} /> },
];

// 0–3 snap score: strike +1, laces Good +1 (any 1/4 turn +0.5), spiral Good +1.
function snapScore(e: LongSnapEntry): number {
  let sc = 0;
  if (e.accuracy === "ON_TARGET") sc += 1;
  if (e.laces === "Good") sc += 1;
  else if (e.laces && e.laces.startsWith("1/4")) sc += 0.5;
  if (e.spiral === "Good") sc += 1;
  return sc;
}

function SnapAnalytics({ selectedAthlete, modeFilter, snapKind }: { selectedAthlete: string; modeFilter: "all" | "practice" | "game"; snapKind: "short" | "long" }) {
  const { history, athletes } = useLongSnap();
  const filteredAthletes = selectedAthlete ? [selectedAthlete] : athletes.map((a) => a.name);
  const modeHistory = modeFilter === "all" ? history : history.filter((s) => (modeFilter === "game" ? s.mode === "game" : s.mode !== "game"));
  const isKind = (e: LongSnapEntry) => (snapKind === "short" ? e.snapType === "FG" || e.snapType === "PAT" : e.snapType === "PUNT");
  const sessions = modeHistory
    .map((s) => ({ ...s, entries: ((s.entries ?? []) as LongSnapEntry[]).filter((e) => isKind(e) && (!selectedAthlete || e.athlete === selectedAthlete)) }))
    .filter((s) => (s.entries as LongSnapEntry[]).length > 0);

  if (sessions.length === 0) {
    return <div className="card flex items-center justify-center h-48 text-muted text-sm">No {snapKind} snap sessions yet — commit some to see charts</div>;
  }

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const strikeTrend = sessions.map((s) => {
    const es = s.entries as LongSnapEntry[];
    return { label: s.label, "Strike%": pct(es.filter((e) => e.accuracy === "ON_TARGET").length, es.length) };
  });
  const spiralTrend = sessions.map((s) => {
    const es = (s.entries as LongSnapEntry[]).filter((e) => e.spiral);
    return { label: s.label, "Spiral%": pct(es.filter((e) => e.spiral === "Good").length, es.length) };
  });
  const scoreTrend = sessions.map((s) => {
    const es = s.entries as LongSnapEntry[];
    return { label: s.label, "Score": es.length > 0 ? Math.round((es.reduce((sum, e) => sum + snapScore(e), 0) / es.length) * 100) / 100 : 0 };
  });
  const lacesTrend = sessions.map((s) => {
    const es = (s.entries as LongSnapEntry[]).filter((e) => e.laces);
    return { label: s.label, "Laces%": pct(es.filter((e) => e.laces === "Good").length, es.length) };
  });
  const timeTrend = sessions.map((s) => {
    const es = (s.entries as LongSnapEntry[]).filter((e) => e.time > 0);
    return { label: s.label, "Avg Time": es.length > 0 ? Math.round((es.reduce((sum, e) => sum + e.time, 0) / es.length) * 100) / 100 : 0 };
  });
  const timeVals = timeTrend.map((d) => d["Avg Time"] as number).filter((v) => v > 0);
  const timeDomain: [number, number] | undefined = timeVals.length > 0 ? [Math.max(0, Math.round((Math.min(...timeVals) - 0.1) * 100) / 100), Math.round((Math.max(...timeVals) + 0.1) * 100) / 100] : undefined;

  const allEntries = sessions.flatMap((s) => s.entries as LongSnapEntry[]);
  const rows = filteredAthletes.map((a) => {
    const ae = allEntries.filter((e) => e.athlete === a);
    const withLaces = ae.filter((e) => e.laces);
    const withSpiral = ae.filter((e) => e.spiral);
    const withTime = ae.filter((e) => e.time > 0);
    return {
      athlete: a,
      att: ae.length,
      strike: ae.length > 0 ? `${pct(ae.filter((e) => e.accuracy === "ON_TARGET").length, ae.length)}%` : "—",
      score: ae.length > 0 ? (ae.reduce((s, e) => s + snapScore(e), 0) / ae.length).toFixed(2) : "—",
      laces: withLaces.length > 0 ? `${pct(withLaces.filter((e) => e.laces === "Good").length, withLaces.length)}%` : "—",
      spiral: withSpiral.length > 0 ? `${pct(withSpiral.filter((e) => e.spiral === "Good").length, withSpiral.length)}%` : "—",
      time: withTime.length > 0 ? `${(withTime.reduce((s, e) => s + e.time, 0) / withTime.length).toFixed(2)}s` : "—",
    };
  }).filter((r) => r.att > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineTrendChart data={strikeTrend} dataKey="Strike%" title="Strike % Over Sessions" unit="%" domain={[0, 100]} />
        {snapKind === "short" ? (
          <LineTrendChart data={scoreTrend} dataKey="Score" title="Avg Score Over Sessions" unit="/3" domain={[0, 3]} />
        ) : (
          <LineTrendChart data={timeTrend} dataKey="Avg Time" title="Avg Snap Time Over Sessions" unit="s" domain={timeDomain} />
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {snapKind === "short" && <LineTrendChart data={lacesTrend} dataKey="Laces%" title="Laces % Over Sessions" unit="%" domain={[0, 100]} />}
        <LineTrendChart data={spiralTrend} dataKey="Spiral%" title="Spiral % Over Sessions" unit="%" domain={[0, 100]} />
      </div>

      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Athlete</th>
                <th className="table-header">Snaps</th>
                <th className="table-header">Strike %</th>
                {snapKind === "short" ? <th className="table-header">Avg Score</th> : <th className="table-header">Avg Time</th>}
                {snapKind === "short" && <th className="table-header">Laces %</th>}
                <th className="table-header">Spiral %</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.athlete} className="hover:bg-surface/30">
                  <td className="table-name">{r.athlete}</td>
                  <td className="table-cell text-center text-muted">{r.att}</td>
                  <td className="table-cell text-center text-accent font-semibold">{r.strike}</td>
                  {snapKind === "short" ? <td className="table-cell text-center text-sky-400 font-semibold">{r.score}/3</td> : <td className="table-cell text-center text-slate-200">{r.time}</td>}
                  {snapKind === "short" && <td className="table-cell text-center text-slate-200">{r.laces}</td>}
                  <td className="table-cell text-center text-slate-200">{r.spiral}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function KickingAnalytics({ selectedAthlete, modeFilter }: { selectedAthlete: string; modeFilter: "all" | "practice" | "game" }) {
  const { history, stats, athletes } = useFG();
  const filteredAthletes = selectedAthlete ? [selectedAthlete] : athletes.map(a => a.name);
  const modeHistory = modeFilter === "all" ? history : history.filter((s) => modeFilter === "game" ? s.mode === "game" : s.mode !== "game");
  const filteredHistory = selectedAthlete
    ? modeHistory.map((s) => ({ ...s, entries: ((s.entries ?? []) as FGKick[]).filter((k) => k.athlete === selectedAthlete) })).filter((s) => (s.entries as FGKick[]).length > 0)
    : modeHistory;

  // Build trend data — make% per session
  const trendData = filteredHistory.map((s) => {
    const kicks = (s.entries ?? []) as FGKick[];
    const makes = kicks.filter((k) => k.result.startsWith("Y")).length;
    return {
      label: s.label,
      "Make%": kicks.length > 0 ? Math.round((makes / kicks.length) * 100) : 0,
    };
  });

  // Build distance bar chart from filtered history
  const allFilteredKicks = filteredHistory.flatMap((s) => (s.entries ?? []) as FGKick[]);
  const distData = DIST_RANGES.map((dr) => {
    const [lo, hi] = dr.split("-").map(Number);
    const inRange = allFilteredKicks.filter((k) => !k.isPAT && k.dist >= lo && k.dist <= (hi || 999));
    return { range: dr, Made: inRange.filter((k) => k.result.startsWith("Y")).length, Missed: inRange.filter((k) => !k.result.startsWith("Y")).length };
  });

  // Make% by distance range
  const DIST_BUCKETS = [
    { label: "PAT", filter: (k: FGKick) => !!k.isPAT },
    { label: "20-29", filter: (k: FGKick) => !k.isPAT && k.dist >= 20 && k.dist <= 29 },
    { label: "30-39", filter: (k: FGKick) => !k.isPAT && k.dist >= 30 && k.dist <= 39 },
    { label: "40-49", filter: (k: FGKick) => !k.isPAT && k.dist >= 40 && k.dist <= 49 },
    { label: "50-59", filter: (k: FGKick) => !k.isPAT && k.dist >= 50 && k.dist <= 59 },
    { label: "60+", filter: (k: FGKick) => !k.isPAT && k.dist >= 60 },
  ];
  const distMakeData = DIST_BUCKETS.map(({ label, filter }) => {
    const kicks = allFilteredKicks.filter(filter);
    const made = kicks.filter((k) => k.result.startsWith("Y")).length;
    return { pos: label, pct: kicks.length > 0 ? Math.round((made / kicks.length) * 100) : null, att: kicks.length };
  });

  // Make% by field position
  const FG_POSITIONS = ["LH", "LM", "M", "RM", "RH"];
  const posData = FG_POSITIONS.map((pos) => {
    const kicks = allFilteredKicks.filter((k) => !k.isPAT && k.pos === pos);
    const made = kicks.filter((k) => k.result.startsWith("Y")).length;
    return { pos, pct: kicks.length > 0 ? Math.round((made / kicks.length) * 100) : null, att: kicks.length };
  });

  // Per-athlete comparison (from filtered history so mode filter works)
  const athleteRows = filteredAthletes.map((a) => {
    const ak = allFilteredKicks.filter((k) => k.athlete === a && !k.isPAT);
    return {
      athlete: a,
      att: ak.length,
      made: ak.filter((k) => k.result.startsWith("Y")).length,
      score: ak.reduce((s, k) => s + (k.score || 0), 0),
      longFG: ak.length > 0 ? Math.max(...ak.filter((k) => k.result.startsWith("Y")).map((k) => k.dist), 0) : 0,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart data={trendData} />
        <DistBarChart data={distData} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PositionMakeChart data={distMakeData} title="Make % by Distance" />
        <PositionMakeChart data={posData} />
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

function PuntingAnalytics({ selectedAthlete, modeFilter }: { selectedAthlete: string; modeFilter: "all" | "practice" | "game" }) {
  const { history, stats, athletes } = usePunt();
  const filteredAthletes = selectedAthlete ? [selectedAthlete] : athletes.map(a => a.name);
  const modeHistory = modeFilter === "all" ? history : history.filter((s) => modeFilter === "game" ? s.mode === "game" : s.mode !== "game");
  const filteredHistory = selectedAthlete
    ? modeHistory.map((s) => ({ ...s, entries: ((s.entries ?? []) as PuntEntry[]).filter((p) => p.athlete === selectedAthlete) })).filter((s) => (s.entries as PuntEntry[]).length > 0)
    : modeHistory;

  if (filteredHistory.length === 0) {
    return (
      <div className="card flex items-center justify-center h-48 text-muted text-sm">
        Punting analytics — commit some sessions to see charts
      </div>
    );
  }

  // Distance average is DIRECTIONAL punts only (except in game mode, which is
  // all-inclusive). Read the team's punt types to know each type's category;
  // fall back to name inference for the built-in types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puntTypeCfgs = ((getCachedSettings<any>("puntSettings")?.puntTypes ?? []) as { id: string; category?: string }[]);
  const isDirectionalPunt = (type?: string) => {
    const cfg = puntTypeCfgs.find((t) => t.id === type);
    if (cfg?.category) return cfg.category === "DIRECTIONAL";
    const up = (type || "").toUpperCase();
    return up.startsWith("DIR_") || (!up.includes("POOCH") && !up.includes("RUGBY") && !up.includes("BANANA"));
  };
  const distDirectionalOnly = modeFilter !== "game";

  // Avg distance per session trend (only count punts with yards > 0)
  const distTrend = filteredHistory.map((s) => {
    let punts = ((s.entries ?? []) as PuntEntry[]).filter((p) => p.yards > 0);
    if (distDirectionalOnly) punts = punts.filter((p) => isDirectionalPunt(p.type));
    const totalYds = punts.reduce((sum, p) => sum + p.yards, 0);
    return {
      label: s.label,
      "Avg Dist": punts.length > 0 ? Math.round((totalYds / punts.length) * 10) / 10 : 0,
    };
  });
  // Y-axis hugs the data: 10 yd below the lowest session to 10 yd above the
  // highest (lower bound never negative). Recomputes as the filter changes.
  const distVals = distTrend.map((d) => d["Avg Dist"] as number).filter((v) => v > 0);
  const distDomain: [number, number] | undefined = distVals.length > 0
    ? [Math.max(0, Math.floor(Math.min(...distVals)) - 10), Math.ceil(Math.max(...distVals)) + 10]
    : undefined;

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
    const punts = ((s.entries ?? []) as PuntEntry[]).filter((p) => typeof p.directionalAccuracy === "number");
    const totalDA = punts.reduce((sum, p) => sum + (typeof p.directionalAccuracy === "number" ? p.directionalAccuracy : 0), 0);
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
  // Y-axis hugs the data: 0.1s below the lowest session to 0.1s above the
  // highest (lower bound never negative). Recomputes as the filter changes.
  const otVals = otTrend.map((d) => d["Avg OT"] as number).filter((v) => v > 0);
  const otDomain: [number, number] | undefined = otVals.length > 0
    ? [Math.max(0, Math.round((Math.min(...otVals) - 0.1) * 100) / 100), Math.round((Math.max(...otVals) + 0.1) * 100) / 100]
    : undefined;


  // Per-athlete comparison (computed from filtered history so mode filter works)
  const allFilteredPunts = filteredHistory.flatMap((s) => (s.entries ?? []) as PuntEntry[]);
  const athleteRows = filteredAthletes.map((a) => {
    const ap = allFilteredPunts.filter((p) => p.athlete === a);
    if (ap.length === 0) return { athlete: a, att: 0, avgDist: "—", avgHT: "—", avgOT: "—", da: "—", long: 0, critDir: 0 };
    const ydsE = ap.filter((p) => p.yards > 0);
    const htE = ap.filter((p) => p.hangTime > 0);
    const otE = ap.filter((p) => (p.opTime || 0) > 0);
    const daE = ap.filter((p) => typeof p.directionalAccuracy === "number");
    return {
      athlete: a,
      att: ap.length,
      avgDist: ydsE.length > 0 ? (ydsE.reduce((s, p) => s + p.yards, 0) / ydsE.length).toFixed(1) : "—",
      avgHT: htE.length > 0 ? (htE.reduce((s, p) => s + p.hangTime, 0) / htE.length).toFixed(2) : "—",
      avgOT: otE.length > 0 ? (otE.reduce((s, p) => s + (p.opTime || 0), 0) / otE.length).toFixed(2) : "—",
      da: daE.length > 0 ? `${Math.round((daE.reduce((s, p) => s + (typeof p.directionalAccuracy === "number" ? p.directionalAccuracy : 0), 0) / daE.length) * 100)}%` : "—",
      long: ydsE.length > 0 ? Math.max(...ydsE.map((p) => p.yards)) : 0,
      critDir: daE.filter((p) => p.directionalAccuracy === 0).length,
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineTrendChart
          data={distTrend}
          dataKey="Avg Dist"
          title={distDirectionalOnly ? "Avg Directional Distance Over Sessions" : "Avg Distance Over Sessions"}
          unit=" yd"
          domain={distDomain}
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
          domain={otDomain}
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
  const [modeFilter, setModeFilter] = useState<"all" | "practice" | "game">("all");
  const [selectedAthlete, setSelectedAthlete] = useState("");
  const [snapKind, setSnapKind] = useState<"short" | "long">("short");
  const fg = useFG();
  const punt = usePunt();
  const ko = useKickoff();
  const snap = useLongSnap();

  // Get athletes for the active tab
  const currentAthletes = activeTab === "kicking" ? fg.athletes
    : activeTab === "punting" ? punt.athletes
    : activeTab === "kickoff" ? ko.athletes
    : activeTab === "longsnap" ? snap.athletes
    : [];

  // Reset athlete selection when switching tabs
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSelectedAthlete("");
    setModeFilter("all");
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

        {/* Practice / Game filter */}
        <div className="flex gap-1 bg-surface-2 p-1 rounded-input w-fit">
          {(["all", "practice", "game"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setModeFilter(m)}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-semibold transition-all",
                modeFilter === m
                  ? m === "game" ? "bg-red-500 text-white" : "bg-accent text-bg"
                  : "text-muted hover:text-white"
              )}
            >
              {m === "all" ? "All" : m === "practice" ? "Practice" : "Game"}
            </button>
          ))}
        </div>

        {/* Snap sub-tabs (Short / Long) */}
        {activeTab === "longsnap" && (
          <div className="flex gap-1 bg-surface-2 p-1 rounded-input w-fit">
            {(["short", "long"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSnapKind(k)}
                className={clsx(
                  "px-3 py-1.5 rounded text-xs font-semibold transition-all",
                  snapKind === k ? "bg-accent text-bg" : "text-muted hover:text-white"
                )}
              >
                {k === "short" ? "Short Snap" : "Long Snap"}
              </button>
            ))}
          </div>
        )}

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
                key={a.name}
                onClick={() => setSelectedAthlete(a.name)}
                className={clsx(
                  "px-3 py-1.5 rounded-input text-xs font-semibold transition-all border",
                  selectedAthlete === a.name
                    ? "bg-accent text-slate-900 border-accent"
                    : "border-border text-muted hover:text-white hover:bg-surface-2"
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {activeTab === "kicking" && <KickingAnalytics selectedAthlete={selectedAthlete} modeFilter={modeFilter} />}
        {activeTab === "punting" && <PuntingAnalytics selectedAthlete={selectedAthlete} modeFilter={modeFilter} />}
        {activeTab === "kickoff" && <PlaceholderAnalytics sport="Kickoff" />}
        {activeTab === "longsnap" && <SnapAnalytics selectedAthlete={selectedAthlete} modeFilter={modeFilter} snapKind={snapKind} />}
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
