"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeamLogo } from "@/lib/useTeamLogo";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/kicking", label: "Kicking", icon: "🏈" },
  { href: "/punting", label: "Punting", icon: "👟" },
  { href: "/kickoff", label: "Kickoff", icon: "🎯" },
  { href: "/longsnap", label: "Long Snap", icon: "📏" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
];

export function Header({ title }: { title?: string }) {
  const pathname = usePathname();
  const { user, isCoach, signOut } = useAuth();
  const { logo, uploadLogo } = useTeamLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-border">
      <div className="flex items-center gap-4 px-4 h-14 lg:pl-60">
        {/* Logo (mobile) */}
        <div className="flex items-center gap-2 lg:hidden">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadLogo(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => { if (isCoach) fileRef.current?.click(); }}
            className={clsx(
              "w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0",
              isCoach && "cursor-pointer",
              !logo && "bg-accent text-bg font-bold text-xs"
            )}
          >
            {logo ? (
              <img src={logo} alt="Team logo" className="w-full h-full object-cover" />
            ) : (
              "ST"
            )}
          </button>
          <span className="text-sm font-bold text-slate-100">
            {title ?? "Specialist Tracker"}
          </span>
        </div>

        {/* Page title (desktop) */}
        <span className="hidden lg:block text-sm font-semibold text-slate-100">
          {title}
        </span>

        <div className="flex-1" />

        {/* User */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted hidden sm:block capitalize">
            {user?.role}
          </span>
          <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-sm font-bold">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <button
            onClick={signOut}
            className="text-muted hover:text-white text-xs transition-colors hidden sm:block"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Mobile bottom nav (rendered via CSS fixed positioning in MobileNav) */}
    </header>
  );
}

// ─── Mobile bottom navigation ────────────────────────────────────────────────

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border lg:hidden z-40">
      <div className="flex">
        {NAV_ITEMS.slice(0, 5).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
              isActive(item.href) ? "text-accent" : "text-muted"
            )}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[9px] font-medium leading-none">
              {item.label.split(" ")[0]}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
