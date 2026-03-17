"use client";

import { usePathname } from "next/navigation";
import { KickoffProvider } from "@/lib/kickoffContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";
import { AthleteViewOnly } from "@/components/auth/AthleteViewOnly";

export default function KickoffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/kickoff";
  return (
    <KickoffProvider>
      <div className="flex overflow-x-hidden max-w-[100vw]">
        <Sidebar />
        <div className="lg:pl-56 flex-1 flex flex-col min-h-screen pb-20 lg:pb-0 min-w-0">
          <Header title="Kickoff" />
          {!isHub && <SportSubNav basePath="/kickoff" />}
          <AthleteViewOnly>{children}</AthleteViewOnly>
        </div>
        <MobileNav />
      </div>
    </KickoffProvider>
  );
}
