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
      <div className="flex">
        <Sidebar />
        <div className="lg:pl-56 flex-1 flex flex-col min-h-screen pb-20 lg:pb-0">
          <Header title="Long Snapping" />
          {!isHub && <SportSubNav basePath="/longsnap" />}
          <AthleteViewOnly>{children}</AthleteViewOnly>
        </div>
        <MobileNav />
      </div>
    </LongSnapProvider>
  );
}
