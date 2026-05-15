"use client";

import Link from "next/link";

export default function AthleteKickingSessionPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-sm">
        <h2 className="text-xl font-bold text-slate-100">FG Session</h2>
        <p className="text-sm text-muted">Choose your session type.</p>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/athlete/kicking/off-sticks"
            className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8"
          >
            <h3 className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors">Off Sticks</h3>
            <p className="text-[10px] text-muted mt-1">Preset charts</p>
          </Link>
          <div className="card opacity-40 cursor-not-allowed flex flex-col items-center text-center py-8">
            <h3 className="text-sm font-bold text-slate-100">Live</h3>
            <p className="text-[10px] text-muted mt-1">Coming soon</p>
          </div>
        </div>
      </div>
    </main>
  );
}
