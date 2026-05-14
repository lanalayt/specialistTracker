"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/Header";

function AthleteContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
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
