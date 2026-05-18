"use client";

import { useState, useEffect } from "react";
import type { ScoutProfile } from "@/lib/scoutStore";
import clsx from "clsx";

const POSITION_OPTIONS = ["Kicker", "Punter", "Snapper"];

interface Props {
  profile: ScoutProfile;
  onSave: (profile: ScoutProfile, originalName?: string) => void;
  onClose: () => void;
}

export function ScoutProfileModal({ profile, onSave, onClose }: Props) {
  const [form, setForm] = useState<ScoutProfile>({ ...profile });

  useEffect(() => {
    setForm({ ...profile });
  }, [profile.name]);

  const update = (key: keyof ScoutProfile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedPositions = (form.position ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const togglePosition = (pos: string) => {
    const next = selectedPositions.includes(pos)
      ? selectedPositions.filter((p) => p !== pos)
      : [...selectedPositions, pos];
    update("position", next.join(", "));
  };

  const fieldsBeforePos: { key: keyof ScoutProfile; label: string; placeholder: string }[] = [
    { key: "name", label: "Name", placeholder: "Full name" },
  ];
  const fieldsAfterPos: { key: keyof ScoutProfile; label: string; placeholder: string }[] = [
    { key: "dob", label: "DOB", placeholder: "MM/DD/YYYY" },
    { key: "school", label: "School", placeholder: "School name" },
    { key: "schoolYear", label: "School Year", placeholder: "e.g. Junior, 2026" },
    { key: "height", label: "Height", placeholder: "e.g. 6'2\"" },
    { key: "weight", label: "Weight", placeholder: "e.g. 195 lbs" },
    { key: "majorPreference", label: "Major Preference", placeholder: "e.g. Business" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Player Profile</h3>
          <button onClick={onClose} className="text-muted hover:text-white text-xs transition-colors">Close</button>
        </div>

        <div className="space-y-3">
          {fieldsBeforePos.map((f) => (
            <div key={f.key}>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{f.label}</p>
              <input
                type="text"
                value={form[f.key] ?? ""}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="input w-full text-sm py-1.5"
              />
            </div>
          ))}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Position</p>
            <div className="flex gap-1.5">
              {POSITION_OPTIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos)}
                  className={clsx(
                    "px-3 py-1.5 rounded-input text-xs font-semibold transition-all",
                    selectedPositions.includes(pos)
                      ? "bg-amber-500 text-slate-900"
                      : "bg-surface-2 text-muted border border-border hover:text-white"
                  )}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
          {fieldsAfterPos.map((f) => (
            <div key={f.key}>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{f.label}</p>
              <input
                type="text"
                value={form[f.key] ?? ""}
                onChange={(e) => update(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="input w-full text-sm py-1.5"
              />
            </div>
          ))}
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Notes</p>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Add notes about this athlete..."
              className="input w-full text-sm py-1.5 min-h-[80px] resize-y"
              rows={3}
            />
          </div>
        </div>

        <button
          onClick={() => onSave(form, profile.name !== form.name ? profile.name : undefined)}
          className="btn-primary w-full py-2.5 text-sm font-bold"
        >
          Save Profile
        </button>
      </div>
    </div>
  );
}
