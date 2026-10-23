"use client";

import React, { useEffect, useState } from "react";
import clsx from "clsx";
import { buildOpponent, parseOpponent } from "@/lib/opponent";

interface Props {
  value: string;
  // Receives the combined "vs Mesa" / "@ Mesa" string.
  onChange: (value: string) => void;
  // When true, typing only commits on blur/Enter (history edits); the
  // Home/Away toggle always commits immediately.
  commitOnBlur?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

export default function OpponentInput({
  value,
  onChange,
  commitOnBlur = false,
  placeholder = "Opponent",
  className,
  inputClassName,
}: Props) {
  const parsed = parseOpponent(value);
  const [away, setAway] = useState(parsed.away);
  const [name, setName] = useState(parsed.name);

  // Follow outside changes (draft restore, mode switch, clear). A blank value
  // keeps the chosen Home/Away so it isn't lost before a name is typed.
  // Skips our own echoes so a trailing space mid-typing ("San ") survives.
  useEffect(() => {
    if (value === buildOpponent(away, name)) return;
    const p = parseOpponent(value);
    setName(p.name);
    if (p.name) setAway(p.away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const pickSide = (nextAway: boolean) => {
    setAway(nextAway);
    onChange(buildOpponent(nextAway, name));
  };

  return (
    <div className={clsx("flex items-stretch gap-1 min-w-0", className)}>
      <div className="flex rounded-input border border-border overflow-hidden shrink-0">
        {([false, true] as const).map((isAway) => (
          <button
            key={String(isAway)}
            type="button"
            onClick={() => pickSide(isAway)}
            title={isAway ? "Away game (@ Opponent)" : "Home game (vs Opponent)"}
            className={clsx(
              "px-2 text-[10px] font-bold uppercase tracking-wider transition-colors",
              isAway && "border-l border-border",
              away === isAway ? "bg-accent text-slate-900" : "bg-surface-2 text-muted hover:text-white"
            )}
          >
            {isAway ? "Away" : "Home"}
          </button>
        ))}
      </div>
      <div className="relative flex-1 min-w-0">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-muted pointer-events-none">
          {away ? "@" : "vs"}
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!commitOnBlur) onChange(buildOpponent(away, e.target.value));
          }}
          onBlur={() => {
            if (commitOnBlur) onChange(buildOpponent(away, name));
          }}
          onKeyDown={(e) => {
            if (commitOnBlur && e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder={placeholder}
          className={clsx("w-full", away ? "pl-6" : "pl-7", inputClassName)}
        />
      </div>
    </div>
  );
}
