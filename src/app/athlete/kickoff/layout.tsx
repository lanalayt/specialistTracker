"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { KickoffProvider } from "@/lib/kickoffContext";
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

export default function AthleteKickoffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/kickoff";
  return (
    <KickoffProvider sportKey="ATHLETE_KICKOFF">
      <SyncOnMount />
      <Header title="Kickoff" />
      {!isHub && (
        <SportSubNav
          basePath="/athlete/kickoff"
          extraTabs={[{ label: "Athletes", slug: "athletes" }, { label: "KO Settings", slug: "settings" }]}
        />
      )}
      {children}
    </KickoffProvider>
  );
}
