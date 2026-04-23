"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import { getTeamId } from "@/lib/teamData";
import { upsertMember, loadMembers, updateMemberAccess, removeMember, type StoredMember } from "@/lib/memberStore";
import clsx from "clsx";

function ProfileContent() {
  const { user, isCoach, isAdmin, signOut } = useAuth();

  // Team members
  const [members, setMembers] = useState<StoredMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);

  // Change password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Load team members
  useEffect(() => {
    if (!user || user.id === "local-dev") {
      setMembersLoading(false);
      return;
    }

    async function load() {
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
      await upsertMember(tid, {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        role: user!.role,
        access: user!.role === "coach" || user!.role === "admin" ? "edit" : "view",
        lastSeen: new Date().toISOString(),
      });

      const list = await loadMembers(tid);
      setMembers(list);
      setMembersLoading(false);
    }

    load();
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
    await removeMember(tid, memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const handleToggleAccess = async (memberId: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const newAccess = member.access === "edit" ? "view" as const : "edit" as const;
    await updateMemberAccess(tid, memberId, newAccess);
    setMembers((prev) => prev.map((m) =>
      m.id === memberId ? { ...m, access: newAccess } : m
    ));
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-team", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete account");
        setDeleting(false);
        return;
      }
      // Account deleted — redirect to login
      window.location.href = "/login";
    } catch {
      setDeleteError("Failed to delete account. Please try again.");
      setDeleting(false);
    }
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
                  const access = m.access ?? (m.role === "coach" || m.role === "admin" ? "edit" : "view");
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
                        m.role === "coach" || m.role === "admin" ? "bg-accent/20 text-accent" : "bg-surface border border-border text-muted"
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

        {/* Delete account — admin only */}
        {isAdmin && user && user.id !== "local-dev" && (
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-miss uppercase tracking-wider">
              Danger Zone
            </p>
            <p className="text-xs text-muted">
              Permanently delete this team account and all associated data. This will also remove all athlete accounts linked to this team. This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full py-2.5 rounded-input text-sm font-semibold text-miss bg-miss/10 border border-miss/40 hover:bg-miss/20 transition-all"
            >
              Delete Account
            </button>
          </div>
        )}
      </main>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card max-w-sm w-full space-y-4">
            <div>
              <p className="text-xs font-semibold text-miss uppercase tracking-wider">Delete Account</p>
              <h3 className="text-base font-bold text-slate-100 mt-1">Are you sure?</h3>
            </div>
            <p className="text-xs text-muted">
              This will permanently delete:
            </p>
            <ul className="text-xs text-muted list-disc pl-4 space-y-1">
              <li>All team settings, theme, and logo</li>
              <li>All sessions, stats, and archives</li>
              <li>All athlete rosters</li>
              <li>All athlete accounts linked to this team</li>
              <li>Your admin account</li>
            </ul>
            <p className="text-xs text-muted">
              Type <span className="text-miss font-bold">DELETE</span> to confirm:
            </p>
            <input
              className="input"
              placeholder="Type DELETE"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoComplete="off"
            />
            {deleteError && (
              <div className="text-sm rounded-input px-3 py-2 bg-miss/10 border border-miss/30 text-miss">
                {deleteError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                  setDeleteError("");
                }}
                disabled={deleting}
                className="flex-1 py-2 rounded-input text-sm font-semibold border border-border text-muted hover:text-white hover:bg-surface-2 transition-all disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText !== "DELETE"}
                className="flex-1 py-2 rounded-input text-sm font-bold bg-miss text-white hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting..." : "Delete Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
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
