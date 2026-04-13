"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "st_tutorial_seen";
const STEP_KEY = "st_tutorial_step";

/* ── Context ─────────────────────────────────────────────────────────────── */

interface TutorialCtx {
  show: () => void;
  active: boolean;
}

const TutorialContext = createContext<TutorialCtx>({ show: () => {}, active: false });

export const useTutorial = () => useContext(TutorialContext);

/* ── Step definitions ────────────────────────────────────────────────────── */

type TooltipPosition = "bottom" | "right" | "top" | "left" | "center";

interface TutorialStep {
  /** CSS selector to highlight, or null for a centered modal */
  selector: string | null;
  title: string;
  description: string;
  /** Which page this step should appear on */
  page: string;
  /** Position of tooltip relative to highlighted element */
  position: TooltipPosition;
  /** If set, clicking Next navigates here before advancing */
  navigateTo?: string;
  /** If true, this step has no highlighted element — just a centered card */
  isModal?: boolean;
}

const STEPS: TutorialStep[] = [
  // ── Welcome (dashboard) ──
  {
    selector: null,
    title: "Welcome to Specialist Tracker!",
    description:
      "Let\u2019s walk you through how the app works. We\u2019ll show you the main features step by step. You can skip at any time or reopen this tutorial from the sidebar.",
    page: "/dashboard",
    position: "center",
    isModal: true,
  },
  // ── Sidebar nav — highlight FG Kicking ──
  {
    selector: '[data-tutorial="nav-kicking"]',
    title: "FG Kicking Module",
    description:
      "This is the FG Kicking module. Each sport (Kicking, Punting, Kickoff) has its own section with a Session recorder, History log, Statistics dashboard, and Athlete roster.",
    page: "/dashboard",
    position: "right",
    navigateTo: "/kicking/session",
  },
  // ── Kicking sub-nav tabs ──
  {
    selector: '[data-tutorial="sport-subnav"]',
    title: "Sport Navigation Tabs",
    description:
      "Each sport module has these tabs: Session for recording kicks, Statistics for performance breakdowns, History to review past sessions, and Athletes to manage your roster.",
    page: "/kicking",
    position: "bottom",
  },
  // ── Mode toggle ──
  {
    selector: '[data-tutorial="mode-toggle"]',
    title: "Practice & Game Modes",
    description:
      "Switch between Practice and Game modes. Each mode keeps its own separate log so your practice data and game data never mix. Game mode adds fields for opponent and game time.",
    page: "/kicking",
    position: "bottom",
  },
  // ── Planning table ──
  {
    selector: '[data-tutorial="session-table"]',
    title: "The Session Log",
    description:
      "This is where you plan your session. Enter the athlete name, kick distance, and hash position for each kick. You can drag rows to reorder them and add more rows as needed.",
    page: "/kicking",
    position: "right",
  },
  // ── Live mode vs manual ──
  {
    selector: '[data-tutorial="entry-mode-toggle"]',
    title: "Live Mode vs Manual Entry",
    description:
      "Live Mode walks you through each kick one at a time with big result buttons — perfect for real-time tracking on the field. Manual Entry lets you fill in the table directly.",
    page: "/kicking",
    position: "bottom",
  },
  // ── Start session button ──
  {
    selector: '[data-tutorial="start-session"]',
    title: "Start Your Session",
    description:
      "Once your kicks are planned, hit this button to start the live session. You\u2019ll log each kick\u2019s result one by one. When you\u2019re done, commit the session to save it to your history and stats.",
    page: "/kicking",
    position: "top",
  },
  // ── Navigate to history ──
  {
    selector: '[data-tutorial="subnav-history"]',
    title: "Session History",
    description:
      "The History tab stores every committed session. You can review details, edit entries, export to Excel/PDF, or delete sessions you no longer need.",
    page: "/kicking",
    position: "bottom",
    navigateTo: "/kicking/statistics",
  },
  // ── Statistics page ──
  {
    selector: '[data-tutorial="subnav-statistics"]',
    title: "Statistics & Breakdowns",
    description:
      "The Statistics page gives you detailed breakdowns — overall FG percentage, stats by hash position, by distance range, miss charts, and more. Filter by date range or practice vs game.",
    page: "/kicking",
    position: "bottom",
    navigateTo: "/kicking/athletes",
  },
  // ── Athletes page ──
  {
    selector: '[data-tutorial="subnav-athletes"]',
    title: "Athlete Roster",
    description:
      "Manage your kicker roster here. Add athletes by name and they\u2019ll appear in the session dropdown. Each sport has its own independent roster.",
    page: "/kicking",
    position: "bottom",
  },
  // ── Sidebar — Punting & Kickoff ──
  {
    selector: '[data-tutorial="nav-punting"]',
    title: "Punting & Kickoff",
    description:
      "Punting and Kickoff modules work the same way — each has its own Session, History, Statistics, and Athletes pages with sport-specific fields like hang time, distance, and direction.",
    page: "/kicking",
    position: "right",
  },
  // ── Analytics ──
  {
    selector: '[data-tutorial="nav-analytics"]',
    title: "Cross-Sport Analytics",
    description:
      "The Analytics page lets you compare trends across all sports in one place — great for seeing the big picture of your special teams performance.",
    page: "/kicking",
    position: "right",
  },
  // ── Done ──
  {
    selector: null,
    title: "You\u2019re All Set!",
    description:
      "That\u2019s the tour! The same workflow applies to Punting and Kickoff. You can reopen this tutorial anytime from the Tutorial button in the sidebar. Now go track some specialists!",
    page: "/kicking",
    position: "center",
    isModal: true,
  },
];

/* ── Provider ────────────────────────────────────────────────────────────── */

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  // Auto-show on first visit
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Small delay so the page renders first
        const t = setTimeout(() => {
          setActive(true);
          setStep(0);
        }, 600);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  const show = useCallback(() => {
    setStep(0);
    setActive(true);
    try {
      localStorage.removeItem(STEP_KEY);
    } catch {}
  }, []);

  const close = useCallback(() => {
    setActive(false);
    setStep(0);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
      localStorage.removeItem(STEP_KEY);
    } catch {}
  }, []);

  const advance = useCallback(() => {
    const current = STEPS[step];
    if (step >= STEPS.length - 1) {
      close();
      return;
    }
    const nextStep = step + 1;
    // Navigate if needed
    if (current?.navigateTo) {
      router.push(current.navigateTo);
    }
    setStep(nextStep);
    try {
      localStorage.setItem(STEP_KEY, String(nextStep));
    } catch {}
  }, [step, close, router]);

  const goBack = useCallback(() => {
    if (step <= 0) return;
    const prevStep = step - 1;
    const prevDef = STEPS[prevStep];
    // Navigate to the page that step belongs to
    if (prevDef.page === "/dashboard" && !pathname.startsWith("/dashboard")) {
      router.push("/dashboard");
    } else if (prevDef.page === "/kicking" && !pathname.startsWith("/kicking")) {
      router.push("/kicking/session");
    }
    setStep(prevStep);
  }, [step, pathname, router]);

  // When page changes, check if we need to resume the tutorial at the right step
  useEffect(() => {
    if (!active) return;
    // Ensure step is on the right page
    const currentDef = STEPS[step];
    if (!currentDef) return;
    // The step expects a certain page prefix
    const onCorrectPage =
      currentDef.page === "/dashboard"
        ? pathname.startsWith("/dashboard")
        : pathname.startsWith(currentDef.page);
    // If not on the correct page, it's likely because we just navigated — wait for it
  }, [active, step, pathname]);

  return (
    <TutorialContext.Provider value={{ show, active }}>
      {children}
      {active && (
        <TutorialOverlay
          step={step}
          onNext={advance}
          onBack={goBack}
          onSkip={close}
        />
      )}
    </TutorialContext.Provider>
  );
}

/* ── Overlay ─────────────────────────────────────────────────────────────── */

function TutorialOverlay({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const def = STEPS[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Find and track the target element
  useEffect(() => {
    if (!def || def.isModal || !def.selector) {
      setRect(null);
      return;
    }

    const findAndMeasure = () => {
      const el = document.querySelector(def.selector!);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
      } else {
        setRect(null);
      }
      rafRef.current = requestAnimationFrame(findAndMeasure);
    };

    // Small delay to allow the page to render after navigation
    const timeout = setTimeout(() => {
      findAndMeasure();
    }, 150);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [def]);

  // Position tooltip relative to highlighted element
  useEffect(() => {
    if (!rect || !tooltipRef.current || !def || def.isModal) {
      setTooltipStyle({});
      return;
    }

    const tt = tooltipRef.current;
    const ttRect = tt.getBoundingClientRect();
    const pad = 16;
    const arrowGap = 12;

    let top = 0;
    let left = 0;

    switch (def.position) {
      case "bottom":
        top = rect.bottom + arrowGap;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
        break;
      case "top":
        top = rect.top - ttRect.height - arrowGap;
        left = rect.left + rect.width / 2 - ttRect.width / 2;
        break;
      case "right":
        top = rect.top + rect.height / 2 - ttRect.height / 2;
        left = rect.right + arrowGap;
        break;
      case "left":
        top = rect.top + rect.height / 2 - ttRect.height / 2;
        left = rect.left - ttRect.width - arrowGap;
        break;
    }

    // Clamp to viewport
    top = Math.max(pad, Math.min(top, window.innerHeight - ttRect.height - pad));
    left = Math.max(pad, Math.min(left, window.innerWidth - ttRect.width - pad));

    setTooltipStyle({ top, left, position: "fixed" });
  }, [rect, def]);

  if (!def || typeof document === "undefined") return null;

  const isLast = step === STEPS.length - 1;
  const progress = ((step + 1) / STEPS.length) * 100;

  // Modal mode (no highlight)
  if (def.isModal) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <TooltipCard
          step={step}
          def={def}
          progress={progress}
          isLast={isLast}
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
        />
      </div>,
      document.body
    );
  }

  // Spotlight mode
  return createPortal(
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Dark overlay with cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "auto" }}>
        <defs>
          <mask id="tutorial-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - 6}
                y={rect.top - 6}
                width={rect.width + 12}
                height={rect.height + 12}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.7)"
          mask="url(#tutorial-mask)"
        />
      </svg>

      {/* Highlight ring */}
      {rect && (
        <div
          className="absolute border-2 border-accent rounded-lg pointer-events-none"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 4px rgba(var(--accent-rgb, 99,102,241), 0.3), 0 0 20px rgba(var(--accent-rgb, 99,102,241), 0.2)",
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="pointer-events-auto"
        style={tooltipStyle.position ? tooltipStyle : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <TooltipCard
          step={step}
          def={def}
          progress={progress}
          isLast={isLast}
          onNext={onNext}
          onBack={onBack}
          onSkip={onSkip}
        />
      </div>
    </div>,
    document.body
  );
}

/* ── Tooltip Card ────────────────────────────────────────────────────────── */

function TooltipCard({
  step,
  def,
  progress,
  isLast,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  def: TutorialStep;
  progress: number;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="relative w-80 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden">
      {/* Progress bar */}
      <div className="h-1 bg-border">
        <div
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="p-4">
        {/* Step counter */}
        <p className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-2">
          {step + 1} / {STEPS.length}
        </p>

        {/* Title */}
        <h3 className="text-base font-extrabold text-slate-100 mb-1.5">
          {def.title}
        </h3>

        {/* Description */}
        <p className="text-xs text-slate-300 leading-relaxed mb-4">
          {def.description}
        </p>

        {/* Progress dots */}
        <div className="flex gap-1 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all flex-1 ${
                i === step
                  ? "bg-accent"
                  : i < step
                  ? "bg-accent/40"
                  : "bg-border"
              }`}
            />
          ))}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2">
          {step > 0 ? (
            <button
              onClick={onBack}
              className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-slate-200 hover:bg-surface-2 transition-colors"
            >
              Back
            </button>
          ) : (
            <button
              onClick={onSkip}
              className="flex-1 py-2 rounded-lg border border-border text-xs font-semibold text-muted hover:text-slate-200 hover:bg-surface-2 transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={onNext}
            className="flex-1 py-2 rounded-lg bg-accent text-bg text-xs font-bold hover:brightness-110 transition-all"
          >
            {isLast ? "Finish" : def.navigateTo ? "Next \u2192" : "Next"}
          </button>
        </div>

        {step > 0 && (
          <button
            onClick={onSkip}
            className="w-full mt-2 text-[10px] text-muted hover:text-slate-300 transition-colors"
          >
            Skip tutorial
          </button>
        )}
      </div>
    </div>
  );
}
