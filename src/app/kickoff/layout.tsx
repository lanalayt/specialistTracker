"use client";

import { usePathname } from "next/navigation";
import { KickoffProvider } from "@/lib/kickoffContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function KickoffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/kickoff";
  return (
    <KickoffProvider>
      <div className="flex">
        <Sidebar />
        <div className="lg:pl-56 flex-1 flex flex-col min-h-screen pb-20 lg:pb-0">
          <Header title="Kickoff" />
          {!isHub && <SportSubNav basePath="/kickoff" />}
          {children}
        </div>
        <MobileNav />
      </div>
    </KickoffProvider>
  );
}
