"use client";

import { useState, useEffect } from "react";
import { teamGet, teamSet, getTeamId } from "@/lib/teamData";
import clsx from "clsx";

interface InvitePopupProps {
  teamName: string;
  teamCode: string; // team ID (fallback)
  onClose: () => void;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

interface InviteCodes { coachCode: string; athleteCode: string }

export async function getOrCreateInviteCodes(teamId: string): Promise<InviteCodes> {
  const existing = await teamGet<InviteCodes>(teamId, "invite_codes");
  if (existing?.coachCode && existing?.athleteCode) return existing;
  const codes: InviteCodes = {
    coachCode: existing?.coachCode || generateCode(),
    athleteCode: existing?.athleteCode || generateCode(),
  };
  teamSet(teamId, "invite_codes", codes);
  return codes;
}

export async function resolveInviteCode(code: string): Promise<{ teamId: string; role: "coach" | "athlete" } | null> {
  // Search all teams for a matching invite code
  const { createClient } = await import("@/lib/supabase");
  const supabase = createClient();
  const { data } = await supabase.from("team_data").select("team_id, value").eq("key", "invite_codes");
  if (!data) return null;
  for (const row of data) {
    const codes = row.value as InviteCodes;
    if (codes.coachCode === code.toUpperCase()) return { teamId: row.team_id, role: "coach" };
    if (codes.athleteCode === code.toUpperCase()) return { teamId: row.team_id, role: "athlete" };
  }
  return null;
}

export function InvitePopup({ teamName, teamCode, onClose }: InvitePopupProps) {
  const [role, setRole] = useState<"coach" | "athlete" | null>(null);
  const [copied, setCopied] = useState(false);
  const [codes, setCodes] = useState<InviteCodes | null>(null);

  useEffect(() => {
    const tid = getTeamId() || teamCode;
    if (tid) getOrCreateInviteCodes(tid).then(setCodes);
  }, [teamCode]);

  const activeCode = role === "coach" ? codes?.coachCode : codes?.athleteCode;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const signupUrl = role && activeCode ? `${baseUrl}/signup?code=${activeCode}` : "";
  const roleLabel = role === "coach" ? "Coach" : "Athlete";
  const message = role && activeCode
    ? `You've been invited to join ${teamName || "the team"} on Specialist Tracker as a ${roleLabel}!\n\nClick here to create your account:\n${signupUrl}\n\nYour Invite Code: ${activeCode}\n\nEnter this code during sign up to join the team.`
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
        await navigator.share({ title: `Join ${teamName || "Specialist Tracker"}`, text: message, url: signupUrl });
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
            <button onClick={() => setRole("coach")} className="card hover:bg-surface-2 hover:border-accent/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6 px-3">
              <span className="text-2xl mb-2">🏈</span>
              <span className="text-sm font-bold text-slate-100 group-hover:text-accent">Coach</span>
              <span className="text-[10px] text-muted mt-1">Full access</span>
            </button>
            <button onClick={() => setRole("athlete")} className="card hover:bg-surface-2 hover:border-sky-500/30 transition-all group cursor-pointer flex flex-col items-center text-center py-6 px-3">
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
        {activeCode && (
          <div className="bg-surface-2 border border-border rounded-input px-3 py-2 text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider">Invite Code</p>
            <p className="text-lg font-black text-accent tracking-widest">{activeCode}</p>
          </div>
        )}
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
