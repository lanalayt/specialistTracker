"use client";

import { useState, useEffect } from "react";
import clsx from "clsx";
import { loadSettingsFromCloud, saveSettingsToCloud } from "@/lib/settingsSync";
import { Tooltip } from "@/components/ui/Tooltip";
import { RenameTypeModal } from "@/components/ui/RenameTypeModal";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "kickoffSettings";

export type DirectionMode = "numeric" | "field";
export type KODistMetric = "distance" | "yardline" | "none";

export interface KOTypeConfig {
  id: string;
  label: string;
  category: string;
  metric: KODistMetric;
  hangTime: boolean;
}

export interface KOCategory {
  id: string;
  label: string;
  enabled: boolean;
}

interface KickoffSettings {
  kickoffTypes: KOTypeConfig[];
  kickoffCategories?: KOCategory[];
  directionEnabled: boolean;
  directionMode: DirectionMode;
  directionMetrics: { id: string; label: string; score?: number }[];
}

const DEFAULT_CATEGORIES: KOCategory[] = [
  { id: "DEEP", label: "Deep Kickoffs", enabled: true },
  { id: "SKY", label: "Sky Kick", enabled: true },
  { id: "SQUIB", label: "Squib", enabled: true },
  { id: "ONSIDE", label: "Onside", enabled: true },
];

const DEFAULT_TYPES: KOTypeConfig[] = [
  { id: "DEEP_LEFT", label: "Directional Left", category: "DEEP", metric: "distance", hangTime: true },
  { id: "DEEP_RIGHT", label: "Directional Right", category: "DEEP", metric: "distance", hangTime: true },
  { id: "SKY", label: "Sky Kick", category: "SKY", metric: "distance", hangTime: true },
  { id: "SQUIB_LEFT", label: "Left", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "SQUIB_MID", label: "Middle", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "SQUIB_RIGHT", label: "Right", category: "SQUIB", metric: "distance", hangTime: false },
  { id: "ONSIDE", label: "Onside", category: "ONSIDE", metric: "none", hangTime: false },
];

const NUMERIC_DIRECTIONS = [
  { id: "1", label: "1.0" },
  { id: "0.5", label: "0.5" },
  { id: "0", label: "0" },
  { id: "-1", label: "OB" },
];

const FIELD_DIRECTIONS = [
  { id: "SL-NUM", label: "Sideline-Numbers", score: 1 },
  { id: "NUM-HASH", label: "Numbers-Hash", score: 0.5 },
  { id: "TO_FIELD", label: "To The Field", score: 0 },
  { id: "OB", label: "OB", score: -1 },
];

function migrateType(t: Record<string, unknown>): KOTypeConfig {
  const id = t.id as string;
  const upper = id.toUpperCase();
  let category = (t.category as string) ?? "DEEP";
  if (!t.category) {
    if (upper.includes("SQUIB")) category = "SQUIB";
    else if (upper.includes("SKY")) category = "SKY";
    else if (upper.includes("ONSIDE")) category = "ONSIDE";
    else category = "DEEP";
  }
  return {
    id,
    label: t.label as string,
    category,
    metric: (t.metric as KODistMetric) ?? "distance",
    hangTime: typeof t.hangTime === "boolean" ? t.hangTime : true,
  };
}

function loadSettings(): KickoffSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const rawTypes = parsed.kickoffTypes?.length > 0 ? parsed.kickoffTypes : DEFAULT_TYPES;
      return {
        kickoffTypes: rawTypes.map((t: Record<string, unknown>) => migrateType(t)),
        kickoffCategories: parsed.kickoffCategories?.length > 0 ? parsed.kickoffCategories : DEFAULT_CATEGORIES,
        directionEnabled: parsed.directionEnabled !== false,
        directionMode: parsed.directionMode === "field" ? "field" : "numeric",
        directionMetrics: parsed.directionMetrics?.length > 0 ? parsed.directionMetrics : NUMERIC_DIRECTIONS,
      };
    }
  } catch {}
  return { kickoffTypes: DEFAULT_TYPES, kickoffCategories: DEFAULT_CATEGORIES, directionEnabled: true, directionMode: "numeric", directionMetrics: NUMERIC_DIRECTIONS };
}

export default function KickoffSettingsPage() {
  const { isAthlete } = useAuth();
  if (isAthlete) return <main className="p-4 lg:p-6"><p className="text-sm text-muted">Settings are coach-only.</p></main>;
  return <KickoffSettingsContent />;
}

function KickoffSettingsContent() {
  const [types, setTypes] = useState<KOTypeConfig[]>(DEFAULT_TYPES);
  const [categories, setCategories] = useState<KOCategory[]>(DEFAULT_CATEGORIES);
  const [dirEnabled, setDirEnabled] = useState(true);
  const [dirMode, setDirMode] = useState<DirectionMode>("numeric");
  const [directions, setDirections] = useState<{ id: string; label: string; score?: number }[]>(NUMERIC_DIRECTIONS);
  const [newTypes, setNewTypes] = useState<Record<string, string>>({});
  const [newDir, setNewDir] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pendingRenames, setPendingRenames] = useState<{ id: string; oldLabel: string; newLabel: string; category: string; metric: KODistMetric; hangTime: boolean }[]>([]);
  const [savedSettings, setSavedSettings] = useState<KickoffSettings>({
    kickoffTypes: DEFAULT_TYPES,
    kickoffCategories: DEFAULT_CATEGORIES,
    directionEnabled: true,
    directionMode: "numeric",
    directionMetrics: NUMERIC_DIRECTIONS,
  });

  useEffect(() => {
    const s = loadSettings();
    setTypes(s.kickoffTypes);
    setCategories(s.kickoffCategories ?? DEFAULT_CATEGORIES);
    setDirEnabled(s.directionEnabled);
    setDirMode(s.directionMode);
    setDirections(s.directionMetrics);
    setSavedSettings(s);
    setLoaded(true);

    loadSettingsFromCloud<KickoffSettings>(STORAGE_KEY).then((cloud) => {
      if (cloud) {
        if (cloud.kickoffTypes?.length > 0) {
          const migrated = (cloud.kickoffTypes as unknown as Record<string, unknown>[]).map(migrateType);
          setTypes(migrated);
        }
        if (cloud.kickoffCategories && cloud.kickoffCategories.length > 0) setCategories(cloud.kickoffCategories);
        if (typeof cloud.directionEnabled === "boolean") setDirEnabled(cloud.directionEnabled);
        if (cloud.directionMode) setDirMode(cloud.directionMode);
        if (cloud.directionMetrics?.length > 0) setDirections(cloud.directionMetrics);
        setSavedSettings({
          kickoffTypes: cloud.kickoffTypes?.length > 0
            ? (cloud.kickoffTypes as unknown as Record<string, unknown>[]).map(migrateType)
            : DEFAULT_TYPES,
          kickoffCategories: (cloud.kickoffCategories && cloud.kickoffCategories.length > 0) ? cloud.kickoffCategories : DEFAULT_CATEGORIES,
          directionEnabled: cloud.directionEnabled !== false,
          directionMode: cloud.directionMode || "numeric",
          directionMetrics: cloud.directionMetrics?.length > 0 ? cloud.directionMetrics : NUMERIC_DIRECTIONS,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const changed =
      JSON.stringify(types) !== JSON.stringify(savedSettings.kickoffTypes) ||
      JSON.stringify(categories) !== JSON.stringify(savedSettings.kickoffCategories) ||
      dirEnabled !== savedSettings.directionEnabled ||
      dirMode !== savedSettings.directionMode ||
      JSON.stringify(directions) !== JSON.stringify(savedSettings.directionMetrics);
    setDirty(changed);
    if (changed) setSaved(false);
  }, [types, categories, dirEnabled, dirMode, directions, savedSettings, loaded]);

  const handleDirModeChange = (mode: DirectionMode) => {
    setDirMode(mode);
    setDirections(mode === "field" ? FIELD_DIRECTIONS : NUMERIC_DIRECTIONS);
  };

  const handleAddType = (categoryId: string) => {
    const trimmed = (newTypes[categoryId] ?? "").trim();
    if (!trimmed) return;
    const id = trimmed.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    if (types.some((t) => t.id === id)) return;
    const catDefaults = categoryId === "ONSIDE"
      ? { metric: "none" as const, hangTime: false }
      : categoryId === "SQUIB"
        ? { metric: "distance" as const, hangTime: false }
        : { metric: "distance" as const, hangTime: true };
    setTypes([...types, { id, label: trimmed, category: categoryId, ...catDefaults }]);
    setNewTypes({ ...newTypes, [categoryId]: "" });
  };

  const handleAddDir = () => {
    const trimmed = newDir.trim();
    if (!trimmed) return;
    const id = trimmed.toUpperCase().replace(/[^A-Z0-9.]/g, "_");
    if (directions.some((d) => d.id === id)) return;
    setDirections([...directions, { id, label: trimmed, score: dirMode === "field" ? 0 : undefined }]);
    setNewDir("");
  };

  const executeSave = (typesToSave: KOTypeConfig[]) => {
    const settings: KickoffSettings = { kickoffTypes: typesToSave, kickoffCategories: categories, directionEnabled: dirEnabled, directionMode: dirMode, directionMetrics: directions };
    saveSettingsToCloud(STORAGE_KEY, settings);
    setTypes(typesToSave);
    setSavedSettings(settings);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSave = () => {
    const renames: typeof pendingRenames = [];
    for (const t of types) {
      const prev = savedSettings.kickoffTypes.find((s) => s.id === t.id);
      if (prev && prev.label !== t.label) {
        renames.push({ id: t.id, oldLabel: prev.label, newLabel: t.label, category: t.category, metric: t.metric, hangTime: t.hangTime });
      }
    }
    if (renames.length > 0) {
      setPendingRenames(renames);
    } else {
      executeSave(types);
    }
  };

  const handleRenameChoice = (choice: "rename" | "new" | "cancel") => {
    const current = pendingRenames[0];
    let updatedTypes = [...types];

    if (choice === "cancel") {
      updatedTypes = updatedTypes.map((t) => t.id === current.id ? { ...t, label: current.oldLabel } : t);
    } else if (choice === "new") {
      updatedTypes = updatedTypes.map((t) => t.id === current.id ? { ...t, label: current.oldLabel } : t);
      let newId = current.newLabel.toUpperCase().replace(/[^A-Z0-9]/g, "_");
      let suffix = 1;
      while (updatedTypes.some((t) => t.id === newId)) {
        newId = `${current.newLabel.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${suffix}`;
        suffix++;
      }
      updatedTypes.push({ id: newId, label: current.newLabel, category: current.category, metric: current.metric, hangTime: current.hangTime });
    }

    const remaining = pendingRenames.slice(1);
    if (remaining.length > 0) {
      setTypes(updatedTypes);
      setPendingRenames(remaining);
    } else {
      setPendingRenames([]);
      executeSave(updatedTypes);
    }
  };

  return (
    <div className="flex-1 p-6 max-w-5xl space-y-6">
      <h2 className="text-lg font-bold text-slate-100">KO Settings</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
      <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Kickoff Types<Tooltip text="Configure the types of kickoffs you track. Each category can have multiple types. Toggle categories on/off and add or remove types within each." /></p>
      {categories.map((cat) => {
        const catTypes = types.filter((t) => t.category === cat.id);
        return (
          <div key={cat.id} className="card space-y-4">
            <div className="flex items-center justify-between">
              <p className="label mb-0">{cat.label}</p>
              <button
                onClick={() => setCategories(categories.map((c) => c.id === cat.id ? { ...c, enabled: !c.enabled } : c))}
                className={clsx(
                  "relative w-11 h-6 rounded-full transition-colors",
                  cat.enabled ? "bg-accent" : "bg-border"
                )}
                aria-label={`Toggle ${cat.label}`}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                    cat.enabled ? "left-[22px]" : "left-0.5"
                  )}
                />
              </button>
            </div>
            {cat.enabled && (
              <>
                <div className="space-y-3">
                  {catTypes.map((t) => (
                    <div key={t.id} className="border border-border rounded-input p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={t.label}
                          onChange={(e) => setTypes(types.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)))}
                          className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all"
                        />
                        <button
                          onClick={() => setTypes(types.filter((x) => x.id !== t.id))}
                          className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm"
                          title="Remove type"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted">Metric:</span>
                          <div className="flex rounded border border-border overflow-hidden">
                            <button
                              onClick={() => setTypes(types.map((x) => x.id === t.id ? { ...x, metric: "distance" } : x))}
                              className={clsx("px-2 py-1 text-[10px] font-semibold transition-colors", t.metric === "distance" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}
                            >
                              Distance
                            </button>
                            <button
                              onClick={() => setTypes(types.map((x) => x.id === t.id ? { ...x, metric: "yardline" } : x))}
                              className={clsx("px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border", t.metric === "yardline" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}
                            >
                              Yard Line
                            </button>
                            <button
                              onClick={() => setTypes(types.map((x) => x.id === t.id ? { ...x, metric: "none" } : x))}
                              className={clsx("px-2 py-1 text-[10px] font-semibold transition-colors border-l border-border", t.metric === "none" ? "bg-accent text-slate-900" : "text-muted hover:text-white")}
                            >
                              None
                            </button>
                          </div>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={t.hangTime}
                            onChange={() => setTypes(types.map((x) => x.id === t.id ? { ...x, hangTime: !x.hangTime } : x))}
                            className="accent-accent"
                          />
                          <span className="text-[10px] text-muted">Hang Time</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTypes[cat.id] ?? ""}
                    onChange={(e) => setNewTypes({ ...newTypes, [cat.id]: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddType(cat.id); }}
                    placeholder={`Add ${cat.label.toLowerCase()} type...`}
                    className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
                  />
                  <button
                    onClick={() => handleAddType(cat.id)}
                    disabled={!(newTypes[cat.id] ?? "").trim()}
                    className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Add
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      </div>
      <div className="space-y-4">
      <p className="text-sm font-bold text-slate-100 uppercase tracking-wider hidden lg:block">&nbsp;</p>
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Direction Score<Tooltip text="Track how accurate each kickoff's direction is. Score each kick as 1.0 (on target), 0.5 (close), or 0 (critical miss). Stats show your directional accuracy percentage." /></p>
          <button
            onClick={() => setDirEnabled((v) => !v)}
            className={clsx(
              "relative w-11 h-6 rounded-full transition-colors",
              dirEnabled ? "bg-accent" : "bg-border"
            )}
            aria-label="Toggle direction scoring"
          >
            <span
              className={clsx(
                "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                dirEnabled ? "left-[22px]" : "left-0.5"
              )}
            />
          </button>
        </div>
        <p className="text-xs text-muted">
          Enable to track directional accuracy on each kickoff. Disable to hide direction everywhere.
        </p>
        {dirEnabled && (
          <>
            <div>
              <p className="label">Direction System<Tooltip text="Numeric uses a 0/0.5/1 scale. Field-based lets you define custom direction zones (e.g. Sideline-Numbers, Numbers-Hash)." /></p>
              <div className="flex rounded-input border border-border overflow-hidden w-fit">
                <button
                  onClick={() => handleDirModeChange("numeric")}
                  className={clsx(
                    "px-4 py-2 text-xs font-semibold transition-colors",
                    dirMode === "numeric" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                  )}
                >
                  Numeric
                </button>
                <button
                  onClick={() => handleDirModeChange("field")}
                  className={clsx(
                    "px-4 py-2 text-xs font-semibold transition-colors border-l border-border",
                    dirMode === "field" ? "bg-accent text-slate-900" : "text-muted hover:text-white"
                  )}
                >
                  Field-Based
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1.5">
                {dirMode === "numeric"
                  ? "Numeric scoring (1.0, 0.5, 0) — calculates a direction percentage."
                  : "Field zones (Sideline-Numbers, Numbers-Hash, etc.) — shows % breakdown by zone."}
              </p>
            </div>

            <p className="label">Direction Options<Tooltip text={dirMode === "numeric" ? "Fixed scoring: 1.0 (on target), 0.5 (close), 0 (critical miss)." : "Assign a point value to each zone. Direction % = total points / attempts."} /></p>
        <>
            <div className="space-y-2">
              {directions.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  {dirMode === "field" && (
                  <select
                    value={d.score ?? 0}
                    onChange={(e) => setDirections(directions.map((x) => (x.id === d.id ? { ...x, score: parseFloat(e.target.value) } : x)))}
                    className="w-16 bg-surface-2 border border-border text-accent font-bold px-1 py-2 rounded-input text-sm text-center focus:outline-none focus:border-accent/60"
                  >
                    <option value={1}>1</option>
                    <option value={0.5}>0.5</option>
                    <option value={0}>0</option>
                    <option value={-1}>-1</option>
                  </select>
                  )}
                  <input
                    type="text"
                    value={d.label}
                    onChange={(e) => setDirections(directions.map((x) => (x.id === d.id ? { ...x, label: e.target.value } : x)))}
                    className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all"
                  />
                  <button
                    onClick={() => setDirections(directions.filter((x) => x.id !== d.id))}
                    className="w-8 h-8 rounded flex items-center justify-center text-muted hover:text-miss transition-colors text-sm"
                    title="Remove option"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newDir}
                onChange={(e) => setNewDir(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddDir(); }}
                placeholder="Add direction option..."
                className="flex-1 bg-surface-2 border border-border text-slate-200 px-3 py-2 rounded-input text-sm focus:outline-none focus:border-accent/60 transition-all placeholder:text-muted"
              />
              <button
                onClick={handleAddDir}
                disabled={!newDir.trim()}
                className="px-4 py-2 rounded-input text-sm font-semibold bg-accent/20 text-accent border border-accent/50 hover:bg-accent/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add
              </button>
            </div>
          </>
          </>
        )}
      </div>
      </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!dirty}
        className={clsx(
          "w-full py-3 rounded-input text-sm font-bold transition-all",
          saved
            ? "bg-make text-slate-900"
            : dirty
              ? "btn-primary"
              : "bg-surface-2 text-muted border border-border cursor-not-allowed"
        )}
      >
        {saved ? "✓ Saved!" : "Save Settings"}
      </button>

      {pendingRenames.length > 0 && (
        <RenameTypeModal
          oldLabel={pendingRenames[0].oldLabel}
          newLabel={pendingRenames[0].newLabel}
          onRename={() => handleRenameChoice("rename")}
          onMakeNew={() => handleRenameChoice("new")}
          onCancel={() => handleRenameChoice("cancel")}
        />
      )}
    </div>
  );
}
