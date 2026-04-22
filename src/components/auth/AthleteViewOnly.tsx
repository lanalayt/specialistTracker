"use client";

import { useAuth } from "@/lib/auth";

export function AthleteViewOnly({ children }: { children: React.ReactNode }) {
  const { isAthlete, canEdit } = useAuth();

  if (!isAthlete || canEdit) return <>{children}</>;

  return (
    <div className="relative">
      {children}
      <div className="sticky bottom-0 left-0 right-0 bg-warn/10 border-t border-warn/30 px-4 py-2 text-center z-30">
        <p className="text-xs font-semibold text-warn">
          View Only — Ask your coach to grant editing access
        </p>
      </div>
    </div>
  );
}
