"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

// "Remember email" is pre-auth (no signed-in user yet), so it can't live in the
// per-user DB. Stored in a cookie — not localStorage — holding only the email.
const REMEMBER_COOKIE = "st_email";
function readRememberedEmail(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)st_email=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}
function writeRememberedEmail(email: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBER_COOKIE}=${encodeURIComponent(email)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
}
function clearRememberedEmail() {
  if (typeof document === "undefined") return;
  document.cookie = `${REMEMBER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(() => readRememberedEmail());
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => !!readRememberedEmail());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (rememberMe) {
        writeRememberedEmail(email);
      } else {
        clearRememberedEmail();
      }
      await signIn(email, password);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      console.error("Sign in error:", err);
      const msg = err instanceof Error ? err.message : "Sign in failed";
      setError(msg);
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setError("Enter your email address above, then click Forgot password.");
      return;
    }
    setResetLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) throw new Error(resetError.message);
      setResetSent(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send reset email";
      setError(msg);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo-mark.svg" alt="Specialist Tracker" className="w-12 h-12 mx-auto mb-3" />
          <h1 className="text-2xl font-extrabold text-slate-100">
            Specialist Tracker
          </h1>
          <p className="text-sm text-muted mt-1">
            Special teams performance platform
          </p>
        </div>

        {/* Card */}
        <div className="card shadow-accent-lg">
          <h2 className="text-lg font-bold text-slate-100 mb-6">Sign in</h2>

          {error && (
            <div className="bg-miss/10 border border-miss/30 text-miss text-sm rounded-input px-3 py-2 mb-4">
              {error}
            </div>
          )}

          {resetSent && (
            <div className="bg-make/10 border border-make/30 text-make text-sm rounded-input px-3 py-2 mb-4">
              Password reset email sent! Check your inbox.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                placeholder="coach@school.edu"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setPassword(""); }}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="label">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resetLoading}
                  className="text-xs text-accent hover:underline disabled:opacity-50"
                >
                  {resetLoading ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 accent-accent rounded"
              />
              <span className="text-xs text-slate-300">Remember me</span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-xs text-muted mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-accent hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
