"use client";

import { useAuth } from "@/lib/auth";

export function AthleteViewOnly({ children }: { children: React.ReactNode }) {
  const { isAthlete } = useAuth();

  if (!isAthlete) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none">{children}</div>
      <div className="sticky bottom-0 left-0 right-0 bg-warn/10 border-t border-warn/30 px-4 py-2 text-center z-30">
        <p className="text-xs font-semibold text-warn">
          View Only — Switch to Coach mode to make changes
        </p>
      </div>
    </div>
  );
}
