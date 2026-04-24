"use client";

interface RenameTypeModalProps {
  oldLabel: string;
  newLabel: string;
  onRename: () => void;
  onMakeNew: () => void;
  onCancel: () => void;
}

export function RenameTypeModal({ oldLabel, newLabel, onRename, onMakeNew, onCancel }: RenameTypeModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border rounded-xl p-6 max-w-md w-full mx-4 space-y-4">
        <h3 className="text-base font-bold text-slate-100">
          Rename &ldquo;{oldLabel}&rdquo; to &ldquo;{newLabel}&rdquo;?
        </h3>

        <div className="space-y-3">
          <button
            onClick={onRename}
            className="w-full text-left px-4 py-3 rounded-input border border-accent/40 bg-accent/10 hover:bg-accent/20 transition-colors"
          >
            <p className="text-sm font-semibold text-accent">Rename</p>
            <p className="text-xs text-muted mt-0.5">
              All historical data will now display as &ldquo;{newLabel}&rdquo;.
            </p>
          </button>

          <button
            onClick={onMakeNew}
            className="w-full text-left px-4 py-3 rounded-input border border-border hover:bg-surface-2 transition-colors"
          >
            <p className="text-sm font-semibold text-slate-200">Make New Type</p>
            <p className="text-xs text-muted mt-0.5">
              Keep &ldquo;{oldLabel}&rdquo; for old data. Create &ldquo;{newLabel}&rdquo; as a new separate type.
            </p>
          </button>

          <button
            onClick={onCancel}
            className="w-full text-left px-4 py-3 rounded-input border border-border hover:bg-surface-2 transition-colors"
          >
            <p className="text-sm font-semibold text-muted">Cancel</p>
            <p className="text-xs text-muted mt-0.5">
              Revert back to &ldquo;{oldLabel}&rdquo;.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
