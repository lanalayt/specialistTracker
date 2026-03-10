"use client";

import { usePathname } from "next/navigation";
import { PuntProvider } from "@/lib/puntContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";
import { AthleteViewOnly } from "@/components/auth/AthleteViewOnly";

export default function PuntingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/punting";
  return (
    <PuntProvider>
      <div className="flex">
        <Sidebar />
        <div className="lg:pl-56 flex-1 flex flex-col min-h-screen pb-20 lg:pb-0">
          <Header title="Punting" />
          {!isHub && (
            <SportSubNav
              basePath="/punting"
              extraTabs={[{ label: "Punt Settings", slug: "settings" }]}
            />
          )}
          <AthleteViewOnly>{children}</AthleteViewOnly>
        </div>
        <MobileNav />
      </div>
    </PuntProvider>
  );
}
