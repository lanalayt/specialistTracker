"use client";

import { useLongSnap } from "@/lib/longSnapContext";

export default function LongSnapAthletesPage() {
  const { athletes } = useLongSnap();

  return (
    <main className="p-4 lg:p-6 max-w-lg space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-100 mb-1">Athlete Roster</h2>
        <p className="text-xs text-muted">
          Long Snap athlete management is handled per session via the entry card.
        </p>
      </div>

      <div className="space-y-2">
        {athletes.length === 0 ? (
          <p className="text-xs text-muted">No athletes configured.</p>
        ) : athletes.map((a) => (
          <div key={a.id} className="card-2 flex items-center px-4 py-2.5">
            <span className="text-sm font-medium text-slate-200">{a.name}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
