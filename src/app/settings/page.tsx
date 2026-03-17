"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/lib/auth";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";
import { localGet, localSet, STORAGE_KEYS, setCloudUserId } from "@/lib/amplify";
import { cloudSetImmediate, cloudGet } from "@/lib/supabaseData";
import { getCloudKey } from "@/lib/amplify";
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
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const handleSyncToCloud = async () => {
    if (!user?.id || user.id === "local-dev") return;
    setSyncing(true);
    setCloudUserId(user.id);

    try {
      // Sync all sport data from localStorage to Supabase
      const sportKeys: (keyof typeof STORAGE_KEYS)[] = ["FG", "PUNT", "KICKOFF", "LONGSNAP", "TEAM"];
      for (const key of sportKeys) {
        const local = localGet(key);
        if (local) {
          await cloudSetImmediate(user.id, getCloudKey(key), local);
        }
      }

      // Sync settings
      const settingsKeys = ["fgSettings", "puntSettings", "st_team_v1"];
      for (const key of settingsKeys) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            await cloudSetImmediate(user.id, `settings_${key}`, parsed);
          }
        } catch {}
      }

      setSyncDone(true);
      setTimeout(() => setSyncDone(false), 3000);
    } catch (err) {
      alert("Sync failed. Check console for details.");
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

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

    // Try loading from Supabase
    loadSettingsFromCloud<{ name: string; school: string; config: { enabledSports: string[] } }>("st_team_v1").then((cloud) => {
      if (cloud) {
        if (cloud.name) setTeamName(cloud.name);
        if (cloud.school) setSchool(cloud.school);
        if (cloud.config?.enabledSports) setEnabledSports(cloud.config.enabledSports);
      }
    });
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
    saveSettingsToCloud("st_team_v1", team);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
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
                <span className="text-make text-xs">Supabase Cloud Sync</span>
              </div>
            </div>
            <p className="text-xs text-muted">
              Data is synced to the cloud and persists across devices and deployments.
            </p>
          </div>

          {/* Team Code */}
          {isCoach && user?.id && user.id !== "local-dev" && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Team Code
              </p>
              <p className="text-xs text-muted">
                Share this code with your athletes so they can link to your team during sign up.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-surface-2 border border-border rounded-input px-3 py-2 text-sm font-mono text-accent select-all">
                  {user.id}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(user.id);
                    alert("Team code copied!");
                  }}
                  className="btn-ghost text-xs py-2 px-4"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {/* Cloud Sync */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Cloud Sync
            </p>
            <p className="text-xs text-muted">
              Push all local data (sessions, stats, settings) to the cloud. Use this if you have existing data in your browser that needs to be backed up.
            </p>
            <button
              onClick={handleSyncToCloud}
              disabled={syncing || !user?.id || user.id === "local-dev"}
              className={clsx(
                "w-full py-3 rounded-input text-sm font-bold transition-all",
                syncDone
                  ? "bg-make text-slate-900"
                  : syncing
                    ? "bg-surface-2 text-muted border border-border cursor-wait"
                    : "bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30"
              )}
            >
              {syncDone ? "✓ All Data Synced!" : syncing ? "Syncing..." : "Sync Local Data to Cloud"}
            </button>
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
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <SettingsContent />
      <MobileNav />
    </div>
  );
}
