"use client";

import { useState, useEffect } from "react";
import { SCOUT_DISCIPLINES, type ScoutProfile, type ScoutRanking } from "@/lib/scoutStore";
import clsx from "clsx";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA",
  "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT",
  "VA", "WA", "WV", "WI", "WY", "DC",
];

// Graduation/school years, starting at 2026 and going up.
const SCHOOL_YEARS = Array.from({ length: 15 }, (_, i) => String(2026 + i));

/**
 * Ranking-group context. Provided only when the profile is opened from a
 * specific chart row, so the group shown/edited applies to THAT chart (groups
 * belong to charts, not athletes).
 */
export interface ProfileRankingContext {
  rankings: ScoutRanking[];
  currentIds: string[];
  onChange: (rankingIds: string[]) => void | Promise<void>;
}

interface Props {
  profile: ScoutProfile;
  onSave: (profile: ScoutProfile, originalName?: string, jerseyNumber?: string) => void;
  onClose: () => void;
  /** Current jersey number. When provided, a number box appears next to Name. */
  number?: string;
  /** When provided, a Ranking Group selector for the clicked chart is shown. */
  ranking?: ProfileRankingContext;
  /** Open directly in edit mode (e.g. a brand-new athlete). Defaults to read-only. */
  startInEdit?: boolean;
}

export function ScoutProfileModal({ profile, onSave, onClose, number, ranking, startInEdit }: Props) {
  const [form, setForm] = useState<ScoutProfile>({ ...profile });
  const [numberInput, setNumberInput] = useState(number ?? "");
  const [editing, setEditing] = useState(!!startInEdit);
  const [rankingSel, setRankingSel] = useState<string>(ranking?.currentIds[0] ?? "overall");

  useEffect(() => {
    setForm({ ...profile });
    setNumberInput(number ?? "");
    setEditing(!!startInEdit);
    setRankingSel(ranking?.currentIds[0] ?? "overall");
  }, [profile.name]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the selector in sync if the parent's current group changes underneath us.
  useEffect(() => {
    setRankingSel(ranking?.currentIds[0] ?? "overall");
  }, [ranking?.currentIds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleRankingChange = (id: string) => {
    setRankingSel(id);
    ranking?.onChange([id]);
  };

  const cancelEdit = () => {
    setForm({ ...profile });
    setNumberInput(number ?? "");
    setRankingSel(ranking?.currentIds[0] ?? "overall");
    setEditing(false);
  };

  type Field = { key: keyof ScoutProfile; label: string; placeholder: string; options?: string[] };
  const fieldsAfterPos: Field[] = [
    { key: "dob", label: "DOB", placeholder: "MM/DD/YYYY" },
    { key: "school", label: "School", placeholder: "School name" },
    { key: "schoolState", label: "School State", placeholder: "Select state", options: US_STATES },
    { key: "schoolYear", label: "School Year", placeholder: "Select year", options: SCHOOL_YEARS },
    { key: "height", label: "Height", placeholder: "e.g. 6'2\"" },
    { key: "weight", label: "Weight", placeholder: "e.g. 195 lbs" },
    { key: "majorPreference", label: "Major Preference", placeholder: "e.g. Business" },
  ];

  const rankingNames = (ids: string[]) =>
    ids
      .map((id) => ranking?.rankings.find((r) => r.id === id)?.name)
      .filter(Boolean)
      .join(", ") || "Overall";

  const Label = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[10px] text-muted uppercase tracking-wider mb-1">{children}</p>
  );
  const ReadValue = ({ children }: { children: React.ReactNode }) => (
    <p className="text-sm text-slate-100 py-1.5">{children || <span className="text-muted">—</span>}</p>
  );

  const displayName = numberInput ? `#${numberInput} ${form.name ?? ""}` : (form.name ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-border rounded-xl w-full max-w-sm mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Player Profile</h3>
          <div className="flex items-center gap-3">
            {!editing && (
              <button onClick={() => setEditing(true)} className="text-[11px] font-semibold text-amber-400 hover:underline transition-colors">Edit</button>
            )}
            <button onClick={onClose} className="text-muted hover:text-white text-xs transition-colors">Close</button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <Label>{number !== undefined ? "Number / Name" : "Name"}</Label>
              <div className="flex gap-2">
                {number !== undefined && (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={numberInput}
                    onChange={(e) => setNumberInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="#"
                    className="input w-16 text-center text-sm font-bold py-1.5"
                  />
                )}
                <input
                  type="text"
                  value={form.name ?? ""}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Full name"
                  className="input flex-1 text-sm py-1.5"
                />
              </div>
            </div>

            {ranking && (
              <div>
                <Label>Ranking Group</Label>
                <select
                  value={rankingSel}
                  onChange={(e) => handleRankingChange(e.target.value)}
                  className="input w-full text-sm py-1.5"
                >
                  {ranking.rankings.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <Label>Discipline</Label>
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
                <Label>{f.label}</Label>
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
              <Label>Notes</Label>
              <textarea
                value={form.notes ?? ""}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Add notes about this athlete..."
                className="input w-full text-sm py-1.5 min-h-[80px] resize-y"
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={cancelEdit} className="btn-ghost flex-1 py-2.5 text-sm font-bold border border-border">Cancel</button>
              <button
                onClick={() => onSave(form, profile.name !== form.name ? profile.name : undefined, number !== undefined ? numberInput : undefined)}
                className="btn-primary flex-1 py-2.5 text-sm font-bold"
              >
                Save Profile
              </button>
            </div>
          </div>
        ) : (
          // ── Read-only view ──────────────────────────────────────────────
          <div className="space-y-3">
            <div>
              <Label>{number !== undefined ? "Number / Name" : "Name"}</Label>
              <ReadValue>{displayName}</ReadValue>
            </div>

            {ranking && (
              <div>
                <Label>Ranking Group</Label>
                <ReadValue>{rankingNames(ranking.currentIds)}</ReadValue>
              </div>
            )}

            <div>
              <Label>Discipline</Label>
              {selectedDisciplines.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 py-0.5">
                  {SCOUT_DISCIPLINES.filter((d) => selectedDisciplines.includes(d.key)).map((d) => (
                    <span key={d.key} className="px-3 py-1.5 rounded-input text-xs font-semibold bg-amber-500 text-slate-900">{d.label}</span>
                  ))}
                </div>
              ) : (
                <ReadValue>{""}</ReadValue>
              )}
            </div>
            {fieldsAfterPos.map((f) => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <ReadValue>{(form[f.key] as string) ?? ""}</ReadValue>
              </div>
            ))}
            <div>
              <Label>Notes</Label>
              <p className="text-sm text-slate-100 py-1.5 whitespace-pre-wrap">
                {form.notes || <span className="text-muted">—</span>}
              </p>
            </div>

            <button onClick={() => setEditing(true)} className="btn-primary w-full py-2.5 text-sm font-bold">Edit Profile</button>
          </div>
        )}
      </div>
    </div>
  );
}
