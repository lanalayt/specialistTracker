"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LongSnapProvider } from "@/lib/longSnapContext";
import { Header } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";
import { syncAthleteKeys } from "@/lib/athleteStore";
import { getTeamId } from "@/lib/teamData";

function SyncOnMount() {
  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) { await new Promise((r) => setTimeout(r, 100)); tid = getTeamId(); }
      if (tid) await syncAthleteKeys(tid);
    })();
  }, []);
  return null;
}

export default function AthleteLongSnapLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/longsnap";
  return (
    <LongSnapProvider sportKey="ATHLETE_LONGSNAP">
      <SyncOnMount />
      <Header title="Snapping" />
      {!isHub && (
        <SportSubNav
          basePath="/athlete/longsnap"
          tabs={[
            { label: "FG Snaps", slug: "session-fg", coachOnly: false },
            { label: "Punt Snaps", slug: "session-punt", coachOnly: false },
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
