import type { Metadata } from "next";
import "./globals.css";
import { AppProviders } from "@/components/providers/AppProviders";

export const metadata: Metadata = {
  title: "Specialist Tracker",
  description: "Special teams performance tracking platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-bg text-slate-100 antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
