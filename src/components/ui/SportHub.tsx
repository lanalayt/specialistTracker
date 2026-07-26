"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

const BASE_CARDS = [
  { icon: "📋", label: "Session", desc: "Log kicks and commit practice", slug: "session" },
  { icon: "📊", label: "Statistics", desc: "Season charts and breakdowns", slug: "statistics" },
  { icon: "📁", label: "History", desc: "Browse past sessions", slug: "history" },
];

export function SportHub({
  basePath,
  sportName,
  hasCharting = false,
  chartingComingSoon = false,
}: {
  basePath: string;
  sportName: string;
  hasCharting?: boolean;
  chartingComingSoon?: boolean;
}) {
  const { isAthlete } = useAuth();

  const athleteCard = { icon: "👤", label: "Athletes", desc: "Manage athlete roster", slug: "athletes" };
  const chartingCard = { icon: "🎯", label: "Charting Games", desc: "Fun competitive drills", slug: "charting" };
  const settingsCard = { icon: "⚙️", label: "Settings", desc: "Configure this module", slug: "settings" };

  // Charting Games sits right after the base cards (Session/Statistics/History),
  // matching FG and punt — whether it's a real link or a coming-soon placeholder.
  const gridItems: { icon: string; label: string; desc: string; slug: string; comingSoon?: boolean }[] = [
    ...BASE_CARDS,
    ...(hasCharting ? [chartingCard] : []),
    ...(chartingComingSoon ? [{ ...chartingCard, comingSoon: true }] : []),
    ...(isAthlete ? [] : [athleteCard, settingsCard]),
  ];

  return (
    <main className="p-4 lg:p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-slate-100">{sportName}</h1>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {gridItems.map((card) =>
          card.comingSoon ? (
            <div
              key={card.slug}
              aria-disabled="true"
              title="Coming soon"
              className="card relative opacity-60 cursor-not-allowed flex flex-col items-center text-center py-8"
            >
              <span className="absolute top-2 right-2 text-[10px] font-semibold uppercase tracking-wide bg-surface-2 text-muted rounded px-1.5 py-0.5">
                Soon
              </span>
              <span className="text-4xl mb-3">{card.icon}</span>
              <h3 className="text-sm font-bold text-slate-100">{card.label}</h3>
              <p className="text-xs text-muted mt-1">Coming soon</p>
            </div>
          ) : (
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
          )
        )}
      </div>
    </main>
  );
}
