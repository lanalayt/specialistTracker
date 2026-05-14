"use client";

import { Header } from "@/components/layout/Header";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import Link from "next/link";
import React from "react";

const SCOUT_SPORT_CARDS: { href: string; icon?: string; iconEl?: React.ReactNode; label: string }[] = [
  { href: "/scout/fg", iconEl: <GoalpostIcon size={36} />, label: "FG Kicking" },
  { href: "/scout/punt", iconEl: <PuntFootIcon size={36} />, label: "Punting" },
  { href: "/scout/kickoff", iconEl: <KickoffTeeIcon size={36} />, label: "Kickoff" },
  { href: "/scout/snap", icon: "📏", label: "Snapping" },
];

export default function ScoutDashboardPage() {
  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Scout Mode" />
      <main className="p-4 lg:p-6 space-y-6 max-w-6xl">
        <h1 className="text-2xl font-extrabold text-slate-100">Scout Evaluation</h1>

        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Sport Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SCOUT_SPORT_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
              >
                <div className="text-4xl mb-2">{card.iconEl ?? card.icon}</div>
                <h3 className="text-xs font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                  {card.label}
                </h3>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Link href="/scout/archives" className="card hover:bg-surface-2 hover:border-amber-500/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">🗄</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-amber-400 transition-colors">Scout Archives</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
