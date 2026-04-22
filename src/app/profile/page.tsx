"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import clsx from "clsx";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  lastSeen: string;
  access?: "view" | "edit";
}

function ProfileContent() {
  const { user, isCoach, signOut } = useAuth();

  // Team members
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Register self as team member + load team members list
  useEffect(() => {
    if (!user || user.id === "local-dev") {
      setMembersLoading(false);
      return;
    }

    async function loadMembers() {
      let tid = getTeamId();
      for (let i = 0; i < 15 && !tid; i++) {
        await new Promise((r) => setTimeout(r, 100));
        tid = getTeamId();
      }
      if (!tid || tid === "local-dev") {
        setMembersLoading(false);
        return;
      }

      // Register self
      const existing = await teamGet<TeamMember[]>(tid, "team_members") ?? [];
      const me: TeamMember = {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        role: user!.role,
        lastSeen: new Date().toISOString(),
      };
      const idx = existing.findIndex((m) => m.id === me.id);
      if (idx >= 0) {
        existing[idx] = me;
      } else {
        existing.push(me);
      }
      teamSet(tid, "team_members", existing);
      setMembers(existing);
      setMembersLoading(false);
    }

    loadMembers();
  }, [user]);

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

  const handleRemoveMember = async (memberId: string) => {
    if (!window.confirm("Remove this member from the team?")) return;
    const tid = getTeamId();
    if (!tid) return;
    const updated = members.filter((m) => m.id !== memberId);
    setMembers(updated);
    teamSet(tid, "team_members", updated);
  };

  const handleToggleAccess = async (memberId: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const updated = members.map((m) => {
      if (m.id !== memberId) return m;
      return { ...m, access: m.access === "edit" ? "view" as const : "edit" as const };
    });
    setMembers(updated);
    teamSet(tid, "team_members", updated);
  };

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Profile" />

      <main className="p-4 lg:p-6 max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Profile</h1>
          <p className="text-sm text-muted mt-1">Account & team management</p>
        </div>

        {/* User info */}
        <div className="card space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-accent/20 border-2 border-accent/40 flex items-center justify-center text-accent text-2xl font-bold">
              {user?.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div>
              <p className="text-lg font-bold text-slate-100">{user?.name ?? "Guest"}</p>
              <p className="text-sm text-muted">{user?.email ?? "—"}</p>
              <p className="text-xs text-accent capitalize font-semibold mt-0.5">{user?.role}</p>
            </div>
          </div>
        </div>

        {/* Team members — coach only */}
        {isCoach && (
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider">
                Team Members
              </p>
              <span className="text-xs text-muted">{members.length} member{members.length !== 1 ? "s" : ""}</span>
            </div>
            {membersLoading ? (
              <p className="text-sm text-muted py-4 text-center">Loading...</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No team members found. Share your team code in Settings so athletes can join.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => {
                  const access = m.access ?? (m.role === "coach" ? "edit" : "view");
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-input border border-border bg-surface-2/50">
                      <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent text-sm font-bold shrink-0">
                        {m.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-200 truncate">{m.name}</p>
                        <p className="text-xs text-muted truncate">{m.email}</p>
                      </div>
                      <span className={clsx(
                        "text-[10px] px-2 py-0.5 rounded font-bold uppercase shrink-0",
                        m.role === "coach" ? "bg-accent/20 text-accent" : "bg-surface border border-border text-muted"
                      )}>
                        {m.role}
                      </span>
                      {/* Access toggle for athletes — coaches always have edit */}
                      {isCoach && m.role === "athlete" && (
                        <button
                          onClick={() => handleToggleAccess(m.id)}
                          className="flex items-center gap-2 shrink-0 cursor-pointer group"
                          title={access === "edit" ? "Click to revoke editing access" : "Click to grant editing access"}
                        >
                          <span className={clsx(
                            "text-[10px] font-semibold transition-colors",
                            access === "edit" ? "text-make" : "text-muted group-hover:text-slate-300"
                          )}>
                            {access === "edit" ? "Can Edit" : "View Only"}
                          </span>
                          <div className={clsx(
                            "relative w-9 h-5 rounded-full transition-colors",
                            access === "edit" ? "bg-make/30" : "bg-surface-2 border border-border group-hover:border-slate-500"
                          )}>
                            <div className={clsx(
                              "absolute top-0.5 w-4 h-4 rounded-full shadow transition-all",
                              access === "edit"
                                ? "left-[18px] bg-make"
                                : "left-0.5 bg-muted group-hover:bg-slate-400"
                            )} />
                          </div>
                        </button>
                      )}
                      {isCoach && m.id !== user?.id && (
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="text-xs text-muted hover:text-miss transition-colors px-1 shrink-0"
                          title="Remove member"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-[10px] text-muted">
              Members appear here after they sign in with your team code. Last seen times update on each visit.
            </p>
          </div>
        )}

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
                {pwLoading ? "Updating..." : "Update Password"}
              </button>
            </div>
          </div>
        )}

        {/* Sign out */}
        <div className="card">
          <button
            onClick={signOut}
            className="w-full py-2.5 rounded-input text-sm font-semibold text-miss border border-miss/30 hover:bg-miss/10 transition-all"
          >
            Sign Out
          </button>
        </div>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <ProfileContent />
      <MobileNav />
    </div>
  );
}
