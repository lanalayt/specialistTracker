"use client";

import clsx from "clsx";

/**
 * On/off switch used across the settings pages.
 * Colored (accent) with an "On" label when enabled; the team's border color
 * with an "Off" label when disabled — so it always matches the theme chosen
 * in Settings. The white knob keeps the state readable on either track.
 */
export function Toggle({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex items-center shrink-0 w-16 h-7 rounded-full border transition-colors",
        checked ? "bg-accent border-accent" : "bg-border border-border",
        className
      )}
    >
      {/* Label sits on the side opposite the knob so they never overlap */}
      <span
        className={clsx(
          "absolute text-[10px] font-bold uppercase tracking-wide transition-all",
          checked ? "left-2.5 text-slate-900" : "right-2.5 text-muted"
        )}
      >
        {checked ? "On" : "Off"}
      </span>
      <span
        className={clsx(
          "absolute top-0.5 w-6 h-6 rounded-full bg-white shadow ring-1 ring-black/10 transition-all",
          checked ? "left-[38px]" : "left-0.5"
        )}
      />
    </button>
  );
}
