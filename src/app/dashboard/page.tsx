"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { StatCard } from "@/components/ui/StatCard";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { LongSnapProvider, useLongSnap } from "@/lib/longSnapContext";
import { makePct } from "@/lib/stats";
import Link from "next/link";

const SPORT_CARDS = [
  { href: "/kicking", icon: "🏈", label: "FG Kicking" },
  { href: "/punting", icon: "👟", label: "Punting" },
  { href: "/kickoff", icon: "🎯", label: "Kickoff" },
  { href: "/longsnap", icon: "📏", label: "Long Snapping" },
];

function FGHighlights() {
  const { athletes, stats } = useFG();
  const overall = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        made: acc.made + s.overall.made,
        longFG: Math.max(acc.longFG, s.overall.longFG),
      };
    },
    { att: 0, made: 0, longFG: 0 }
  );
  return (
    <>
      <StatCard label="FG Make%" value={makePct(overall.att, overall.made)} accent />
      <StatCard label="Long FG" value={overall.longFG > 0 ? `${overall.longFG} yd` : "—"} />
    </>
  );
}

function PuntHighlights() {
  const { athletes, stats } = usePunt();
  const overall = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        totalYards: acc.totalYards + s.overall.totalYards,
        yardsAtt: acc.yardsAtt + (s.overall.yardsAtt ?? s.overall.att),
        totalDA: acc.totalDA + s.overall.totalDirectionalAccuracy,
        daAtt: acc.daAtt + (s.overall.daAtt ?? s.overall.att),
      };
    },
    { att: 0, totalYards: 0, yardsAtt: 0, totalDA: 0, daAtt: 0 }
  );
  const avgYards = overall.yardsAtt > 0 ? (overall.totalYards / overall.yardsAtt).toFixed(1) : "—";
  const avgDA = overall.daAtt > 0 ? (overall.totalDA / overall.daAtt).toFixed(2) : "—";
  return (
    <>
      <StatCard label="Avg Yards" value={avgYards} />
      <StatCard label="Avg DA" value={avgDA} />
    </>
  );
}

function KickoffHighlights() {
  const { athletes, stats } = useKickoff();
  const overall = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        touchbacks: acc.touchbacks + s.overall.touchbacks,
        totalDist: acc.totalDist + s.overall.totalDist,
      };
    },
    { att: 0, touchbacks: 0, totalDist: 0 }
  );
  const tbRate = overall.att > 0 ? `${Math.round((overall.touchbacks / overall.att) * 100)}%` : "—";
  const avgDist = overall.att > 0 ? (overall.totalDist / overall.att).toFixed(1) : "—";
  return (
    <>
      <StatCard label="TB Rate" value={tbRate} />
      <StatCard label="Avg Dist" value={overall.att > 0 ? `${avgDist} yd` : "—"} />
    </>
  );
}

function SnapHighlights() {
  const { athletes, stats } = useLongSnap();
  const overall = athletes.reduce(
    (acc, a) => {
      const s = stats[a];
      if (!s) return acc;
      return {
        att: acc.att + s.overall.att,
        onTarget: acc.onTarget + s.overall.onTarget,
        totalTime: acc.totalTime + s.overall.totalTime,
      };
    },
    { att: 0, onTarget: 0, totalTime: 0 }
  );
  const avgTime = overall.att > 0 ? `${(overall.totalTime / overall.att).toFixed(2)}s` : "—";
  return (
    <>
      <StatCard label="On-Target%" value={makePct(overall.att, overall.onTarget)} />
      <StatCard label="Avg Time" value={avgTime} />
    </>
  );
}

const SPORT_LABELS: Record<string, { label: string; icon: string; href: string }> = {
  KICKING: { label: "FG", icon: "🏈", href: "/kicking/history" },
  PUNTING: { label: "Punt", icon: "👟", href: "/punting/history" },
  KICKOFF: { label: "KO", icon: "🎯", href: "/kickoff/history" },
  LONGSNAP: { label: "Snap", icon: "📏", href: "/longsnap/history" },
};

function DashboardContent() {
  const fg = useFG();
  const punt = usePunt();
  const kickoff = useKickoff();

  // Merge all histories, tag with sport, sort by date descending
  const allSessions = [
    ...fg.history.map((s) => ({ ...s, sport: "KICKING" as const })),
    ...punt.history.map((s) => ({ ...s, sport: "PUNTING" as const })),
    ...kickoff.history.map((s) => ({ ...s, sport: "KICKOFF" as const })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Dashboard" />

      <main className="p-4 lg:p-6 space-y-6 max-w-6xl">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">
            Special Teams Dashboard
          </h1>
          <p className="text-sm text-muted mt-1">
            Track kicker, punter, and snapper performance across all sessions.
          </p>
        </div>

        {/* Sport cards — icon only */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Sport Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SPORT_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
              >
                <div className="text-4xl mb-2">{card.icon}</div>
                <h3 className="text-xs font-bold text-slate-100 group-hover:text-accent transition-colors">
                  {card.label}
                </h3>
              </Link>
            ))}
          </div>
        </div>

        {/* Highlights — 2 stats per sport */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Season Highlights
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            <FGHighlights />
            <PuntHighlights />
            <KickoffHighlights />
            <SnapHighlights />
          </div>
        </div>

        {/* Recent sessions — all phases merged */}
        {allSessions.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
              Recent Sessions
            </h2>
            <div className="card-2 divide-y divide-border/50">
              {allSessions.slice(0, 8).map((session) => {
                const entries = (session.entries ?? []) as unknown as Record<string, unknown>[];
                const count = entries.length;
                const sportInfo = SPORT_LABELS[session.sport] ?? { label: session.sport, icon: "📋", href: "#" };
                const isGame = session.mode === "game";

                // Sport-specific summary
                let summary = `${count} entries`;
                let badge: React.ReactNode = null;
                if (session.sport === "KICKING") {
                  const kicks = entries as { result: string }[];
                  const makes = kicks.filter((k) => k.result?.startsWith("Y")).length;
                  summary = `${count} kick${count !== 1 ? "s" : ""}`;
                  badge = (
                    <span className={makes / Math.max(count, 1) >= 0.7 ? "badge-make" : "badge-warn"}>
                      {makePct(count, makes)}
                    </span>
                  );
                } else if (session.sport === "PUNTING") {
                  summary = `${count} punt${count !== 1 ? "s" : ""}`;
                } else if (session.sport === "KICKOFF") {
                  summary = `${count} kickoff${count !== 1 ? "s" : ""}`;
                }

                return (
                  <Link
                    key={session.id}
                    href={sportInfo.href}
                    className="flex items-center justify-between py-3 px-1 first:pt-0 last:pb-0 hover:bg-surface/30 transition-colors rounded"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-lg leading-none">{sportInfo.icon}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
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
                        <p className="text-xs text-muted">{summary}</p>
                      </div>
                    </div>
                    {badge}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
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
