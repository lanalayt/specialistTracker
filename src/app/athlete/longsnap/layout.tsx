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
            { label: "Session", slug: "session", coachOnly: false },
            { label: "Statistics", slug: "statistics", coachOnly: false },
            { label: "History", slug: "history", coachOnly: false },
            { label: "Charting", slug: "charting", coachOnly: false },
            { label: "Athletes", slug: "athletes", coachOnly: false },
            { label: "Settings", slug: "settings", coachOnly: false },
          ]}
        />
      )}
      {children}
    </LongSnapProvider>
  );
}
