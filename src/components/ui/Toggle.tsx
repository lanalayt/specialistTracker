"use client";

import clsx from "clsx";

/**
 * On/off switch used across the settings pages.
 * When ON it fills with the team's border color (the tertiary color chosen in
 * Settings) and shows an "On" label; when OFF it's white with an "Off" label.
 * So the colored state is always the ON state, matching the chosen theme.
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
        "relative inline-flex items-center shrink-0 w-16 h-7 rounded-full border border-border transition-colors",
        checked ? "bg-border" : "bg-white",
        className
      )}
    >
      {/* Label sits on the side opposite the knob so they never overlap */}
      <span
        className={clsx(
          "absolute text-[10px] font-bold uppercase tracking-wide transition-all",
          checked ? "left-2.5 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.5)]" : "right-2.5 text-slate-500"
        )}
      >
        {checked ? "On" : "Off"}
      </span>
      <span
        className={clsx(
          "absolute top-0.5 w-6 h-6 rounded-full shadow ring-1 ring-black/10 transition-all",
          checked ? "left-[38px] bg-white" : "left-0.5 bg-slate-400"
        )}
      />
    </button>
  );
}
