"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

// Normalizes "#abc", "abc", "#AABBCC", "aabbcc" → "#aabbcc"; null if not a valid hex code.
export function normalizeHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s.split("").map((c) => c + c).join("")}`;
  return null;
}

interface HexColorInputProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  ariaLabel?: string;
}

// Text box for typing an exact hex color code. Applies the color as soon as a
// full 6-digit code is typed (or a 3-digit code on blur / Enter); reverts if
// the text left behind isn't a valid code.
export function HexColorInput({ value, onChange, className, ariaLabel }: HexColorInputProps) {
  const [text, setText] = useState(value.replace(/^#/, "").toUpperCase());

  useEffect(() => {
    setText(value.replace(/^#/, "").toUpperCase());
  }, [value]);

  const commit = () => {
    const hex = normalizeHex(text);
    if (hex) {
      if (hex !== value.toLowerCase()) onChange(hex);
      setText(hex.slice(1).toUpperCase());
    } else {
      setText(value.replace(/^#/, "").toUpperCase());
    }
  };

  const invalid = text.length > 0 && !normalizeHex(text);

  return (
    <div
      className={clsx(
        "flex items-center rounded-input border bg-surface-2 px-1.5 font-mono text-[11px]",
        invalid ? "border-miss" : "border-border",
        className
      )}
    >
      <span className="text-muted">#</span>
      <input
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        maxLength={7}
        aria-label={ariaLabel ?? "Hex color code"}
        value={text}
        onChange={(e) => {
          const next = e.target.value.replace(/^#/, "").replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
          setText(next);
          if (next.length === 6) {
            const hex = `#${next.toLowerCase()}`;
            if (hex !== value.toLowerCase()) onChange(hex);
          }
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-full min-w-0 bg-transparent py-1 pl-0.5 text-slate-200 outline-none"
      />
    </div>
  );
}
