"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/Header";

export default function ScoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
