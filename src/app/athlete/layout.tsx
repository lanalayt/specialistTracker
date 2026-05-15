"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/Header";

function AthleteContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="athlete-mode lg:pl-56 flex-1 flex flex-col min-h-screen min-w-0 pb-20 lg:pb-0">
      {children}
    </div>
  );
}

export default function AthleteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <AthleteContent>{children}</AthleteContent>
      <MobileNav />
    </div>
  );
}
