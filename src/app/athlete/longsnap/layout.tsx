"use client";

import { usePathname } from "next/navigation";
import { LongSnapProvider } from "@/lib/longSnapContext";
import { Header } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function AthleteLongSnapLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/longsnap";
  return (
    <LongSnapProvider sportKey="ATHLETE_LONGSNAP">
      <Header title="Snapping" />
      {!isHub && (
        <SportSubNav
          basePath="/athlete/longsnap"
          tabs={[
            { label: "FG Snaps", slug: "session-fg", coachOnly: false },
            { label: "Punt Snaps", slug: "session-punt", coachOnly: false },
            { label: "Game Day", slug: "session-game", coachOnly: false },
            { label: "History", slug: "history", coachOnly: false },
            { label: "Charting", slug: "charting", coachOnly: false },
            { label: "Settings", slug: "settings", coachOnly: false },
          ]}
        />
      )}
      {children}
    </LongSnapProvider>
  );
}
