"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { createArchive } from "@/lib/archiveManager";
import { teamGet, getTeamId } from "@/lib/teamData";
import { PRESETS, DEFAULT_THEME, saveTheme, loadAndApplyTheme, type ThemeColors } from "@/lib/themeColors";
import clsx from "clsx";

import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";
import React from "react";

const SPORT_OPTIONS: { id: string; label: string; icon?: string; iconEl?: React.ReactNode }[] = [
  { id: "KICKING", label: "FG Kicking", iconEl: <GoalpostIcon size={20} /> },
  { id: "PUNTING", label: "Punting", iconEl: <PuntFootIcon size={20} /> },
  { id: "KICKOFF", label: "Kickoff", iconEl: <KickoffTeeIcon size={20} /> },
  { id: "LONGSNAP", label: "Long Snapping", icon: "📏" },
];

function SettingsContent() {
  const { user, isCoach } = useAuth();
  const fg = useFG();
  const punt = usePunt();
  const kickoff = useKickoff();
  const [teamName, setTeamName] = useState("Special Teams");
  const [school, setSchool] = useState("My School");
  const [enabledSports, setEnabledSports] = useState<string[]>(["KICKING", "PUNTING", "KICKOFF", "LONGSNAP"]);
  const [saved, setSaved] = useState(false);

  // Theme
  const [theme, setTheme] = useState<ThemeColors>(() =>
    typeof window !== "undefined" ? loadAndApplyTheme() : DEFAULT_THEME
  );

  const handlePreset = (colors: ThemeColors) => {
    setTheme(colors);
    saveTheme(colors);
  };

  const handleColorChange = (field: keyof ThemeColors, hex: string) => {
    const next = { ...theme, [field]: hex };
    setTheme(next);
    saveTheme(next);
  };

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const handleChangePassword = async () => {
    setPwMsg(null);
    if (newPw.length < 6) {
      setPwMsg({ type: "err", text: "New password must be at least 6 characters." });
      return;
    }
    if (newPw !== confirmPw) {
      setPwMsg({ type: "err", text: "New passwords do not match." });
      return;
    }
    setPwLoading(true);
    try {
      const supabase = createClient();
      // Verify current password by re-authenticating
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email ?? "",
        password: currentPw,
      });
      if (signInErr) {
        setPwMsg({ type: "err", text: "Current password is incorrect." });
        setPwLoading(false);
        return;
      }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw new Error(updateErr.message);
      setPwMsg({ type: "ok", text: "Password updated successfully!" });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update password";
      setPwMsg({ type: "err", text: msg });
    } finally {
      setPwLoading(false);
    }
  };

  // Archive UI state
  const [archiveName, setArchiveName] = useState("");
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveDone, setArchiveDone] = useState(false);

  const handleArchiveClick = () => {
    if (!archiveName.trim()) {
      alert("Please enter a name for the archive.");
      return;
    }
    setShowArchiveConfirm(true);
  };

  const handleConfirmArchive = async () => {
    setArchiving(true);
    try {
      await createArchive(
        archiveName.trim(),
        { athletes: fg.athletes, stats: fg.stats, history: fg.history },
        { athletes: punt.athletes, stats: punt.stats, history: punt.history },
        { athletes: kickoff.athletes, stats: kickoff.stats, history: kickoff.history }
      );
      fg.resetStatsKeepAthletes();
      punt.resetStatsKeepAthletes();
      kickoff.resetStatsKeepAthletes();
      setShowArchiveConfirm(false);
      setArchiveName("");
      setArchiveDone(true);
      setTimeout(() => setArchiveDone(false), 3000);
    } catch (err) {
      console.error(err);
      alert("Archive failed. Check console.");
    } finally {
      setArchiving(false);
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

          {/* Theme / Colors */}
          <div className="card space-y-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              School Colors
            </p>
            <p className="text-xs text-muted">Pick a preset or choose your school&apos;s colors below. Changes apply instantly.</p>

            {/* Preset grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {PRESETS.map((p) => {
                const isActive = theme.primary === p.colors.primary && theme.secondary === p.colors.secondary;
                return (
                  <button
                    key={p.name}
                    onClick={() => handlePreset(p.colors)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 p-2 rounded-input border transition-all",
                      isActive
                        ? "border-accent/60 bg-accent/10 ring-1 ring-accent/40"
                        : "border-border hover:border-accent/40 hover:bg-surface-2"
                    )}
                  >
                    <div className="flex gap-1">
                      <div className="w-5 h-5 rounded-full border border-white/20" style={{ backgroundColor: p.colors.primary }} />
                      <div className="w-5 h-5 rounded-full border border-white/20" style={{ backgroundColor: p.colors.secondary }} />
                      <div className="w-5 h-5 rounded-full border border-white/20" style={{ backgroundColor: p.colors.tertiary }} />
                    </div>
                    <span className="text-[9px] text-slate-300 font-medium leading-tight text-center">{p.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom 3-color pickers */}
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Custom Colors</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-1.5">
                  <input
                    type="color"
                    value={theme.primary}
                    onChange={(e) => handleColorChange("primary", e.target.value)}
                    className="w-12 h-12 rounded-input border-2 border-border cursor-pointer bg-transparent"
                  />
                  <span className="text-[10px] text-muted font-semibold">Primary</span>
                  <span className="text-[9px] text-slate-400 font-mono">{theme.primary}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <input
                    type="color"
                    value={theme.secondary}
                    onChange={(e) => handleColorChange("secondary", e.target.value)}
                    className="w-12 h-12 rounded-input border-2 border-border cursor-pointer bg-transparent"
                  />
                  <span className="text-[10px] text-muted font-semibold">Background</span>
                  <span className="text-[9px] text-slate-400 font-mono">{theme.secondary}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <input
                    type="color"
                    value={theme.tertiary}
                    onChange={(e) => handleColorChange("tertiary", e.target.value)}
                    className="w-12 h-12 rounded-input border-2 border-border cursor-pointer bg-transparent"
                  />
                  <span className="text-[10px] text-muted font-semibold">Borders</span>
                  <span className="text-[9px] text-slate-400 font-mono">{theme.tertiary}</span>
                </div>
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
                  {s.iconEl ?? <span className="text-xl">{s.icon}</span>}
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

          {/* Change Password */}
          {user && user.id !== "local-dev" && (
            <div className="card space-y-3">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Change Password
              </p>
              {pwMsg && (
                <div className={clsx(
                  "text-sm rounded-input px-3 py-2",
                  pwMsg.type === "ok" ? "bg-make/10 border border-make/30 text-make" : "bg-miss/10 border border-miss/30 text-miss"
                )}>
                  {pwMsg.text}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="label">Current Password</label>
                  <input
                    className="input"
                    type="password"
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input
                    className="input"
                    type="password"
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label">Confirm New Password</label>
                  <input
                    className="input"
                    type="password"
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <button
                  onClick={handleChangePassword}
                  disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                  className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pwLoading ? "Updating…" : "Update Password"}
                </button>
              </div>
            </div>
          )}

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

          {/* Archive Stats */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Archive Stats
            </p>
            <p className="text-xs text-muted">
              Save a snapshot of all current stats (FG, Punt, Kickoff) under a name, then reset all stats back to 0. Archived snapshots stay available under Archived Stats in the sidebar.
            </p>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="e.g. 2025 Season, Fall Camp, etc."
                value={archiveName}
                onChange={(e) => setArchiveName(e.target.value)}
              />
              <button
                onClick={handleArchiveClick}
                disabled={!archiveName.trim() || archiving}
                className={clsx(
                  "px-4 py-2 rounded-input text-sm font-semibold transition-all",
                  archiveDone
                    ? "bg-make text-slate-900"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/50 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                )}
              >
                {archiveDone ? "✓ Archived!" : "Archive"}
              </button>
            </div>
          </div>

          {/* Device / Sync diagnostics */}
          <div className="card space-y-2">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Device Sync</p>
            <p className="text-xs text-muted">
              Both devices need to be signed in to the <span className="text-accent font-semibold">same account</span> to share data. If one device isn&apos;t showing the same stats, verify the email below matches on both devices.
            </p>
            <div className="bg-surface-2 border border-border rounded-input p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted">Signed in as</span>
                <span className="text-slate-200 font-medium truncate ml-2">{user?.email ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Role</span>
                <span className="text-slate-200 capitalize">{user?.role ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Team ID</span>
                <code className="text-accent text-[10px] truncate ml-2 max-w-[180px]">{getTeamId() ?? "not set"}</code>
              </div>
            </div>
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

      {/* Archive confirmation modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-sm w-full space-y-4">
            <div>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Confirm Archive</p>
              <h3 className="text-base font-bold text-slate-100 mt-1">Archive all current stats?</h3>
            </div>
            <p className="text-xs text-muted">
              This will save a snapshot named <span className="text-accent font-semibold">&quot;{archiveName}&quot;</span> containing all current FG, Punt, and Kickoff stats and session history, then reset all current stats and history back to zero. Athletes will be kept.
            </p>
            <p className="text-xs text-muted">
              You can view archived snapshots under <span className="text-slate-300">Archived Stats</span> in the sidebar.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                disabled={archiving}
                className="flex-1 py-2 rounded-input text-sm font-semibold border border-border text-muted hover:text-white hover:bg-surface-2 transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmArchive}
                disabled={archiving}
                className="flex-1 py-2 rounded-input text-sm font-bold bg-amber-500 text-slate-900 hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-wait"
              >
                {archiving ? "Archiving..." : "Confirm Archive"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <FGProvider>
      <PuntProvider>
        <KickoffProvider>
          <div className="flex overflow-x-hidden max-w-[100vw]">
            <Sidebar />
            <SettingsContent />
            <MobileNav />
          </div>
        </KickoffProvider>
      </PuntProvider>
    </FGProvider>
  );
}
