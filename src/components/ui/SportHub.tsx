"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const CARDS = [
  { icon: "📋", label: "Session", desc: "Log kicks and commit practice", slug: "session" },
  { icon: "📊", label: "Statistics", desc: "Season charts and breakdowns", slug: "statistics" },
  { icon: "📁", label: "History", desc: "Browse past sessions", slug: "history" },
  { icon: "👤", label: "Athletes", desc: "Manage athlete roster", slug: "athletes", coachOnly: true },
];

export function SportHub({ basePath, sportName }: { basePath: string; sportName: string }) {
  const { isAthlete } = useAuth();
  const visibleCards = isAthlete ? CARDS.filter((c) => !c.coachOnly) : CARDS;

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
        {visibleCards.map((card) => (
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
    </main>
  );
}
