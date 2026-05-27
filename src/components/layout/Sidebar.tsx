"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useTeamLogo } from "@/lib/useTeamLogo";
import { getTeamId } from "@/lib/teamData";
import { getTeamSettings } from "@/lib/teamSettingsStore";
import { useTutorial } from "@/components/ui/Tutorial";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import clsx from "clsx";

const NAV_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode; disabled?: boolean; tutorialId?: string }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "⚡" },
  { href: "/kicking", label: "FG Kicking", iconEl: <GoalpostIcon size={20} />, tutorialId: "nav-kicking" },
  { href: "/punting", label: "Punting", iconEl: <PuntFootIcon size={20} />, tutorialId: "nav-punting" },
  { href: "/kickoff", label: "Kickoff", iconEl: <KickoffTeeIcon size={20} />, tutorialId: "nav-kickoff" },
  { href: "/longsnap", label: "Snapping", icon: "📏" },
  { href: "/analytics", label: "Analytics", icon: "📊", tutorialId: "nav-analytics" },
  { href: "/archives", label: "Archived Stats", icon: "🗄" },
];

const COACH_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { href: "/athletes", label: "Athletes", icon: "👥" },
  { href: "#invite", label: "Invite", icon: "✉️" },
  { href: "/trash", label: "Deleted Sessions", icon: "🗑" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const ATHLETE_NAV_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { href: "/athlete", label: "Athlete Home", icon: "⚡" },
  { href: "/athlete/kicking", label: "FG Kicking", iconEl: <GoalpostIcon size={20} /> },
  { href: "/athlete/punting", label: "Punting", iconEl: <PuntFootIcon size={20} /> },
  { href: "/athlete/kickoff", label: "Kickoff", iconEl: <KickoffTeeIcon size={20} /> },
  { href: "/athlete/longsnap", label: "Snapping", icon: "📏" },
  { href: "/athlete/athletes", label: "Athletes", icon: "👥" },
  { href: "/athlete/archives", label: "Archives", icon: "🗄" },
];

const SCOUT_NAV_ITEMS: { href: string; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { href: "/scout", label: "Scout Home", icon: "⚡" },
  { href: "/scout/fg", label: "FG Scouting", iconEl: <GoalpostIcon size={20} /> },
  { href: "/scout/punt", label: "Punt Scouting", iconEl: <PuntFootIcon size={20} /> },
  { href: "/scout/kickoff", label: "KO Scouting", iconEl: <KickoffTeeIcon size={20} /> },
  { href: "/scout/snap", label: "Snap Scouting", icon: "📏" },
  { href: "/scout/athletes", label: "Athlete Profiles", icon: "👥" },
  { href: "/scout/archives", label: "Scout Archives", icon: "🗄" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, isCoach, signOut, setDemoRole } = useAuth();
  const { logo, uploadLogo } = useTeamLogo();
  const { show: showTutorial } = useTutorial();
  const fileRef = useRef<HTMLInputElement>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamCode, setTeamCode] = useState("");
  const [teamName, setTeamName] = useState("");

  useEffect(() => {
    const tid = getTeamId();
    if (tid) {
      setTeamCode(tid);
      getTeamSettings(tid).then((s) => { if (s?.name) setTeamName(s.name); });
    }
  }, []);

  const sendInvite = (role: "coach" | "athlete") => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    const signupUrl = `${baseUrl}/signup?role=${role}&team=${teamCode}`;
    const roleLabel = role === "coach" ? "Coach" : "Athlete";
    const subject = encodeURIComponent(`You're invited to ${teamName || "Specialist Tracker"}`);
    const body = encodeURIComponent(
`You've been invited to join ${teamName || "the team"} on Specialist Tracker as a ${roleLabel}.

Click the link below to create your account:
${signupUrl}

${role === "athlete" ? `Your Team Code: ${teamCode}\n\nYou'll need this code during signup.\n` : `Your Team Code: ${teamCode}\n\nUse this to join the existing team as a coach.\n`}
— ${teamName || "Specialist Tracker"}`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    setInviteOpen(false);
  };

  const isScoutRoute = pathname.startsWith("/scout");
  const isAthleteRoute = pathname.startsWith("/athlete/") || pathname === "/athlete";

  const isActive = (href: string) =>
    href === "/dashboard" || href === "/scout" || href === "/athlete"
      ? pathname === href
      : pathname === href || pathname.startsWith(href + "/");

  const handleLogoClick = () => {
    if (isCoach) fileRef.current?.click();
  };

  return (
    <>
    <aside className="fixed left-0 top-0 h-screen w-56 bg-surface border-r border-border flex flex-col z-40 hidden lg:flex">
      {/* Logo */}
      <div className="px-4 border-b border-border h-14 flex items-center">
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
              <img src="/logo-mark.svg" alt="Specialist Tracker" className="w-full h-full" />
            )}
          </button>
          <div>
            <p className="text-sm font-extrabold text-white leading-none uppercase" style={{ letterSpacing: "-0.04em" }}>{isScoutRoute ? "Scout" : isAthleteRoute ? "Athlete" : "Specialist"}</p>
            <p className={clsx("text-[10px] font-medium leading-none mt-1 uppercase", isScoutRoute ? "text-amber-400" : isAthleteRoute ? "text-sky-400" : "text-accent")} style={{ letterSpacing: "0.18em" }}>{isScoutRoute ? "Mode" : isAthleteRoute ? "Mode" : "Tracker"}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {isScoutRoute ? (
          <>
            <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-widest px-3 py-1.5">Scout Mode</p>
            {SCOUT_NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={clsx(isActive(item.href) ? "nav-link-active" : "nav-link")}>
                {item.iconEl ?? <span className="text-base leading-none">{item.icon}</span>}
                {item.label}
              </Link>
            ))}
          </>
        ) : isAthleteRoute ? (
          <>
            <p className="text-[10px] font-semibold text-sky-400 uppercase tracking-widest px-3 py-1.5">Athlete Mode</p>
            {ATHLETE_NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={clsx(isActive(item.href) ? "nav-link-active" : "nav-link")}>
                {item.iconEl ?? <span className="text-base leading-none">{item.icon}</span>}
                {item.label}
              </Link>
            ))}
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 py-1.5">
              Sports
            </p>
            {NAV_ITEMS.map((item) =>
              item.disabled ? (
                <div
                  key={item.label}
                  className="nav-link opacity-40 cursor-not-allowed relative"
                >
                  {item.iconEl ?? <span className="text-base leading-none">{item.icon}</span>}
                  <span className="line-through">{item.label}</span>
                  <span className="absolute right-2 text-[8px] font-bold text-warn uppercase tracking-wider">Under Construction</span>
                </div>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    isActive(item.href) ? "nav-link-active" : "nav-link"
                  )}
                  {...(item.tutorialId ? { "data-tutorial": item.tutorialId } : {})}
                >
                  {item.iconEl ?? <span className="text-base leading-none">{item.icon}</span>}
                  {item.label}
                </Link>
              )
            )}

            {isCoach && (
              <>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-widest px-3 pt-4 pb-1.5">
                  Management
                </p>
                {COACH_ITEMS.map((item) => (
                  item.href === "#invite" ? (
                    <button
                      key={item.href}
                      onClick={() => setInviteOpen(true)}
                      className="nav-link w-full text-left"
                    >
                      <span className="text-base leading-none">{item.icon}</span>
                      {item.label}
                    </button>
                  ) : (
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
                  )
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* Tutorial */}
      {!isScoutRoute && !isAthleteRoute && (
        <div className="px-3 pb-1">
          <button
            onClick={showTutorial}
            className="nav-link w-full text-left"
          >
            <span className="text-base leading-none">&#x1F393;</span>
            Tutorial
          </button>
        </div>
      )}

      {/* User info */}
      <div className="p-3 border-t border-border space-y-2">
        <Link href="/profile" className="flex items-center gap-2 px-1 rounded-input hover:bg-surface-2 py-1 -my-1 transition-colors">
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

    {/* Invite popup */}
    {inviteOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setInviteOpen(false)} />
        <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Invite to {teamName || "Team"}</h3>
            <button onClick={() => setInviteOpen(false)} className="text-muted hover:text-white text-xs">Close</button>
          </div>
          <p className="text-xs text-muted">Choose who you want to invite. This will open your email app with a pre-written message.</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => sendInvite("coach")}
              className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6 px-3"
            >
              <span className="text-2xl mb-2">🏈</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent">Coach</span>
              <span className="text-[10px] text-muted mt-1">Full access</span>
            </button>
            <button
              onClick={() => sendInvite("athlete")}
              className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6 px-3"
            >
              <span className="text-2xl mb-2">🏃</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-sky-400">Athlete</span>
              <span className="text-[10px] text-muted mt-1">View & chart</span>
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
