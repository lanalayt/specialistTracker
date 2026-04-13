"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { GoalpostIcon, PuntFootIcon, KickoffTeeIcon } from "@/components/ui/SportIcons";

const STORAGE_KEY = "st_tutorial_seen";

/* ── Context ─────────────────────────────────────────────────────────────── */

interface TutorialCtx {
  show: () => void;
}

const TutorialContext = createContext<TutorialCtx>({ show: () => {} });

export const useTutorial = () => useContext(TutorialContext);

/* ── Steps ───────────────────────────────────────────────────────────────── */

interface TutorialStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: TutorialStep[] = [
  {
    title: "Welcome to Specialist Tracker",
    description:
      "Your all-in-one platform for tracking special teams performance. Let\u2019s walk you through the key features so you can hit the ground running.",
    icon: <span className="text-4xl">&#9889;</span>,
  },
  {
    title: "Sport Modules",
    description:
      "Track FG Kicking, Punting, and Kickoff stats independently. Each sport has its own session recorder, history log, statistics dashboard, and athlete roster.",
    icon: (
      <div className="flex items-center gap-3">
        <GoalpostIcon size={32} />
        <PuntFootIcon size={32} />
        <KickoffTeeIcon size={32} />
      </div>
    ),
  },
  {
    title: "Recording Sessions",
    description:
      "Navigate to any sport module and open a new session. Add athletes, log each attempt in real-time, then commit the session to save it to your history.",
    icon: <span className="text-4xl">&#128221;</span>,
  },
  {
    title: "Statistics & Analytics",
    description:
      "View per-athlete and team-wide stats on each sport\u2019s Statistics page, or visit the Analytics page for cross-sport comparisons and trends.",
    icon: <span className="text-4xl">&#128202;</span>,
  },
  {
    title: "Team Management",
    description:
      "Coaches can manage athletes, customize team colors and logos in Settings, and share data with athletes in real-time across devices.",
    icon: <span className="text-4xl">&#128101;</span>,
  },
  {
    title: "You\u2019re All Set!",
    description:
      "You can reopen this tutorial anytime from the sidebar. Now go track some specialists!",
    icon: <span className="text-4xl">&#127942;</span>,
  },
];

/* ── Provider ────────────────────────────────────────────────────────────── */

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Auto-show on first visit
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {}
  }, []);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {}
  }, []);

  return (
    <TutorialContext.Provider value={{ show }}>
      {children}
      <TutorialModal open={open} onClose={hide} />
    </TutorialContext.Provider>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

function TutorialModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);

  // Reset step when reopened
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  const handleNext = () => {
    if (isLast) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Card */}
      <div className="relative w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-border">
          <div
            className="h-full bg-accent transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 text-center">
          {/* Step counter */}
          <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-4">
            Step {step + 1} of {STEPS.length}
          </p>

          {/* Icon */}
          <div className="flex justify-center mb-4 text-accent">
            {current.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-extrabold text-slate-100 mb-2">
            {current.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-slate-300 leading-relaxed mb-6">
            {current.description}
          </p>

          {/* Dots */}
          <div className="flex justify-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === step
                    ? "bg-accent w-6"
                    : i < step
                    ? "bg-accent/40"
                    : "bg-border"
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button
                onClick={handleBack}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-slate-200 hover:bg-surface-2 transition-colors"
              >
                Back
              </button>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-muted hover:text-slate-200 hover:bg-surface-2 transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex-1 py-2.5 rounded-lg bg-accent text-bg text-sm font-bold hover:brightness-110 transition-all"
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
