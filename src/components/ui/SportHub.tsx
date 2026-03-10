"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const CARDS = [
  { icon: "📋", label: "Session", desc: "Log kicks and commit practice", slug: "session", coachOnly: true },
  { icon: "📊", label: "Statistics", desc: "Season charts and breakdowns", slug: "statistics", coachOnly: false },
  { icon: "📁", label: "History", desc: "Browse past sessions", slug: "history", coachOnly: false },
  { icon: "👤", label: "Athletes", desc: "Manage athlete roster", slug: "athletes", coachOnly: true },
];

export function SportHub({ basePath, sportName }: { basePath: string; sportName: string }) {
  const { isAthlete } = useAuth();
  const visibleCards = isAthlete ? CARDS.filter((c) => !c.coachOnly) : CARDS;

  return (
    <main className="p-4 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-100">{sportName}</h1>
        <p className="text-sm text-muted mt-1">Select a section to get started.</p>
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
