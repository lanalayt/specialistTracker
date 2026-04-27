"use client";

import { usePathname } from "next/navigation";
import { LongSnapProvider } from "@/lib/longSnapContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";
import { AthleteViewOnly } from "@/components/auth/AthleteViewOnly";

export default function LongSnapLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/longsnap";
  return (
    <LongSnapProvider>
      <div className="flex overflow-x-hidden max-w-[100vw]">
        <Sidebar />
        <div className="lg:pl-56 flex-1 flex flex-col min-h-screen pb-20 lg:pb-0 min-w-0">
          <Header title="Snapping" />
          {!isHub && <SportSubNav basePath="/longsnap" tabs={[
            { label: "Session", slug: "session", coachOnly: false },
            { label: "Statistics", slug: "statistics", coachOnly: false },
            { label: "History", slug: "history", coachOnly: false },
            { label: "Athletes", slug: "athletes", coachOnly: true },
            { label: "Settings", slug: "settings", coachOnly: true },
          ]} />}
          <AthleteViewOnly>{children}</AthleteViewOnly>
        </div>
        <MobileNav />
      </div>
    </LongSnapProvider>
  );
}
