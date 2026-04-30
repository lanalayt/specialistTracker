"use client";

import Link from "next/link";

export default function ChartingChooser() {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="space-y-6 w-full max-w-md">
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-100">Charting Games</h2>
          <p className="text-sm text-muted mt-1">Choose your charting game.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href="/longsnap/charting/30-point"
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
          >
            <div className="text-4xl mb-3">🎯</div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">30 Point Game</h3>
          </Link>

          <Link
            href="/longsnap/charting/balls-strikes"
            className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-8 px-4"
          >
            <div className="text-4xl mb-3">⚾</div>
            <h3 className="text-lg font-bold text-slate-100 group-hover:text-accent transition-colors">Balls & Strikes</h3>
          </Link>
        </div>
      </div>
    </div>
  );
}
