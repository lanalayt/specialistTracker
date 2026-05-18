"use client";

import { usePathname } from "next/navigation";
import { PuntProvider } from "@/lib/puntContext";
import { Header } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function AthletePuntingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/punting";
  return (
    <PuntProvider sportKey="ATHLETE_PUNTING">
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
