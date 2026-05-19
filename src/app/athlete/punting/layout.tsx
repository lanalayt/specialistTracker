"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { PuntProvider } from "@/lib/puntContext";
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

export default function AthletePuntingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/punting";
  return (
    <PuntProvider sportKey="ATHLETE_PUNTING">
      <SyncOnMount />
      <Header title="Punting" />
      {!isHub && (
        <SportSubNav
          basePath="/athlete/punting"
          extraTabs={[{ label: "Charting Games", slug: "charting" }, { label: "Punt Settings", slug: "settings" }]}
        />
      )}
      {children}
    </PuntProvider>
  );
}
