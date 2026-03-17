"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeamLogo } from "@/lib/useTeamLogo";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/kicking", label: "FG Kicking", icon: "🏈" },
  { href: "/punting", label: "Punting", icon: "👟" },
  { href: "/kickoff", label: "Kickoff", icon: "🎯" },
  { href: "/longsnap", label: "Long Snap", icon: "📏" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
];

const COACH_ITEMS = [
  { href: "/athletes", label: "Athletes", icon: "👥" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isCoach, signOut, setDemoRole } = useAuth();
  const { logo, uploadLogo } = useTeamLogo();
  const fileRef = useRef<HTMLInputElement>(null);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const handleLogoClick = () => {
    if (isCoach) fileRef.current?.click();
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-surface border-r border-border flex flex-col z-40 hidden lg:flex">
      {/* Logo */}
      <div className="p-5 border-b border-border">
        <div className="flex items-center gap-2.5">
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
            onClick={handleLogoClick}
            className={clsx(
              "w-8 h-8 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0",
              isCoach && "cursor-pointer hover:ring-2 hover:ring-accent/50 transition-all",
              !logo && "bg-accent text-bg font-bold text-sm"
            )}
            title={isCoach ? "Upload team logo" : undefined}
          >
            {logo ? (
              <img src={logo} alt="Team logo" className="w-full h-full object-cover" />
            ) : (
              "ST"
            )}
          </button>
          <div>
            <p className="text-sm font-bold text-slate-100 leading-none">Specialist</p>
            <p className="text-xs text-muted leading-none mt-0.5">Tracker</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 py-1.5">
          Sports
        </p>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              isActive(item.href) ? "nav-link-active" : "nav-link"
            )}
          >
            <span className="text-base leading-none">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {isCoach && (
          <>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 pt-4 pb-1.5">
              Management
            </p>
            {COACH_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(
                  isActive(item.href) ? "nav-link-active" : "nav-link"
                )}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User info */}
      <div className="p-3 border-t border-border space-y-2">
        {/* User info */}
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-200 truncate">
              {user?.name ?? "Guest"}
            </p>
            <p className="text-[10px] text-muted capitalize">{user?.role}</p>
          </div>
          <button
            onClick={signOut}
            className="text-muted hover:text-slate-300 text-xs transition-colors"
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>
    </aside>
  );
}
