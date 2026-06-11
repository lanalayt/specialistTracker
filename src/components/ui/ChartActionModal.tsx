"use client";

import { useState } from "react";
import { downloadChartPDF, shareChartPDF } from "@/lib/scoutExport";
import { scoutDisplayName, type ScoutSession } from "@/lib/scoutStore";

interface Props {
  session: ScoutSession;
  athlete: string;
  numbers?: Record<string, string>;
  onEdit: () => void;
  onClose: () => void;
}

/** Tapping a chart row opens this: Edit the chart, or Share it as a PDF. */
export function ChartActionModal({ session, athlete, numbers, onEdit, onClose }: Props) {
  const [view, setView] = useState<"main" | "share">("main");
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    await downloadChartPDF(session, athlete);
    setBusy(false);
    onClose();
  };
  const send = async () => {
    setBusy(true);
    await shareChartPDF(session, athlete);
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{scoutDisplayName(athlete, numbers)}</h3>
            <p className="text-[10px] text-muted">{new Date(session.date).toLocaleDateString()}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xs transition-colors">Close</button>
        </div>

        {view === "main" ? (
          <div className="space-y-2">
            <button onClick={onEdit} className="btn-primary w-full py-2.5 text-sm font-bold">Edit</button>
            <button onClick={() => setView("share")} className="btn-ghost w-full py-2.5 text-sm font-bold border border-border">Share</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-muted">Share this chart as a PDF.</p>
            <button onClick={download} disabled={busy} className="btn-primary w-full py-2.5 text-sm font-bold disabled:opacity-40">Download PDF</button>
            <button onClick={send} disabled={busy} className="btn-ghost w-full py-2.5 text-sm font-bold border border-border disabled:opacity-40">Send via Email / Text</button>
            <button onClick={() => setView("main")} className="w-full text-center text-xs text-muted hover:text-white transition-colors">&larr; Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
