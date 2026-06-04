"use client";

import { useState } from "react";

interface InfoModalProps {
  name: string;
  weather?: string;
  notes?: string;
  date?: string;
  onSave?: (weather: string, notes: string) => void;
  onClose: () => void;
}

export function InfoModal({ name, weather, notes, date, onSave, onClose }: InfoModalProps) {
  const [w, setW] = useState(weather ?? "");
  const [n, setN] = useState(notes ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-slate-100">{name}</h3>
          {date && <p className="text-[10px] text-muted mt-0.5">{new Date(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>}
        </div>
        <div className="px-5 pb-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Weather</p>
            <input type="text" value={w} onChange={(e) => setW(e.target.value)} placeholder="Enter weather conditions..." className="input w-full text-xs py-1.5" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Notes</p>
            <textarea value={n} onChange={(e) => setN(e.target.value)} placeholder="Enter notes..." rows={3} className="input w-full text-xs py-1.5 resize-none" />
          </div>
        </div>
        <div className="px-5 pb-4 flex gap-2">
          {onSave && <button onClick={() => { onSave(w, n); onClose(); }} className="btn-primary flex-1 py-2 text-xs font-semibold">Save</button>}
          <button onClick={onClose} className={`${onSave ? "btn-ghost" : "btn-primary"} flex-1 py-2 text-xs font-semibold`}>Close</button>
        </div>
      </div>
    </div>
  );
}
