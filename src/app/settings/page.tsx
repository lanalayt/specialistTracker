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
import { FGProvider, useFG } from "@/lib/fgContext";
import { PuntProvider, usePunt } from "@/lib/puntContext";
import { KickoffProvider, useKickoff } from "@/lib/kickoffContext";
import { createArchive } from "@/lib/archiveManager";
import { teamGet, getTeamId } from "@/lib/teamData";
import { PRESETS, DEFAULT_THEME, saveTheme, loadAndApplyTheme, type ThemeColors } from "@/lib/themeColors";
import clsx from "clsx";

const SPORT_OPTIONS = [
  { id: "KICKING", label: "FG Kicking", icon: "🏈" },
  { id: "PUNTING", label: "Punting", icon: "👟" },
  { id: "KICKOFF", label: "Kickoff", icon: "🎯" },
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
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullDone, setPullDone] = useState<string | null>(null);

  const handlePullFromCloud = async () => {
    setPulling(true);
    setPullDone(null);
    try {
      const tid = getTeamId();
      if (!tid || tid === "local-dev") {
        alert("No team ID — make sure you're signed in.");
        setPulling(false);
        return;
      }
      // Fetch each phase from team_data
      const [fgData, puntData, kickoffData] = await Promise.all([
        teamGet<{ athletes: string[]; stats: Record<string, unknown>; history: unknown[] }>(tid, "fg_data"),
        teamGet<{ athletes: string[]; stats: Record<string, unknown>; history: unknown[] }>(tid, "punt_data"),
        teamGet<{ athletes: string[]; stats: Record<string, unknown>; history: unknown[] }>(tid, "kickoff_data"),
      ]);
      // Write to localStorage so contexts pick them up on reload
      if (fgData) localStorage.setItem("st_fg_v1", JSON.stringify(fgData));
      if (puntData) localStorage.setItem("st_punt_v1", JSON.stringify(puntData));
      if (kickoffData) localStorage.setItem("st_kickoff_v1", JSON.stringify(kickoffData));
      const fgCount = (fgData?.history as unknown[] | undefined)?.length ?? 0;
      const puntCount = (puntData?.history as unknown[] | undefined)?.length ?? 0;
      const koCount = (kickoffData?.history as unknown[] | undefined)?.length ?? 0;
      setPullDone(`FG: ${fgCount} · Punt: ${puntCount} · KO: ${koCount}`);
      // Reload so every context reads fresh data from localStorage
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      console.error(err);
      alert("Pull failed. Check console.");
    } finally {
      setPulling(false);
    }
  };

  // Theme
  const [theme, setTheme] = useState<ThemeColors>(() =>
    typeof window !== "undefined" ? loadAndApplyTheme() : DEFAULT_THEME
  );
  const [customAccent, setCustomAccent] = useState(theme.accent);

  const handlePreset = (colors: ThemeColors) => {
    setTheme(colors);
    setCustomAccent(colors.accent);
    saveTheme(colors);
  };

  const handleCustomAccent = (hex: string) => {
    setCustomAccent(hex);
    // Derive bg/surface/border from accent hue
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const custom: ThemeColors = {
      accent: hex,
      bg: `rgb(${Math.round(r * 0.04)}, ${Math.round(g * 0.06)}, ${Math.round(b * 0.08)})`,
      surface: `rgb(${Math.round(r * 0.08)}, ${Math.round(g * 0.11)}, ${Math.round(b * 0.15)})`,
      surface2: `rgb(${Math.round(r * 0.10)}, ${Math.round(g * 0.15)}, ${Math.round(b * 0.21)})`,
      border: `rgb(${Math.round(r * 0.12)}, ${Math.round(g * 0.19)}, ${Math.round(b * 0.26)})`,
    };
    setTheme(custom);
    saveTheme(custom);
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

          {/* Theme / Colors */}
          <div className="card space-y-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Theme Colors
            </p>
            <p className="text-xs text-muted">Pick a preset or choose a custom accent color. The whole site updates instantly.</p>

            {/* Preset grid */}
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handlePreset(p.colors)}
                  className={clsx(
                    "flex flex-col items-center gap-1.5 p-2.5 rounded-input border transition-all",
                    theme.accent === p.colors.accent
                      ? "border-accent/60 bg-accent/10"
                      : "border-border hover:border-accent/40 hover:bg-surface-2"
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-full border-2 border-white/20"
                    style={{ backgroundColor: p.colors.accent }}
                  />
                  <span className="text-[10px] text-slate-300 font-medium leading-tight text-center">{p.name}</span>
                </button>
              ))}
            </div>

            {/* Custom color picker */}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted whitespace-nowrap">Custom accent:</label>
              <input
                type="color"
                value={customAccent}
                onChange={(e) => handleCustomAccent(e.target.value)}
                className="w-10 h-10 rounded-input border border-border cursor-pointer bg-transparent"
              />
              <span className="text-xs text-slate-300 font-mono">{customAccent}</span>
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
            <button
              onClick={handlePullFromCloud}
              disabled={pulling}
              className={clsx(
                "w-full py-3 rounded-input text-sm font-bold transition-all",
                pullDone
                  ? "bg-make text-slate-900"
                  : pulling
                    ? "bg-surface-2 text-muted border border-border cursor-wait"
                    : "bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30"
              )}
            >
              {pullDone ? `✓ Pulled! ${pullDone} — reloading…` : pulling ? "Pulling..." : "↓ Pull Latest from Cloud"}
            </button>
            <p className="text-[10px] text-muted">
              Forces this device to re-download all FG, Punt, and Kickoff data from the cloud, then reloads.
            </p>
          </div>

          {/* Cloud Sync */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">
              Push Local → Cloud
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
              {syncDone ? "✓ All Data Synced!" : syncing ? "Syncing..." : "↑ Push Local Data to Cloud"}
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
