"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase";
import Link from "next/link";

const REMEMBER_KEY = "st_remember_email";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem(REMEMBER_KEY) ?? ""; } catch { return ""; }
  });
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !!localStorage.getItem(REMEMBER_KEY); } catch { return false; }
  });
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
        localStorage.setItem(REMEMBER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
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
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-bg font-black text-xl mx-auto mb-3">
            ST
          </div>
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
