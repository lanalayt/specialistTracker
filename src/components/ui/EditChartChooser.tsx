"use client";

import { scoutDisplayName } from "@/lib/scoutStore";
import clsx from "clsx";

export interface ChooserItem {
  sessionId: string;
  name: string;
  date: string;
  sublabel?: string;
}

interface Props {
  items: ChooserItem[];
  numbers?: Record<string, string>;
  onPick: (item: ChooserItem) => void;
  onClose: () => void;
}

/** Asks which of the selected charts to edit (one at a time). */
export function EditChartChooser({ items, numbers, onPick, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Which chart to edit?</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xs transition-colors">Close</button>
        </div>
        <div className="space-y-1.5">
          {items.map((it) => (
            <button
              key={`${it.sessionId}|||${it.name}`}
              onClick={() => onPick(it)}
              className={clsx("w-full text-left px-3 py-2 rounded-input border border-border bg-surface-2 hover:border-amber-500/40 transition-all")}
            >
              <span className="text-xs font-semibold text-slate-100">{scoutDisplayName(it.name, numbers)}</span>
              <span className="text-[10px] text-muted ml-2">{new Date(it.date).toLocaleDateString()}{it.sublabel ? ` · ${it.sublabel}` : ""}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
