"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import clsx from "clsx";

const SCOUT_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/scout/fg", label: "FG Scouting", iconEl: <GoalpostIcon size={20} /> },
  { href: "/scout/punt", label: "Punt Scouting", iconEl: <PuntFootIcon size={20} /> },
  { href: "/scout/kickoff", label: "KO Scouting", iconEl: <KickoffTeeIcon size={20} /> },
  { href: "/scout/snap", label: "Snap Scouting", icon: "📏" },
  { href: "/scout/archives", label: "Scout Archives", icon: "🗄" },
];

const MOBILE_NAV = [
  { href: "/dashboard", label: "Home", icon: "⚡" },
  { href: "/scout/fg", label: "FG", iconEl: <GoalpostIcon size={20} /> },
  { href: "/scout/punt", label: "Punt", iconEl: <PuntFootIcon size={20} /> },
  { href: "/scout/kickoff", label: "KO", iconEl: <KickoffTeeIcon size={20} /> },
  { href: "/scout/snap", label: "Snap", icon: "📏" },
];

export default function ScoutLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-56 bg-surface border-r border-border flex flex-col z-40 hidden lg:flex">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-sm font-bold flex-shrink-0">
              S
            </div>
            <div>
              <p className="text-sm font-bold text-slate-100 leading-none">Scout Mode</p>
              <p className="text-xs text-amber-400 leading-none mt-0.5">Evaluation</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 py-1.5">
            Scouting
          </p>
          {SCOUT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                isActive(item.href) ? "nav-link-active" : "nav-link"
              )}
            >
              {item.iconEl ?? <span className="text-base leading-none">{item.icon}</span>}
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-2">
          <Link
            href="/profile"
            className="flex items-center gap-2 px-1 rounded-input hover:bg-surface-2 py-1 -my-1 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent text-xs font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-slate-200 truncate">
                {user?.name ?? "Guest"}
              </p>
              <p className="text-[10px] text-muted capitalize">{user?.role}</p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-56 min-h-screen min-w-0 flex-1 pb-20 lg:pb-0">
        {children}
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border lg:hidden z-40">
        <div className="flex">
          {MOBILE_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors",
                isActive(item.href) ? "text-accent" : "text-muted"
              )}
            >
              {item.iconEl ?? <span className="text-lg leading-none">{item.icon}</span>}
              <span className="text-[9px] font-medium leading-none">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
