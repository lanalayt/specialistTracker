"use client";

import Link from "next/link";

export default function FGChartingChooser() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="space-y-6 w-full max-w-md">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-100">Charting Games</h2>
          <p className="text-sm text-muted mt-1">Choose your charting game.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-1 gap-4">
          <Link
            href="/kicking/charting/line-golf"
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
          >
            <div className="text-4xl mb-3">⛳</div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">Line Golf</h3>
            <p className="text-xs text-muted mt-1">10 kicks. Hit the target yard line. Low score wins.</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
