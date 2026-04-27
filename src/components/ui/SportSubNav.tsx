"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import clsx from "clsx";

const TABS = [
  { label: "Session", slug: "session", coachOnly: false },
  { label: "Statistics", slug: "statistics", coachOnly: false },
  { label: "History", slug: "history", coachOnly: false },
  { label: "Athletes", slug: "athletes", coachOnly: true },
];

interface SportSubNavProps {
  basePath: string;
  extraTabs?: { label: string; slug: string }[];
  tabs?: { label: string; slug: string; coachOnly: boolean }[];
}

export function SportSubNav({ basePath, extraTabs, tabs }: SportSubNavProps) {
  const { isAthlete } = useAuth();
  // Extra tabs (like Settings) are coach-only
  const extraWithRole = (extraTabs ?? []).map((t) => ({ ...t, coachOnly: true }));
  const allTabs = tabs ?? [...TABS, ...extraWithRole];
  const visibleTabs = isAthlete ? allTabs.filter((t) => !t.coachOnly) : allTabs;
  const pathname = usePathname();

  return (
    <div className="sticky top-14 z-20 bg-surface border-b border-border overflow-x-auto shrink-0" data-tutorial="sport-subnav">
      <div className="flex">
        {visibleTabs.map((tab) => {
          const href = `${basePath}/${tab.slug}`;
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={tab.slug}
              href={href}
              data-tutorial={`subnav-${tab.slug}`}
              className={clsx(
                "px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px",
                isActive
                  ? "text-accent border-accent"
                  : "text-muted border-transparent hover:text-white"
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
