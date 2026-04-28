"use client";

import Link from "next/link";

export default function LongSnapSessionChooser() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="space-y-6 w-full max-w-md">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-100">Snap Session</h2>
          <p className="text-sm text-muted mt-1">Choose your snap type to start logging.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/longsnap/session-punt"
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
          >
            <div className="text-4xl mb-3">🏈</div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">Long Snap</h3>
            <p className="text-xs text-muted mt-1">Punt snapping session</p>
          </Link>

          <Link
            href="/longsnap/session-fg"
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
          >
            <div className="text-4xl mb-3">🏈</div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">Short Snap</h3>
            <p className="text-xs text-muted mt-1">FG &amp; PAT snapping session</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
