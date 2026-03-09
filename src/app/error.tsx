"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-100">Something went wrong</h2>
        <p className="text-sm text-muted">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-accent text-bg rounded-lg font-semibold text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
