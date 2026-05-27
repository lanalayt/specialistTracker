"use client";

import { useState } from "react";
import clsx from "clsx";

interface InvitePopupProps {
  teamName: string;
  teamCode: string;
  onClose: () => void;
}

export function InvitePopup({ teamName, teamCode, onClose }: InvitePopupProps) {
  const [role, setRole] = useState<"coach" | "athlete" | null>(null);
  const [copied, setCopied] = useState(false);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const signupUrl = role ? `${baseUrl}/signup?role=${role}&team=${teamCode}` : "";
  const roleLabel = role === "coach" ? "Coach" : "Athlete";
  const message = role
    ? `You've been invited to join ${teamName || "the team"} on Specialist Tracker as a ${roleLabel}!\n\nClick here to create your account:\n${signupUrl}\n\nYour Team Code: ${teamCode}\n\nYou'll need this code during sign up to link to the team.`
    : "";

  const handleEmail = () => {
    const subject = encodeURIComponent(`You're invited to ${teamName || "Specialist Tracker"}`);
    const body = encodeURIComponent(message);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    onClose();
  };

  const handleText = () => {
    const body = encodeURIComponent(message);
    window.open(`sms:?&body=${body}`, "_self");
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(signupUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = signupUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${teamName || "Specialist Tracker"}`,
          text: message,
          url: signupUrl,
        });
        onClose();
      } catch {}
    }
  };

  // Step 1: Choose role
  if (!role) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Invite to {teamName || "Team"}</h3>
            <button onClick={onClose} className="text-muted hover:text-white text-xs">Close</button>
          </div>
          <p className="text-xs text-muted">Who are you inviting?</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setRole("coach")}
              className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6 px-3"
            >
              <span className="text-2xl mb-2">🏈</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent">Coach</span>
              <span className="text-[10px] text-muted mt-1">Full access</span>
            </button>
            <button
              onClick={() => setRole("athlete")}
              className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6 px-3"
            >
              <span className="text-2xl mb-2">🏃</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-sky-400">Athlete</span>
              <span className="text-[10px] text-muted mt-1">View & chart</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Choose send method
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-xs mx-4 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Invite {roleLabel}</h3>
            <button onClick={() => setRole(null)} className="text-[10px] text-accent hover:underline">← Change role</button>
          </div>
          <button onClick={onClose} className="text-muted hover:text-white text-xs">Close</button>
        </div>
        <p className="text-xs text-muted">How do you want to send the invite?</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={handleEmail} className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-input border border-border hover:border-accent/40 hover:bg-accent/5 transition-all">
            <span className="text-xl">📧</span>
            <span className="text-xs font-semibold text-slate-200">Email</span>
          </button>
          <button onClick={handleText} className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-input border border-border hover:border-accent/40 hover:bg-accent/5 transition-all">
            <span className="text-xl">💬</span>
            <span className="text-xs font-semibold text-slate-200">Text</span>
          </button>
          <button onClick={handleCopy} className={clsx("flex flex-col items-center gap-1.5 py-4 px-2 rounded-input border transition-all", copied ? "border-make/50 bg-make/10" : "border-border hover:border-accent/40 hover:bg-accent/5")}>
            <span className="text-xl">{copied ? "✅" : "📋"}</span>
            <span className="text-xs font-semibold text-slate-200">{copied ? "Copied!" : "Copy Link"}</span>
          </button>
          {typeof navigator !== "undefined" && !!navigator.share && (
            <button onClick={handleShare} className="flex flex-col items-center gap-1.5 py-4 px-2 rounded-input border border-border hover:border-accent/40 hover:bg-accent/5 transition-all">
              <span className="text-xl">📤</span>
              <span className="text-xs font-semibold text-slate-200">Share</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
