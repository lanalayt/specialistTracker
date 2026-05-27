"use client";

import { usePathname } from "next/navigation";
import { FGProvider } from "@/lib/fgContext";
import { Header } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function AthleteKickingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/kicking";
  return (
    <FGProvider sportKey="ATHLETE_KICKING">
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
