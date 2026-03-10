"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import clsx from "clsx";

const TABS = [
  { label: "Session", slug: "session", coachOnly: true },
  { label: "Statistics", slug: "statistics", coachOnly: false },
  { label: "History", slug: "history", coachOnly: false },
  { label: "Athletes", slug: "athletes", coachOnly: true },
];

interface SportSubNavProps {
  basePath: string;
  extraTabs?: { label: string; slug: string }[];
}

export function SportSubNav({ basePath, extraTabs }: SportSubNavProps) {
  const { isAthlete } = useAuth();
  // Extra tabs (like Settings) are coach-only
  const extraWithRole = (extraTabs ?? []).map((t) => ({ ...t, coachOnly: true }));
  const allTabs = [...TABS, ...extraWithRole];
  const visibleTabs = isAthlete ? allTabs.filter((t) => !t.coachOnly) : allTabs;
  const pathname = usePathname();

  return (
    <div className="sticky top-14 z-20 bg-surface border-b border-border overflow-x-auto shrink-0">
      <div className="flex">
        {visibleTabs.map((tab) => {
          const href = `${basePath}/${tab.slug}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={tab.slug}
              href={href}
              className={clsx(
                "px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                isActive
                  ? "text-accent border-accent"
                  : "text-muted border-transparent hover:text-slate-300"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
