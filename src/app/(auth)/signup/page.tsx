"use client";

import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { UserRole } from "@/types";
import clsx from "clsx";

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg flex items-center justify-center"><p className="text-muted">Loading...</p></div>}>
      <SignupInner />
    </Suspense>
  );
}

function SignupInner() {
  const { signUp } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("code");
  const legacyRole = searchParams.get("role") as "coach" | "athlete" | null;
  const legacyTeam = searchParams.get("team");

  const [resolvedInvite, setResolvedInvite] = useState<{ teamId: string; role: "coach" | "athlete" } | null>(null);
  const [resolving, setResolving] = useState(!!inviteCode);
  const [inviteSchool, setInviteSchool] = useState("");
  const [inviteColors, setInviteColors] = useState<{ primary: string; secondary: string } | null>(null);

  useEffect(() => {
    if (inviteCode) {
      import("@/components/ui/InvitePopup").then(({ resolveInviteCode }) => {
        resolveInviteCode(inviteCode).then(async (result) => {
          setResolvedInvite(result);
          setResolving(false);
          if (result) {
            setRoleChoice(result.role);
            setTeamChoice("existing");
            setTeamCode(result.teamId);
            // Load team info for branding
            const { getTeamSettings } = await import("@/lib/teamSettingsStore");
            const settings = await getTeamSettings(result.teamId);
            if (settings) {
              setInviteSchool(settings.school || settings.name || "");
              if (settings.colorPrimary) setInviteColors({ primary: settings.colorPrimary, secondary: settings.colorSecondary });
            }
          }
        });
      });
    }
  }, [inviteCode]);

  const inviteRole = resolvedInvite?.role ?? legacyRole;
  const inviteTeam = resolvedInvite?.teamId ?? legacyTeam;
  const isInvite = !!inviteRole;

  const [roleChoice, setRoleChoice] = useState<"coach" | "athlete">(legacyRole ?? "coach");
  const [teamChoice, setTeamChoice] = useState<"new" | "existing">(legacyTeam ? "existing" : "new");
  const [form, setForm] = useState({
    name: "",
    email: "",
    school: "",
    password: "",
    confirm: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const update = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const [teamCode, setTeamCode] = useState(legacyTeam ?? "");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (roleChoice === "athlete" && !teamCode.trim()) {
      setError("Athletes must enter an invite code from their coach");
      return;
    }
    if (roleChoice === "coach" && teamChoice === "existing" && !teamCode.trim()) {
      setError("Enter the invite code from the head coach");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const needsTeamCode = roleChoice === "athlete" || (roleChoice === "coach" && teamChoice === "existing");
      let resolvedTeamId = teamCode.trim();
      let resolvedRole: "coach" | "athlete" = roleChoice;

      // If the code is short (not a UUID), try to resolve it as an invite code
      if (needsTeamCode && resolvedTeamId && resolvedTeamId.length < 20) {
        const { resolveInviteCode } = await import("@/components/ui/InvitePopup");
        const result = await resolveInviteCode(resolvedTeamId);
        if (result) {
          resolvedTeamId = result.teamId;
          resolvedRole = result.role;
        } else {
          setError("Invalid invite code. Check with your coach.");
          setLoading(false);
          return;
        }
      }

      const role: UserRole = resolvedRole === "athlete" ? "athlete" : "admin";
      await signUp(form.email, form.password, form.name, role, needsTeamCode ? resolvedTeamId : undefined);
      // Notify about new signup
      await fetch("/api/notify-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, school: form.school, role: roleChoice }),
      }).catch(() => {});
      // New team coaches → onboard, existing team coaches & athletes → dashboard
      router.push(roleChoice === "coach" && teamChoice === "new" ? "/onboard" : "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  if (resolving) {
    return <div className="min-h-screen bg-bg flex items-center justify-center"><p className="text-muted">Verifying invite...</p></div>;
  }

  const accentColor = inviteColors?.primary || "#00d4a0";

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo-mark.svg" alt="Specialist Tracker" className="w-12 h-12 mx-auto mb-3" />
          {inviteSchool ? (
            <>
              <h1 className="text-2xl font-extrabold text-slate-100">Join {inviteSchool}</h1>
              <p className="text-sm mt-1" style={{ color: accentColor }}>
                {inviteRole === "coach" ? "Coach Invite" : "Athlete Invite"}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-slate-100">Create account</h1>
              <p className="text-sm text-muted mt-1">Set up your team</p>
            </>
          )}
        </div>

        <div className="card" style={inviteColors ? { borderColor: `${accentColor}40`, boxShadow: `0 0 30px ${accentColor}15` } : undefined}>
          {error && (
            <div className="bg-miss/10 border border-miss/30 text-miss text-sm rounded-input px-3 py-2 mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            {/* Role selector */}
            <div>
              <label className="label">{isInvite ? `Invited as ${inviteRole === "coach" ? "Coach" : "Athlete"}` : "I am a"}</label>
              {!isInvite && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRoleChoice("coach")}
                  className={clsx(
                    "py-3 rounded-input text-sm font-bold border transition-all",
                    roleChoice === "coach"
                      ? "bg-accent/20 text-accent border-accent/50"
                      : "bg-surface-2 text-muted border-border hover:text-white"
                  )}
                >
                  Coach
                </button>
                <button
                  type="button"
                  onClick={() => setRoleChoice("athlete")}
                  className={clsx(
                    "py-3 rounded-input text-sm font-bold border transition-all",
                    roleChoice === "athlete"
                      ? "bg-accent/20 text-accent border-accent/50"
                      : "bg-surface-2 text-muted border-border hover:text-white"
                  )}
                >
                  Athlete
                </button>
              </div>
              )}
            </div>

            {roleChoice === "coach" && (
              <div>
                <label className="label">Team</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => { setTeamChoice("new"); setTeamCode(""); }}
                    className={clsx(
                      "py-2.5 rounded-input text-xs font-bold border transition-all",
                      teamChoice === "new"
                        ? "bg-accent/20 text-accent border-accent/50"
                        : "bg-surface-2 text-muted border-border hover:text-white"
                    )}
                  >
                    New Team
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeamChoice("existing")}
                    className={clsx(
                      "py-2.5 rounded-input text-xs font-bold border transition-all",
                      teamChoice === "existing"
                        ? "bg-accent/20 text-accent border-accent/50"
                        : "bg-surface-2 text-muted border-border hover:text-white"
                    )}
                  >
                    Existing Team
                  </button>
                </div>
              </div>
            )}

            {!isInvite && (roleChoice === "athlete" || (roleChoice === "coach" && teamChoice === "existing")) && (
              <div>
                <label className="label">Invite Code</label>
                <input
                  className="input uppercase tracking-widest"
                  placeholder="Enter code from your coach"
                  value={teamCode}
                  onChange={(e) => setTeamCode(e.target.value.toUpperCase())}
                  required
                />
                <p className="text-[10px] text-muted mt-1">Ask your coach for the invite code (found in Settings → Invite Codes)</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Your name</label>
                <input
                  className="input"
                  placeholder="Coach Smith"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">School</label>
                <input
                  className="input"
                  placeholder="Lincoln HS"
                  value={form.school}
                  onChange={(e) => update("school", e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="coach@school.edu"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
                autoComplete="new-email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="label">Confirm</label>
                <input
                  className="input"
                  type="password"
                  placeholder="••••••••"
                  value={form.confirm}
                  onChange={(e) => update("confirm", e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="text-center text-xs text-muted mt-6">
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
