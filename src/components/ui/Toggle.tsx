"use client";

import clsx from "clsx";

/**
 * On/off switch used across the settings pages.
 * Colored (accent) with an "On" label when enabled; white with an "Off"
 * label when disabled — so the state reads clearly at a glance.
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
        checked ? "bg-accent border-accent" : "bg-white border-border",
        className
      )}
    >
      {/* Label sits on the side opposite the knob so they never overlap */}
      <span
        className={clsx(
          "absolute text-[10px] font-bold uppercase tracking-wide transition-all",
          checked ? "left-2.5 text-slate-900" : "right-2.5 text-slate-500"
        )}
      >
        {checked ? "On" : "Off"}
      </span>
      <span
        className={clsx(
          "absolute top-0.5 w-6 h-6 rounded-full shadow transition-all",
          checked ? "left-[38px] bg-white" : "left-0.5 bg-slate-400"
        )}
      />
    </button>
  );
}
