"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function OffSticksPage() {
  const { isCoach } = useAuth();

  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-sm">
        <h2 className="text-xl font-bold text-slate-100">Off Sticks</h2>
        <p className="text-sm text-muted">Choose chart type.</p>
        <div className="grid grid-cols-2 gap-3">
          {isCoach && (
            <Link
              href="/athlete/kicking/off-sticks/coaches-chart"
              className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8"
            >
              <h3 className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors">Coaches Chart</h3>
              <p className="text-[10px] text-muted mt-1">Create & assign charts</p>
            </Link>
          )}
          <Link
            href="/athlete/kicking/off-sticks/athlete-chart"
            className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8"
          >
            <h3 className="text-sm font-bold text-slate-100 group-hover:text-sky-400 transition-colors">Athlete Chart</h3>
            <p className="text-[10px] text-muted mt-1">Create your own chart</p>
          </Link>
        </div>
        <Link href="/athlete/kicking/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
      </div>
    </main>
  );
}
