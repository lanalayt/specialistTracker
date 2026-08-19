"use client";

import { useState, useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { StatCard } from "@/components/ui/StatCard";
import { Stopwatch } from "@/components/ui/Stopwatch";
import { KickerIcon, PuntFootIcon, KickoffTeeIcon, SnapperIcon } from "@/components/ui/SportIcons";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { LongSnapProvider } from "@/lib/longSnapContext";
import { useTeamSettings } from "@/lib/teamSettingsStore";
import { makePct } from "@/lib/stats";
import { MAKE_RESULTS } from "@/types";
import type { FGKick, PuntEntry, KickoffEntry, Session } from "@/types";
import Link from "next/link";
import React from "react";

const SPORT_CARDS: { href: string; icon?: string; iconEl?: React.ReactNode; label: string; disabled?: boolean }[] = [
  { href: "/kicking", iconEl: <img src="/kicker-fg.png" alt="" className="h-11 w-auto" />, label: "FG Kicking" },
  { href: "/punting", iconEl: <PuntFootIcon size={44} />, label: "Punting" },
  { href: "/kickoff", iconEl: <KickoffTeeIcon size={44} />, label: "Kickoff" },
  { href: "/longsnap", iconEl: <SnapperIcon size={44} />, label: "Snapping" },
];

// Pooch punts are measured by yard line, not distance, so they don't feed the
// punt distance average. KO "directional" = deep kicks (not sky/squib/onside).
const isPoochPunt = (type?: string) => (type || "").toUpperCase().includes("POOCH");
const isDeepKO = (type?: string) => !/SKY|SQUIB|ONSIDE/i.test(type || "");

function highlightsFor(fgH: Session[], puntH: Session[], koH: Session[], koDeepOnly: boolean) {
  const fgKicks = fgH.flatMap((s) => (s.entries ?? []) as FGKick[]);
  const makes = fgKicks.filter((k) => MAKE_RESULTS.includes(k.result));
  const longFG = makes.reduce((m, k) => Math.max(m, k.dist), 0);

  const punts = puntH.flatMap((s) => (s.entries ?? []) as PuntEntry[]);
  const puntDistE = punts.filter((p) => p.yards > 0 && !isPoochPunt(p.type));
  const puntHangE = punts.filter((p) => p.hangTime > 0);

  let kos = koH.flatMap((s) => (s.entries ?? []) as KickoffEntry[]);
  if (koDeepOnly) kos = kos.filter((k) => isDeepKO(k.type));
  const koDistE = kos.filter((k) => k.distance > 0);
  const koHangE = kos.filter((k) => k.hangTime > 0);

  return {
    fgPct: makePct(fgKicks.length, makes.length),
    longFG: longFG > 0 ? `${longFG} yd` : "—",
    puntAvg: puntDistE.length > 0 ? `${(puntDistE.reduce((a, p) => a + p.yards, 0) / puntDistE.length).toFixed(1)} yd` : "—",
    puntHang: puntHangE.length > 0 ? `${(puntHangE.reduce((a, p) => a + p.hangTime, 0) / puntHangE.length).toFixed(2)}s` : "—",
    koAvgDist: koDistE.length > 0 ? `${(koDistE.reduce((a, k) => a + k.distance, 0) / koDistE.length).toFixed(1)} yd` : "—",
    koHang: koHangE.length > 0 ? `${(koHangE.reduce((a, k) => a + k.hangTime, 0) / koHangE.length).toFixed(2)}s` : "—",
  };
}

function HighlightCards({ h, accent }: { h: ReturnType<typeof highlightsFor>; accent?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      <StatCard label="FG %" value={h.fgPct} accent={accent} glow={accent} />
      <StatCard label="Long FG" value={h.longFG} accent={accent} glow={accent} />
      <StatCard label="Punt Avg" value={h.puntAvg} accent={accent} glow={accent} />
      <StatCard label="Punt Hang" value={h.puntHang} accent={accent} glow={accent} />
      <StatCard label="KO Avg Dist" value={h.koAvgDist} accent={accent} glow={accent} />
      <StatCard label="KO Hang" value={h.koHang} accent={accent} glow={accent} />
    </div>
  );
}

function Highlights() {
  const { history: fgH } = useFG();
  const { history: puntH } = usePunt();
  const { history: koH } = useKickoff();

  const isGame = (s: Session) => s.mode === "game";
  const gameFG = fgH.filter(isGame);
  const gamePunt = puntH.filter(isGame);
  const gameKO = koH.filter(isGame);
  const hasGame = gameFG.length + gamePunt.length + gameKO.length > 0;

  // Practice highlights: KO stats are directional (deep) only.
  const practice = highlightsFor(fgH.filter((s) => !isGame(s)), puntH.filter((s) => !isGame(s)), koH.filter((s) => !isGame(s)), true);
  // Season highlights: games only, all-inclusive. Shown above once games exist.
  const season = hasGame ? highlightsFor(gameFG, gamePunt, gameKO, false) : null;

  return (
    <div className="space-y-5">
      {season && (
        <div className="rounded-card border border-accent/40 bg-accent/[0.06] p-3 shadow-accent-lg">
          <h2 className="text-sm font-bold text-accent uppercase tracking-wider mb-3">
            Season Highlights <span className="text-[10px] font-semibold text-muted normal-case tracking-normal">· Games</span>
          </h2>
          <HighlightCards h={season} accent />
        </div>
      )}
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Practice Highlights</h2>
        <HighlightCards h={practice} />
      </div>
    </div>
  );
}

const SPORT_LABELS: Record<string, { label: string; iconEl: React.ReactNode; basePath: string }> = {
  KICKING: { label: "FG", iconEl: <KickerIcon size={20} />, basePath: "/kicking/history" },
  PUNTING: { label: "Punt", iconEl: <PuntFootIcon size={20} />, basePath: "/punting/history" },
  KICKOFF: { label: "KO", iconEl: <KickoffTeeIcon size={20} />, basePath: "/kickoff/history" },
  LONGSNAP: { label: "Snap", iconEl: <SnapperIcon size={20} />, basePath: "/longsnap/history" },
};

function DashboardContent() {
  const fg = useFG();
  const punt = usePunt();
  const kickoff = useKickoff();

  // Reactive team settings (seeded by the SSR bootstrap; kept fresh by
  // AppProviders + realtime) so school name / dashboard title are correct on the
  // first paint and update without navigating.
  const team = useTeamSettings();
  const schoolName = team?.school || team?.name || "Special Teams";
  const [dashTitle, setDashTitle] = useState(team?.dashTitle ?? "Special Teams Dashboard");
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Adopt the DB title whenever it arrives, until the user is editing it.
  useEffect(() => {
    if (!editingTitle && team?.dashTitle) setDashTitle(team.dashTitle);
  }, [team?.dashTitle]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const { getTeamId } = await import("@/lib/teamData");
      const { updateTeamSettings, stampTeamSettingsWrite, patchTeamSettingsCache } = await import("@/lib/teamSettingsStore");
      patchTeamSettingsCache({ dashTitle: title }); // instant + reactive
      const tid = getTeamId();
      if (tid && tid !== "local-dev") {
        stampTeamSettingsWrite();
        updateTeamSettings(tid, { dashTitle: title });
      }
    } catch {}
  };

  // Merge all histories, tag with sport, sort by date descending
  const isChartingSession = (s: { label?: string }) =>
    s.label?.startsWith("Line Golf") || s.label?.startsWith("Punt Battle") || s.label?.startsWith("30 Point Game") || s.label?.startsWith("Balls & Strikes");

  const allSessions = [
    ...fg.history.map((s) => ({ ...s, sport: "KICKING" as const })),
    ...punt.history.map((s) => ({ ...s, sport: "PUNTING" as const })),
    ...kickoff.history.map((s) => ({ ...s, sport: "KICKOFF" as const })),
  ].filter((s) => !isChartingSession(s)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title={schoolName} />
      {/* Floating stopwatch — sits top-right, just under the profile/menu icons */}
      <Stopwatch />

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

            {/* Highlights — practice always; season (games) above once games exist */}
            <Highlights />

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
