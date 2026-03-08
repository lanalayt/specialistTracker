"use client";

import { usePathname } from "next/navigation";
import { FGProvider } from "@/lib/fgContext";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { SportSubNav } from "@/components/ui/SportSubNav";

export default function KickingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHub = pathname === "/kicking";
  return (
    <FGProvider>
      <div className="flex">
        <Sidebar />
        <div className="lg:pl-56 flex-1 flex flex-col min-h-screen pb-20 lg:pb-0">
          <Header title="FG Kicking" />
          {!isHub && <SportSubNav basePath="/kicking" />}
          {children}
        </div>
        <MobileNav />
      </div>
    </FGProvider>
  );
}
