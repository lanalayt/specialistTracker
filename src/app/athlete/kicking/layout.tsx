"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { FGProvider } from "@/lib/fgContext";
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

export default function AthleteKickingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/kicking";
  return (
    <FGProvider sportKey="ATHLETE_KICKING">
      <SyncOnMount />
      <Header title="FG Kicking" />
      {!isHub && (
        <SportSubNav
          basePath="/athlete/kicking"
          extraTabs={[{ label: "Charting Games", slug: "charting" }, { label: "Athletes", slug: "athletes" }, { label: "FG Settings", slug: "settings" }]}
        />
      )}
      {children}
    </FGProvider>
  );
}
