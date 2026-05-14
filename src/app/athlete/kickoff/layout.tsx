"use client";

import { usePathname } from "next/navigation";
import { KickoffProvider } from "@/lib/kickoffContext";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function AthleteKickoffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/athlete/kickoff";
  return (
    <KickoffProvider sportKey="ATHLETE_KICKOFF">
      {!isHub && (
        <SportSubNav
          basePath="/athlete/kickoff"
          extraTabs={[{ label: "KO Settings", slug: "settings" }]}
        />
      )}
      {children}
    </KickoffProvider>
  );
}
