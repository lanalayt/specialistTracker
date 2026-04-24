"use client";

import { useState } from "react";

export function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block ml-1.5 align-middle">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-border text-[10px] font-bold text-muted hover:text-white hover:bg-accent/40 transition-colors inline-flex items-center justify-center"
        aria-label="Info"
      >
        ?
      </button>
      {open && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-lg bg-surface-2 border border-border text-xs text-slate-200 shadow-lg leading-relaxed pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}
