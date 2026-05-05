"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const BASE_CARDS = [
  { icon: "📋", label: "Session", desc: "Log kicks and commit practice", slug: "session" },
  { icon: "📊", label: "Statistics", desc: "Season charts and breakdowns", slug: "statistics" },
  { icon: "📁", label: "History", desc: "Browse past sessions", slug: "history" },
];

export function SportHub({ basePath, sportName, hasCharting = false }: { basePath: string; sportName: string; hasCharting?: boolean }) {
  const { isAthlete } = useAuth();

  const athleteCard = { icon: "👤", label: "Athletes", desc: "Manage athlete roster", slug: "athletes", coachOnly: true };
  const chartingCard = { icon: "🎯", label: "Charting Games", desc: "Fun competitive drills", slug: "charting" };

  // When charting exists: grid = base + charting, athletes below
  // When no charting: grid = base + athletes (in grid)
  const allGridCards = hasCharting
    ? [...BASE_CARDS, chartingCard]
    : [...BASE_CARDS, ...(isAthlete ? [] : [athleteCard])];
  const showAthletesBelow = hasCharting && !isAthlete;

  return (
    <main className="p-4 lg:p-8 max-w-2xl">
      <div className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-extrabold text-slate-100">{sportName}</h1>
        {!isAthlete && (
          <Link
            href={`${basePath}/settings`}
            className="text-[10px] font-bold text-muted uppercase tracking-wider px-2.5 py-1 rounded-input border border-border hover:border-accent/40 hover:text-accent transition-all"
          >
            Settings
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {allGridCards.map((card) => (
          <Link
            key={card.slug}
            href={`${basePath}/${card.slug}`}
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8"
          >
            <span className="text-4xl mb-3">{card.icon}</span>
            <h3 className="text-sm font-bold text-slate-100 group-hover:text-accent transition-colors">
              {card.label}
            </h3>
            <p className="text-xs text-muted mt-1">{card.desc}</p>
          </Link>
        ))}
      </div>
      {showAthletesBelow && (
        <div className="mt-4 flex justify-center">
          <Link
            href={`${basePath}/athletes`}
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 w-[calc(50%+0.5rem)]"
          >
            <span className="text-4xl mb-3">👤</span>
            <h3 className="text-sm font-bold text-slate-100 group-hover:text-accent transition-colors">
              Athletes
            </h3>
            <p className="text-xs text-muted mt-1">Manage athlete roster</p>
          </Link>
        </div>
      )}
    </main>
  );
}
