"use client";

import { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { StatCard } from "@/components/ui/StatCard";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { LongSnapProvider } from "@/lib/longSnapContext";
import { makePct } from "@/lib/stats";
import Link from "next/link";
import React from "react";

const SPORT_CARDS: { href: string; icon?: string; iconEl?: React.ReactNode; label: string; disabled?: boolean }[] = [
  { href: "/kicking", iconEl: <GoalpostIcon size={36} />, label: "FG Kicking" },
  { href: "/punting", iconEl: <PuntFootIcon size={36} />, label: "Punting" },
  { href: "/kickoff", iconEl: <KickoffTeeIcon size={36} />, label: "Kickoff" },
  { href: "/longsnap", icon: "📏", label: "Snapping" },
];

function SeasonHighlights() {
  const { athletes: fgAthletes, stats: fgStats } = useFG();
  const { athletes: puntAthletes, stats: puntStats } = usePunt();
  const { athletes: koAthletes, stats: koStats } = useKickoff();

  // FG
  const fgTotals = fgAthletes.reduce(
    (acc, a) => {
      const s = fgStats[a.name];
      if (!s) return acc;
      return { att: acc.att + s.overall.att, made: acc.made + s.overall.made, longFG: Math.max(acc.longFG, s.overall.longFG) };
    },
    { att: 0, made: 0, longFG: 0 }
  );

  // Punt
  const puntTotals = puntAthletes.reduce(
    (acc, a) => {
      const s = puntStats[a.name];
      if (!s) return acc;
      return {
        totalYards: acc.totalYards + s.overall.totalYards,
        yardsAtt: acc.yardsAtt + (s.overall.yardsAtt ?? s.overall.att),
        totalHang: acc.totalHang + s.overall.totalHang,
        hangAtt: acc.hangAtt + (s.overall.hangAtt ?? s.overall.att),
      };
    },
    { totalYards: 0, yardsAtt: 0, totalHang: 0, hangAtt: 0 }
  );
  const puntAvg = puntTotals.yardsAtt > 0 ? (puntTotals.totalYards / puntTotals.yardsAtt).toFixed(1) : "—";
  const puntHang = puntTotals.hangAtt > 0 ? `${(puntTotals.totalHang / puntTotals.hangAtt).toFixed(2)}s` : "—";

  // KO
  const koTotals = koAthletes.reduce(
    (acc, a) => {
      const s = koStats[a.name];
      if (!s) return acc;
      return {
        totalDist: acc.totalDist + s.overall.totalDist,
        distAtt: acc.distAtt + (s.overall.distAtt ?? s.overall.att),
        totalHang: acc.totalHang + s.overall.totalHang,
        hangAtt: acc.hangAtt + (s.overall.hangAtt ?? s.overall.att),
      };
    },
    { totalDist: 0, distAtt: 0, totalHang: 0, hangAtt: 0 }
  );
  const koAvgDist = koTotals.distAtt > 0 ? (koTotals.totalDist / koTotals.distAtt).toFixed(1) : "—";
  const koHang = koTotals.hangAtt > 0 ? `${(koTotals.totalHang / koTotals.hangAtt).toFixed(2)}s` : "—";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <StatCard label="FG %" value={makePct(fgTotals.att, fgTotals.made)} accent />
      <StatCard label="Long FG" value={fgTotals.longFG > 0 ? `${fgTotals.longFG} yd` : "—"} />
      <StatCard label="Punt Avg" value={puntAvg !== "—" ? `${puntAvg} yd` : "—"} />
      <StatCard label="Punt Hang" value={puntHang} />
      <StatCard label="KO Avg Dist" value={koAvgDist !== "—" ? `${koAvgDist} yd` : "—"} />
      <StatCard label="KO Hang" value={koHang} />
    </div>
  );
}

const SPORT_LABELS: Record<string, { label: string; iconEl: React.ReactNode; basePath: string }> = {
  KICKING: { label: "FG", iconEl: <GoalpostIcon size={20} />, basePath: "/kicking/history" },
  PUNTING: { label: "Punt", iconEl: <PuntFootIcon size={20} />, basePath: "/punting/history" },
  KICKOFF: { label: "KO", iconEl: <KickoffTeeIcon size={20} />, basePath: "/kickoff/history" },
  LONGSNAP: { label: "Snap", iconEl: <span className="text-lg leading-none">📏</span>, basePath: "/longsnap/history" },
};

function DashboardContent() {
  const fg = useFG();
  const punt = usePunt();
  const kickoff = useKickoff();

  const [schoolName, setSchoolName] = useState("Special Teams");
  const [dashTitle, setDashTitle] = useState("Special Teams Dashboard");
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("st_team_v1");
      if (raw) {
        const t = JSON.parse(raw);
        if (t.school) setSchoolName(t.school);
        else if (t.name) setSchoolName(t.name);
        if (t.dashTitle) setDashTitle(t.dashTitle);
      }
    } catch {}
    // Load from teams table (source of truth)
    import("@/lib/teamData").then(({ getTeamId }) => {
      import("@/lib/teamSettingsStore").then(({ getTeamSettings }) => {
        (async () => {
          let tid = getTeamId();
          for (let i = 0; i < 15 && !tid; i++) {
            await new Promise((r) => setTimeout(r, 100));
            tid = getTeamId();
          }
          if (!tid || tid === "local-dev") return;
          const settings = await getTeamSettings(tid);
          if (settings) {
            setSchoolName(settings.school || settings.name);
            setDashTitle(settings.dashTitle);
          }
        })();
      });
    });
  }, []);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const saveDashTitle = async (val: string) => {
    const title = val.trim() || "Special Teams Dashboard";
    setDashTitle(title);
    setEditingTitle(false);
    try {
      const raw = localStorage.getItem("st_team_v1");
      const team = raw ? JSON.parse(raw) : {};
      team.dashTitle = title;
      localStorage.setItem("st_team_v1", JSON.stringify(team));
      // Save to teams table
      const { getTeamId } = await import("@/lib/teamData");
      const { updateTeamSettings, stampTeamSettingsWrite } = await import("@/lib/teamSettingsStore");
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        stampTeamSettingsWrite();
        updateTeamSettings(tid, { dashTitle: title });
      }
    } catch {}
  };

  // Merge all histories, tag with sport, sort by date descending
  const isChartingSession = (s: { label?: string }) =>
    s.label?.startsWith("Line Golf") || s.label?.startsWith("30 Point Game") || s.label?.startsWith("Balls & Strikes");

  const allSessions = [
    ...fg.history.map((s) => ({ ...s, sport: "KICKING" as const })),
    ...punt.history.map((s) => ({ ...s, sport: "PUNTING" as const })),
    ...kickoff.history.map((s) => ({ ...s, sport: "KICKOFF" as const })),
  ].filter((s) => !isChartingSession(s)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title={schoolName} />

      <main className="p-4 lg:p-6 space-y-6 max-w-6xl">
        {/* Welcome — double-click to edit */}
        <div>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="text-2xl font-extrabold text-slate-100 bg-transparent border-b-2 border-accent outline-none w-full"
              defaultValue={dashTitle}
              onBlur={(e) => saveDashTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveDashTitle((e.target as HTMLInputElement).value);
                if (e.key === "Escape") setEditingTitle(false);
              }}
            />
          ) : (
            <h1
              className="text-2xl font-extrabold text-slate-100 cursor-pointer"
              onDoubleClick={() => setEditingTitle(true)}
              title="Double-click to edit"
            >
              {dashTitle}
            </h1>
          )}
        </div>

        {/* Sport cards — icon only */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Sport Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SPORT_CARDS.map((card) =>
              card.disabled ? (
                <div
                  key={card.label}
                  className="card opacity-40 cursor-not-allowed flex flex-col items-center text-center py-6 relative"
                >
                  <div className="text-4xl mb-2">{card.iconEl ?? card.icon}</div>
                  <h3 className="text-xs font-bold text-slate-100 line-through">{card.label}</h3>
                  <span className="absolute top-2 right-2 text-[8px] font-bold text-warn uppercase">Under Construction</span>
                </div>
              ) : (
                <Link
                  key={card.href}
                  href={card.href}
                  className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
                >
                  <div className="text-4xl mb-2">{card.iconEl ?? card.icon}</div>
                  <h3 className="text-xs font-bold text-slate-100 group-hover:text-accent transition-colors">
                    {card.label}
                  </h3>
                </Link>
              )
            )}
          </div>
        </div>

        {/* Season Highlights */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Season Highlights
          </h2>
          <SeasonHighlights />
        </div>

        {/* Recent sessions — all phases merged */}
        {allSessions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
              Recent Sessions
            </h2>
            <div className="card-2 divide-y divide-border/50">
              {allSessions.slice(0, 8).map((session) => {
                const sportInfo = SPORT_LABELS[session.sport] ?? { label: session.sport, iconEl: <span>📋</span>, basePath: "#" };
                const isGame = session.mode === "game";
                const href = `${sportInfo.basePath}?session=${session.id}`;

                // Sport-specific recap
                let recap = "";
                let badge: React.ReactNode = null;
                if (session.sport === "KICKING") {
                  const kicks = ((session.entries ?? []) as unknown as { result: string; isPAT?: boolean }[]).filter(k => !k.isPAT);
                  const makes = kicks.filter((k) => k.result?.startsWith("Y")).length;
                  const att = kicks.length;
                  recap = `${makes}/${att} FG · ${makePct(att, makes)}`;
                  badge = (
                    <span className={makes / Math.max(att, 1) >= 0.7 ? "badge-make" : "badge-warn"}>
                      {makePct(att, makes)}
                    </span>
                  );
                } else if (session.sport === "PUNTING") {
                  const punts = (session.entries ?? []) as unknown as { yards: number; hangTime: number }[];
                  const att = punts.length;
                  const ydsEntries = punts.filter((p) => p.yards > 0);
                  const avgDist = ydsEntries.length > 0 ? (ydsEntries.reduce((s, p) => s + p.yards, 0) / ydsEntries.length).toFixed(1) : "—";
                  const htEntries = punts.filter((p) => p.hangTime > 0);
                  const avgHang = htEntries.length > 0 ? (htEntries.reduce((s, p) => s + p.hangTime, 0) / htEntries.length).toFixed(2) : "—";
                  recap = `${att} punt${att !== 1 ? "s" : ""} · ${avgDist} avg · ${avgHang}s hang`;
                } else if (session.sport === "KICKOFF") {
                  const kicks = (session.entries ?? []) as unknown as { distance: number; hangTime: number }[];
                  const att = kicks.length;
                  const distEntries = kicks.filter((k) => k.distance > 0);
                  const avgDist = distEntries.length > 0 ? (distEntries.reduce((s, k) => s + k.distance, 0) / distEntries.length).toFixed(1) : "—";
                  const htEntries = kicks.filter((k) => k.hangTime > 0);
                  const avgHang = htEntries.length > 0 ? (htEntries.reduce((s, k) => s + k.hangTime, 0) / htEntries.length).toFixed(2) : "—";
                  recap = `${att} KO${att !== 1 ? "s" : ""} · ${avgDist} avg · ${avgHang}s hang`;
                }

                return (
                  <Link
                    key={session.id}
                    href={href}
                    className="flex items-center justify-between py-3 px-1.5 first:pt-0 last:pb-0 hover:bg-surface/30 transition-colors rounded"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {sportInfo.iconEl}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-slate-200 truncate">{session.label}</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border text-muted font-semibold shrink-0">
                            {sportInfo.label}
                          </span>
                          {isGame && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 font-bold shrink-0">
                              GAME
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">{recap}</p>
                      </div>
                    </div>
                    {badge}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {/* Quick links — Analytics, Archives, Athletes, Settings */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/analytics" className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">📊</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent transition-colors">Analytics</span>
            </Link>
            <Link href="/archives" className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">🗄</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent transition-colors">Archived Stats</span>
            </Link>
            <Link href="/athletes" className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">👥</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent transition-colors">Athletes</span>
            </Link>
            <Link href="/settings" className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">⚙️</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent transition-colors">Settings</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <FGProvider>
      <PuntProvider>
        <KickoffProvider>
          <LongSnapProvider>
            <div className="flex overflow-x-hidden max-w-[100vw]">
              <Sidebar />
              <DashboardContent />
              <MobileNav />
            </div>
          </LongSnapProvider>
        </KickoffProvider>
      </PuntProvider>
    </FGProvider>
  );
}
