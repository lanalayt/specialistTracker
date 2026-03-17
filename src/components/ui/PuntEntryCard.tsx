"use client";

import React, { useState } from "react";
import type { PuntEntry, PuntType, PuntHash, PuntLandingZone } from "@/types";
import { PUNT_TYPES, PUNT_HASHES, PUNT_LANDING_ZONES } from "@/types";
import clsx from "clsx";

const TYPE_LABELS: Record<PuntType, string> = {
  RED: "Red",
  BLUE: "Blue",
  POOCH_BLUE: "P-Blue",
  POOCH_RED: "P-Red",
  BROWN: "Brown",
};

const POS_LABELS: Record<PuntHash, string> = {
  LH: "LH",
  LM: "LM",
  M: "M",
  RM: "RM",
  RH: "RH",
};

const LANDING_LABELS: Record<PuntLandingZone, string> = {
  TB: "TB",
  inside10: "In 10",
  inside20: "In 20",
  returned: "Returned",
  fairCatch: "Fair Catch",
};

const LANDING_COLORS_ACTIVE: Record<PuntLandingZone, string> = {
  TB: "text-warn border-warn/50 bg-warn/10",
  inside10: "text-make border-make/50 bg-make/10",
  inside20: "text-make border-make/40 bg-make/5",
  returned: "text-miss border-miss/50 bg-miss/10",
  fairCatch: "text-accent border-accent/50 bg-accent/10",
};

interface PuntEntryCardProps {
  athletes: string[];
  puntCount: number;
  onAdd: (punt: PuntEntry) => void;
}

export function PuntEntryCard({ athletes, puntCount, onAdd }: PuntEntryCardProps) {
  const [athlete, setAthlete] = useState<string>(athletes[0] ?? "");
  const [type, setType] = useState<PuntType>("RED");
  const [hash, setHash] = useState<PuntHash>("M");
  const [yards, setYards] = useState<string>("42");
  const [hangTime, setHangTime] = useState<string>("4.5");
  const [opTime, setOpTime] = useState<string>("");
  const [landingZones, setLandingZones] = useState<PuntLandingZone[]>([]);
  const [returnYards, setReturnYards] = useState<string>("0");
  const [directionalAccuracy, setDirectionalAccuracy] = useState<0 | 0.5 | 1>(1);
  const [poochLandingYardLine, setPoochLandingYardLine] = useState<string>("");

  const toggleZone = (zone: PuntLandingZone) => {
    setLandingZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    );
  };

  const handleLog = () => {
    if (!athlete || !yards || !hangTime) return;
    const punt: PuntEntry = {
      athleteId: athlete,
      athlete,
      type,
      hash,
      yards: parseInt(yards) || 0,
      hangTime: parseFloat(hangTime) || 0,
      opTime: parseFloat(opTime) || 0,
      landingZones,
      returnYards: landingZones.includes("returned") ? parseInt(returnYards) || 0 : undefined,
      directionalAccuracy,
      poochLandingYardLine:
        type === "POOCH_BLUE" || type === "POOCH_RED" && poochLandingYardLine !== ""
          ? parseInt(poochLandingYardLine) || undefined
          : undefined,
    };
    onAdd(punt);
    // Reset per-kick fields; keep athlete/type/hash sticky
    setLandingZones([]);
    setDirectionalAccuracy(1);
    setReturnYards("0");
    setPoochLandingYardLine("");
  };

  return (
    <div className="p-3 space-y-3">
      {/* Athlete */}
      <div className="flex flex-wrap gap-1.5">
        {athletes.map((a) => (
          <button
            key={a}
            onClick={() => setAthlete(a)}
            className={clsx(
              "px-3 py-1.5 rounded-input text-sm font-medium transition-all",
              athlete === a
                ? "bg-accent text-slate-900 font-bold"
                : "bg-surface-2 text-slate-300 border border-border hover:bg-surface-2/80"
            )}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Hash + Type — single compact row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex gap-1">
          {PUNT_HASHES.map((h) => (
            <button
              key={h}
              onClick={() => setHash(h)}
              className={clsx(
                "flex-1 py-1.5 rounded-input text-xs font-semibold transition-all",
                hash === h
                  ? "bg-accent/20 text-accent border border-accent/50"
                  : "bg-surface-2 text-muted border border-border hover:text-slate-300"
              )}
            >
              {POS_LABELS[h]}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {PUNT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={clsx(
                "flex-1 py-1.5 rounded-input text-[10px] font-semibold transition-all",
                type === t
                  ? "bg-accent/20 text-accent border border-accent/50"
                  : "bg-surface-2 text-muted border border-border hover:text-slate-300"
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Yards + Hang Time + Opp Time */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="label">Yards</p>
          <input
            className="input text-center text-lg font-bold"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="42"
            value={yards}
            onChange={(e) => setYards(e.target.value)}
          />
        </div>
        <div>
          <p className="label">Hang (s)</p>
          <input
            className="input text-center text-lg font-bold"
            type="text"
            inputMode="decimal"
            placeholder="4.5"
            value={hangTime}
            onChange={(e) => setHangTime(e.target.value)}
          />
        </div>
        <div>
          <p className="label">Opp Time (s)</p>
          <input
            className="input text-center text-lg font-bold"
            type="text"
            inputMode="decimal"
            placeholder="sec"
            value={opTime}
            onChange={(e) => setOpTime(e.target.value)}
          />
        </div>
      </div>

      {/* Landing Zones (multi-select; none = implied beyond 20) */}
      <div>
        <p className="label">Landing <span className="text-muted font-normal normal-case">(none = beyond 20)</span></p>
        <div className="grid grid-cols-5 gap-1">
          {PUNT_LANDING_ZONES.map((z) => {
            const active = landingZones.includes(z);
            return (
              <button
                key={z}
                onClick={() => toggleZone(z)}
                className={clsx(
                  "py-1.5 rounded-input text-xs font-semibold border transition-all",
                  active
                    ? LANDING_COLORS_ACTIVE[z]
                    : "bg-surface-2 text-muted border-border hover:text-slate-300"
                )}
              >
                {LANDING_LABELS[z]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pooch yard line — only when type=POOCH */}
      {type === "POOCH_BLUE" || type === "POOCH_RED" && (
        <div>
          <p className="label">Landing Yard Line</p>
          <input
            className="input w-24 text-center"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="15"
            value={poochLandingYardLine}
            onChange={(e) => setPoochLandingYardLine(e.target.value)}
          />
        </div>
      )}

      {/* Return yards — only when "returned" is in zones */}
      {landingZones.includes("returned") && (
        <div>
          <p className="label">Return Yards</p>
          <input
            className="input w-24 text-center"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="0"
            value={returnYards}
            onChange={(e) => setReturnYards(e.target.value)}
          />
        </div>
      )}

      {/* Directional Accuracy */}
      <div>
        <p className="label">Directional Accuracy</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => setDirectionalAccuracy(1)}
            className={clsx(
              "py-2 rounded-input text-xs font-semibold border transition-all",
              directionalAccuracy === 1
                ? "bg-make/20 text-make border-make/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
            )}
          >
            ✓ Good
          </button>
          <button
            onClick={() => setDirectionalAccuracy(0.5)}
            className={clsx(
              "py-2 rounded-input text-xs font-semibold border transition-all",
              directionalAccuracy === 0.5
                ? "bg-warn/20 text-warn border-warn/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
            )}
          >
            → Mid
          </button>
          <button
            onClick={() => setDirectionalAccuracy(0)}
            className={clsx(
              "py-2 rounded-input text-xs font-semibold border transition-all",
              directionalAccuracy === 0
                ? "bg-miss/20 text-miss border-miss/50"
                : "bg-surface-2 text-muted border-border hover:text-slate-300"
            )}
          >
            ✗ Critical
          </button>
        </div>
      </div>

      <button
        onClick={handleLog}
        disabled={!athlete || !yards || !hangTime}
        className="btn-primary w-full py-2.5 text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        LOG PUNT #{puntCount + 1}
      </button>
    </div>
  );
}
