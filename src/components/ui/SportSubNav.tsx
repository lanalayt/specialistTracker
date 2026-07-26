"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import clsx from "clsx";

interface SubNavTab {
  label: string;
  slug: string;
  coachOnly: boolean;
  disabled?: boolean;
}

const TABS: SubNavTab[] = [
  { label: "Session", slug: "session", coachOnly: false },
  { label: "Statistics", slug: "statistics", coachOnly: false },
  { label: "History", slug: "history", coachOnly: false },
  { label: "Athletes", slug: "athletes", coachOnly: true },
];

interface SportSubNavProps {
  basePath: string;
  extraTabs?: { label: string; slug: string; disabled?: boolean }[];
  tabs?: { label: string; slug: string; coachOnly: boolean; disabled?: boolean }[];
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
        <Link
          href={basePath}
          className="px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px text-muted border-transparent hover:text-white"
        >
          &larr;
        </Link>
        {visibleTabs.map((tab) => {
          if (tab.disabled) {
            return (
              <span
                key={tab.slug}
                title="Coming soon"
                aria-disabled="true"
                className="px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px text-muted/50 border-transparent cursor-not-allowed flex items-center gap-1.5"
              >
                {tab.label}
                <span className="text-[10px] font-semibold uppercase tracking-wide bg-surface-2 text-muted rounded px-1.5 py-0.5">
                  Soon
                </span>
              </span>
            );
          }
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
