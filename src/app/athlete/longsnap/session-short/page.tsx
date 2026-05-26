"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function ShortSnapSessionPage() {
  const { isCoach } = useAuth();

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="space-y-6 w-full max-w-md">
        <Link href="/athlete/longsnap/session" className="text-xs text-muted hover:text-white transition-colors">&larr; Back</Link>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-100">Short Snap Session</h2>
          <p className="text-sm text-muted mt-1">Choose chart type.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isCoach && (
            <Link
              href="/athlete/longsnap/coaches-chart?type=short"
              className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
            >
              <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">Coaches Chart</h3>
              <p className="text-xs text-muted mt-1">Create & assign charts</p>
            </Link>
          )}

          <Link
            href="/athlete/longsnap/athlete-chart?type=short"
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
          >
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">Athlete Chart</h3>
            <p className="text-xs text-muted mt-1">Create your own chart</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
