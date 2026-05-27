"use client";

import { usePathname } from "next/navigation";
import { KickoffProvider } from "@/lib/kickoffContext";
import { Header } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function AthleteKickoffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/kickoff";
  return (
    <KickoffProvider sportKey="ATHLETE_KICKOFF">
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
