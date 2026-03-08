"use client";

import { useKickoff } from "@/lib/kickoffContext";

export default function KickoffAthletesPage() {
  const { athletes } = useKickoff();

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Athlete Roster</h2>
        <p className="text-xs text-muted">
          Kickoff athlete management is handled per session via the table entry form.
        </p>
      </div>

      <div className="space-y-2">
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No athletes configured.</p>
        ) : athletes.map((a) => (
          <div key={a} className="card-2 flex items-center px-4 py-2.5">
            <span className="text-sm font-medium text-slate-200">{a}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
