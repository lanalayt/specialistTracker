"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettingsToCloud } from "@/lib/settingsSync";

const SPORT_OPTIONS = [
  { id: "KICKING", label: "FG Kicking", icon: "🏈", desc: "Field goals & PATs" },
  { id: "PUNTING", label: "Punting", icon: "👟", desc: "Punts with hang time & direction" },
  { id: "KICKOFF", label: "Kickoff", icon: "🎯", desc: "Touchback rate & landing zones" },
  { id: "LONGSNAP", label: "Long Snapping", icon: "📏", desc: "Snap time & accuracy" },
];

export default function OnboardPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [school, setSchool] = useState("");
  const [sports, setSports] = useState<string[]>(["KICKING"]);

  const toggleSport = (id: string) =>
    setSports((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );

  const handleFinish = () => {
    const team = {
      id: "demo-team-1",
      name: teamName || "My Team",
      school: school || "My School",
      config: { enabledSports: sports },
    };
    saveSettingsToCloud("st_team_v1", team);
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center text-bg font-black text-xl mx-auto mb-3">
            ST
          </div>
          <h1 className="text-2xl font-extrabold text-slate-100">
            Set up your team
          </h1>
          <p className="text-sm text-muted mt-1">
            You can change these later in Settings
          </p>
        </div>

        <div className="card shadow-accent-lg space-y-6">
          {/* Team info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Team name</label>
              <input
                className="input"
                placeholder="Special Teams"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">School</label>
              <input
                className="input"
                placeholder="Lincoln HS"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
              />
            </div>
          </div>

          {/* Sports */}
          <div>
            <label className="label">Enable sport modules</label>
            <div className="space-y-2 mt-2">
              {SPORT_OPTIONS.map((s) => (
                <label
                  key={s.id}
                  className={`flex items-center gap-3 p-3 rounded-input border cursor-pointer transition-all ${
                    sports.includes(s.id)
                      ? "border-accent/50 bg-accent/5"
                      : "border-border hover:border-border/80"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={sports.includes(s.id)}
                    onChange={() => toggleSport(s.id)}
                    className="accent-accent"
                  />
                  <span className="text-xl">{s.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-100">
                      {s.label}
                    </p>
                    <p className="text-xs text-muted">{s.desc}</p>
                  </div>
                  {sports.includes(s.id) && (
                    <span className="badge-make text-xs">Enabled</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={handleFinish}
            className="btn-primary w-full"
          >
            Launch Tracker →
          </button>
        </div>
      </div>
    </div>
  );
}
