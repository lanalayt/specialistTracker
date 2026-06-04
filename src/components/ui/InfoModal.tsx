"use client";

interface InfoModalProps {
  name: string;
  weather?: string;
  notes?: string;
  date?: string;
  onClose: () => void;
}

export function InfoModal({ name, weather, notes, date, onClose }: InfoModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-surface border border-border rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-bold text-slate-100">{name}</h3>
          {date && <p className="text-[10px] text-muted mt-0.5">{new Date(date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</p>}
        </div>
        <div className="px-5 pb-5 space-y-3">
          {weather && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider shrink-0 pt-0.5 w-16">Weather</span>
              <p className="text-xs text-slate-300">{weather}</p>
            </div>
          )}
          {notes && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-semibold text-muted uppercase tracking-wider shrink-0 pt-0.5 w-16">Notes</span>
              <p className="text-xs text-slate-300 whitespace-pre-wrap">{notes}</p>
            </div>
          )}
          {!weather && !notes && (
            <p className="text-xs text-muted italic">No additional info</p>
          )}
        </div>
        <div className="px-5 pb-4">
          <button onClick={onClose} className="w-full py-2 text-xs font-semibold text-muted hover:text-white border border-border rounded-input transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}
