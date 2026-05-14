"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/Header";

export default function ScoutLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      {children}
      <MobileNav />
    </div>
  );
}
