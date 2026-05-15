"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import { useAuth } from "@/lib/auth";
import { getTeamId } from "@/lib/teamData";
import { loadAssignedCharts, type AssignedChart } from "@/lib/scoutStore";
import Link from "next/link";
import React from "react";

const SPORT_CARDS: { href: string; icon?: string; iconEl?: React.ReactNode; label: string }[] = [
  { href: "/athlete/kicking", iconEl: <GoalpostIcon size={36} />, label: "FG Kicking" },
  { href: "/athlete/punting", iconEl: <PuntFootIcon size={36} />, label: "Punting" },
  { href: "/athlete/kickoff", iconEl: <KickoffTeeIcon size={36} />, label: "Kickoff" },
  { href: "/athlete/longsnap", icon: "📏", label: "Snapping" },
];

export default function AthleteDashboardPage() {
  const { user } = useAuth();
  const [charts, setCharts] = useState<AssignedChart[]>([]);

  useEffect(() => {
    async function load() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (!tid) return;
      const all = await loadAssignedCharts(tid);
      setCharts(all);
    }
    load();
  }, []);

  // Filter charts assigned to current user that aren't completed yet
  const myName = user?.name ?? "";
  const myCharts = charts.filter((c) => c.athletes.includes(myName) && !c.completedBy[myName]);

  return (
    <>
      <Header title="Athlete Mode" />
      <main className="p-4 lg:p-6 space-y-6 max-w-6xl">
        <h1 className="text-2xl font-extrabold text-slate-100">Athlete Mode</h1>

        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Sport Modules
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SPORT_CARDS.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6"
              >
                <div className="text-4xl mb-2">{card.iconEl ?? card.icon}</div>
                <h3 className="text-xs font-bold text-slate-100 group-hover:text-sky-400 transition-colors">
                  {card.label}
                </h3>
              </Link>
            ))}
          </div>
        </div>

        {/* Assigned Charts */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Assigned Charts
          </h2>
          {myCharts.length === 0 ? (
            <p className="text-xs text-muted">No assigned charts right now.</p>
          ) : (
            <div className="space-y-2">
              {myCharts.map((chart) => {
                const isOverdue = new Date(chart.dueDate) < new Date(new Date().toDateString());
                return (
                  <Link
                    key={chart.id}
                    href={`/athlete/kicking/off-sticks/athlete-chart?assigned=${chart.id}`}
                    className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all flex items-center justify-between py-3 px-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        FG Chart — {chart.kicks.length} kick{chart.kicks.length !== 1 ? "s" : ""}
                      </p>
                      <p className="text-[10px] text-muted">
                        From {chart.createdBy} — {chart.kicks.map((k) => `${k.distance}${k.hash}`).join(", ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className={`text-xs font-bold ${isOverdue ? "text-miss" : "text-sky-400"}`}>
                        {isOverdue ? "Overdue" : `Due ${new Date(chart.dueDate).toLocaleDateString()}`}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Quick Links
          </h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <Link href="/athlete/archives" className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex items-center gap-3 py-3 px-4">
              <span className="text-xl">🗄</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors">Archives</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
