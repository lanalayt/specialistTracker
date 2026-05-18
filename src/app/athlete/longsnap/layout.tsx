"use client";

import { Header } from "@/components/layout/Header";

export default function AthleteLongSnapLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header title="Snapping" />
      {children}
    </>
  );
}
