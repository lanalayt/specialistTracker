"use client";

import { useState, useEffect } from "react";
import { SCOUT_DISCIPLINES, type ScoutProfile } from "@/lib/scoutStore";
import clsx from "clsx";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
];

// Graduation/school years, starting at 2026 and going up.
const SCHOOL_YEARS = Array.from({ length: 15 }, (_, i) => String(2026 + i));

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

  const selectedDisciplines = form.disciplines ?? [];
  const toggleDiscipline = (key: string) => {
    setForm((prev) => {
      const cur = prev.disciplines ?? [];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      return { ...prev, disciplines: next };
    });
  };

  type Field = { key: keyof ScoutProfile; label: string; placeholder: string; options?: string[] };
  const fieldsBeforePos: Field[] = [
    { key: "name", label: "Name", placeholder: "Full name" },
  ];
  const fieldsAfterPos: Field[] = [
    { key: "dob", label: "DOB", placeholder: "MM/DD/YYYY" },
    { key: "school", label: "School", placeholder: "School name" },
    { key: "schoolState", label: "School State", placeholder: "Select state", options: US_STATES },
    { key: "schoolYear", label: "School Year", placeholder: "Select year", options: SCHOOL_YEARS },
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
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Discipline</p>
            <div className="flex flex-wrap gap-1.5">
              {SCOUT_DISCIPLINES.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => toggleDiscipline(d.key)}
                  className={clsx(
                    "px-3 py-1.5 rounded-input text-xs font-semibold transition-all",
                    selectedDisciplines.includes(d.key)
                      ? "bg-amber-500 text-slate-900"
                      : "bg-surface-2 text-muted border border-border hover:text-white"
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          {fieldsAfterPos.map((f) => (
            <div key={f.key}>
              <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{f.label}</p>
              {f.options ? (
                <select
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  className="input w-full text-sm py-1.5"
                >
                  <option value="">{f.placeholder}</option>
                  {f.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={(form[f.key] as string) ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  className="input w-full text-sm py-1.5"
                />
              )}
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
