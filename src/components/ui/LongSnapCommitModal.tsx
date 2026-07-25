"use client";

interface LongSnapCommitModalProps {
  count: number;
  label: string;
  weather: string;
  onWeatherChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Recap that pops up when committing a Long Snap practice session. Shows the
 * day's snap count and lets the coach set the weather for that day before
 * confirming.
 */
export function LongSnapCommitModal({
  count,
  label,
  weather,
  onWeatherChange,
  onConfirm,
  onCancel,
}: LongSnapCommitModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-card w-full max-w-md shadow-accent-lg">
        <div className="p-5 border-b border-border">
          <h2 className="text-lg font-bold text-slate-100">Commit Session</h2>
          <p className="text-sm text-muted mt-0.5">{label}</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Weather</label>
            <input
              type="text"
              value={weather}
              onChange={(e) => onWeatherChange(e.target.value)}
              placeholder="e.g. 72°F, Sunny, Wind 10mph SW"
              autoFocus
              className="mt-1 w-full bg-surface-2 border border-border text-slate-200 px-2.5 py-1.5 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
            />
          </div>

          <div className="card-2 text-center">
            <p className="text-2xl font-extrabold text-accent">{count}</p>
            <p className="text-[10px] text-muted uppercase tracking-wider mt-0.5">
              Snap{count !== 1 ? "s" : ""}
            </p>
          </div>

          <p className="text-xs text-muted">
            This will be added to cumulative stats. You can undo once after committing.
          </p>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onCancel} className="btn-ghost flex-1">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary flex-1">
            Commit {count} snap{count !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
