"use client";

import { useState, useRef, useEffect } from "react";

interface ExportButtonProps {
  onExcel: () => void;
  onPDF: () => void;
  label?: string;
}

export function ExportButton({ onExcel, onPDF, label = "Export" }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-xs font-semibold rounded-input border border-border text-slate-300 hover:text-white hover:border-accent/50 hover:bg-accent/10 transition-all"
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-input shadow-lg z-50 overflow-hidden">
          <button
            onClick={() => { onExcel(); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-accent/10 hover:text-accent transition-colors"
          >
            Excel
          </button>
          <button
            onClick={() => { onPDF(); setOpen(false); }}
            className="block w-full text-left px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-accent/10 hover:text-accent transition-colors border-t border-border/50"
          >
            PDF
          </button>
        </div>
      )}
    </div>
  );
}
