"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/lib/auth";
import clsx from "clsx";

const SPORT_OPTIONS = [
  { id: "KICKING", label: "FG Kicking", icon: "🏈" },
  { id: "PUNTING", label: "Punting", icon: "👟" },
  { id: "KICKOFF", label: "Kickoff", icon: "🎯" },
  { id: "LONGSNAP", label: "Long Snapping", icon: "📏" },
];

function SettingsContent() {
  const { user, isCoach } = useAuth();
  const [teamName, setTeamName] = useState("Special Teams");
  const [school, setSchool] = useState("My School");
  const [enabledSports, setEnabledSports] = useState<string[]>(["KICKING", "PUNTING", "KICKOFF", "LONGSNAP"]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("st_team_v1");
      if (raw) {
        const t = JSON.parse(raw);
        if (t.name) setTeamName(t.name);
        if (t.school) setSchool(t.school);
        if (t.config?.enabledSports) setEnabledSports(t.config.enabledSports);
      }
    } catch {}
  }, []);

  const toggleSport = (id: string) =>
    setEnabledSports((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const handleSave = () => {
    const team = {
      id: "demo-team-1",
      name: teamName,
      school,
      config: { enabledSports },
    };
    localStorage.setItem("st_team_v1", JSON.stringify(team));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="lg:pl-56 min-h-screen pb-20 lg:pb-0">
      <Header title="Settings" />

      <main className="p-4 lg:p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Settings</h1>
          <p className="text-sm text-muted mt-1">Team configuration</p>
        </div>

        <RoleGuard coachOnly fallback={
          <div className="card text-sm text-muted">Settings are only accessible to coaches.</div>
        }>
          {/* Team info */}
          <div className="card space-y-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Team Info
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Team name</label>
                <input
                  className="input"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>
              <div>
                <label className="label">School</label>
                <input
                  className="input"
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Enabled sports */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Enabled Sport Modules
            </p>
            <div className="space-y-2">
              {SPORT_OPTIONS.map((s) => (
                <label
                  key={s.id}
                  className={clsx(
                    "flex items-center gap-3 p-3 rounded-input border cursor-pointer transition-all",
                    enabledSports.includes(s.id)
                      ? "border-accent/40 bg-accent/5"
                      : "border-border hover:border-border/80"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={enabledSports.includes(s.id)}
                    onChange={() => toggleSport(s.id)}
                    className="accent-accent"
                  />
                  <span className="text-xl">{s.icon}</span>
                  <span className="text-sm font-medium text-slate-200">{s.label}</span>
                  {enabledSports.includes(s.id) && (
                    <span className="badge-make ml-auto">Enabled</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Account info */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Account
            </p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Email</span>
                <span className="text-slate-200">{user?.email ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Role</span>
                <span className="text-slate-200 capitalize">{user?.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Backend</span>
                <span className="text-warn text-xs">Local / Demo Mode</span>
              </div>
            </div>
            <p className="text-xs text-muted">
              To enable cloud sync and multi-user access, configure AWS Amplify and connect your account.
            </p>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className={clsx("btn-primary", saved && "bg-make/90")}
            >
              {saved ? "✓ Saved!" : "Save Settings"}
            </button>
          </div>
        </RoleGuard>
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex">
      <Sidebar />
      <SettingsContent />
      <MobileNav />
    </div>
  );
}
