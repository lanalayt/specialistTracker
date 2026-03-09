"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-[#0a0f14] text-slate-100 flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="text-sm text-slate-400">{error.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-[#00d4a0] text-[#0a0f14] rounded-lg font-semibold text-sm"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
