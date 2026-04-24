"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeamLogo } from "@/lib/useTeamLogo";
import { useTutorial } from "@/components/ui/Tutorial";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import clsx from "clsx";

const NAV_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode; disabled?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/kicking", label: "Kicking", iconEl: <GoalpostIcon size={20} /> },
  { href: "/punting", label: "Punting", iconEl: <PuntFootIcon size={20} /> },
  { href: "/kickoff", label: "Kickoff", iconEl: <KickoffTeeIcon size={20} /> },
  { href: "#", label: "Long Snap", icon: "📏", disabled: true },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/archives", label: "Archived Stats", icon: "🗄" },
];

const COACH_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { href: "/athletes", label: "Athletes", icon: "👥" },
  { href: "/trash", label: "Deleted Sessions", icon: "🗑" },
];

const ALWAYS_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Header({ title }: { title?: string }) {
  const pathname = usePathname();
  const { user, isCoach, signOut } = useAuth();
  const { logo, uploadLogo } = useTeamLogo();
  const { show: showTutorial } = useTutorial();
  const fileRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <>
    <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur border-b border-border">
      <div className="flex items-center gap-4 px-4 h-14">
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
          <span className="text-lg font-extrabold text-slate-100">
            {title ?? "Specialist Tracker"}
          </span>
        </div>

        {/* Page title (desktop) */}
        <span className="hidden lg:block text-lg font-extrabold text-slate-100">
          {title}
        </span>

        <div className="flex-1" />

        {/* User */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted hidden sm:block capitalize">
            {user?.role}
          </span>
          <Link
            href="/profile"
            className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-sm font-bold hover:bg-accent/30 transition-colors"
          >
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </Link>
          <button
            onClick={signOut}
            className="text-muted hover:text-white text-xs transition-colors hidden sm:block"
          >
            Sign out
          </button>
          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="lg:hidden w-8 h-8 rounded-input border border-border flex items-center justify-center text-slate-200 hover:bg-surface-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile bottom nav (rendered via CSS fixed positioning in MobileNav) */}
    </header>
    {/* Mobile drawer — portaled to body so backdrop-blur on header doesn't break fixed positioning */}
    {menuOpen && typeof document !== "undefined" && createPortal(
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute top-0 right-0 bottom-0 w-72 bg-surface border-l border-border flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <p className="text-sm font-bold text-slate-100">Menu</p>
              <button
                onClick={() => setMenuOpen(false)}
                className="w-8 h-8 rounded-input border border-border flex items-center justify-center text-muted hover:text-white hover:bg-surface-2 transition-colors"
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 py-1.5">Sports</p>
              {NAV_ITEMS.map((item) =>
                item.disabled ? (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium opacity-40 cursor-not-allowed"
                  >
                    {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
                    <span className="line-through">{item.label}</span>
                    <span className="ml-auto text-[8px] font-bold text-warn uppercase">Under Construction</span>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium transition-colors",
                      isActive(item.href) ? "bg-accent/15 text-accent border border-accent/30" : "text-slate-200 hover:bg-surface-2"
                    )}
                  >
                    {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
                    {item.label}
                  </Link>
                )
              )}
              {isCoach && (
                <>
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 pt-4 pb-1.5">Management</p>
                  {COACH_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium transition-colors",
                        isActive(item.href) ? "bg-accent/15 text-accent border border-accent/30" : "text-slate-200 hover:bg-surface-2"
                      )}
                    >
                      {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
                      {item.label}
                    </Link>
                  ))}
                </>
              )}
              {/* Settings — always visible */}
              <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 pt-4 pb-1.5">Settings</p>
              {ALWAYS_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium transition-colors",
                    isActive(item.href) ? "bg-accent/15 text-accent border border-accent/30" : "text-slate-200 hover:bg-surface-2"
                  )}
                >
                  {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
                  {item.label}
                </Link>
              ))}
              <button
                onClick={() => { setMenuOpen(false); showTutorial(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-input text-sm font-medium text-slate-200 hover:bg-surface-2 transition-colors w-full text-left"
              >
                <span className="text-lg leading-none">&#x1F393;</span>
                Tutorial
              </button>
            </nav>
            <div className="border-t border-border p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-sm font-bold">
                {user?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-200 truncate">{user?.name ?? "Guest"}</p>
                <p className="text-[10px] text-muted capitalize">{user?.role}</p>
              </div>
              <button
                onClick={() => { setMenuOpen(false); signOut(); }}
                className="text-xs text-muted hover:text-miss transition-colors px-2 py-1"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
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
        {NAV_ITEMS.slice(0, 5).map((item) =>
          item.disabled ? (
            <div
              key={item.label}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 opacity-30 cursor-not-allowed"
            >
              {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
              <span className="text-[7px] font-bold leading-none text-warn">SOON</span>
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
                isActive(item.href) ? "text-accent" : "text-muted"
              )}
            >
              {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
              <span className="text-[9px] font-medium leading-none">
                {item.label.split(" ")[0]}
              </span>
            </Link>
          )
        )}
      </div>
    </nav>
  );
}
