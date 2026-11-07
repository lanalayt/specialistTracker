import Link from "next/link";
import { ScreenshotCarousel, type Slide } from "@/components/landing/ScreenshotCarousel";

// Public landing page. Logged-in visitors are sent straight to /dashboard by
// the middleware, so this is only ever shown to people who aren't signed in.

// Add real screenshots to /public/landing/ and set `src` on each slide.
const SLIDES: Slide[] = [
  { title: "Dashboard", caption: "Your whole special teams unit at a glance." },
  { title: "Live charting", caption: "Chart every rep from the sideline, right from your phone." },
  { title: "Statistics", caption: "Season and career numbers for every specialist." },
  { title: "Session history", caption: "Go back to any practice or game and see every kick." },
  { title: "Scouting", caption: "Chart opponents and keep every report in one place." },
];

const PHASES = [
  { title: "Field Goals", img: "/kicker-fg.png", stat: "Make % by distance & hash" },
  { title: "Punting", img: "/punter.png", stat: "Gross, hang time & punt type" },
  { title: "Kickoffs", img: "/kickoff-kicker.png", stat: "Depth, hang & placement" },
  { title: "Long Snap", img: "/snapper.png", stat: "Snap times & accuracy" },
];

// Faint yard lines behind the hero.
const FIELD_LINES =
  "repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 120px)";

export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg text-slate-100">
      {/* Top bar */}
      <header
        className="fixed inset-x-0 top-0 z-30 border-b border-border backdrop-blur"
        style={{ backgroundColor: "rgba(10, 15, 20, 0.7)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Specialist Tracker home">
            <img src="/logo-mark.svg" alt="" className="h-9 w-9" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">Log in</Link>
            <Link href="/signup" className="btn-primary">Sign up</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative px-4 pt-28 sm:px-6 sm:pt-32">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: FIELD_LINES }} />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[700px] w-[1100px] -translate-x-1/2"
          style={{ background: "radial-gradient(50% 50% at 50% 35%, rgba(0,212,160,0.22), rgba(229,182,73,0.06) 45%, transparent 75%)" }}
        />

        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
          <img
            src="/logo-stacked.svg"
            alt="Specialist Tracker"
            className="w-72 sm:w-96 lg:w-[460px]"
            style={{ filter: "drop-shadow(0 0 60px rgba(0,212,160,0.35))" }}
          />
          <h1 className="mt-6 max-w-4xl text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
            Every kick. Every punt.{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(90deg, #00d4a0, #E5B649)" }}>
              Every snap.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted sm:text-xl">
            The performance platform built for special teams. Chart practice and game reps, and see the numbers that
            win games.
          </p>
          <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link href="/login" className="btn-primary w-full px-10 py-4 text-base shadow-accent-lg sm:w-auto">
              Log in
            </Link>
            <Link href="/signup" className="btn-ghost w-full px-10 py-4 text-base sm:w-auto">
              Create an account
            </Link>
          </div>
        </div>

        {/* App showcase */}
        <div className="relative mt-20 pb-24">
          <ScreenshotCarousel slides={SLIDES} />
        </div>
      </section>

      {/* Phases */}
      <section className="relative border-t border-border bg-surface px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <p className="text-center text-sm font-bold uppercase tracking-[0.3em] text-accent">One app. Whole unit.</p>
          <h2 className="mt-3 text-center text-3xl font-black uppercase tracking-tight sm:text-5xl">
            Built for every specialist
          </h2>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PHASES.map((p) => (
              <div
                key={p.title}
                className="group relative overflow-hidden rounded-card border border-border p-6 pt-8 transition hover:-translate-y-1"
                style={{ background: "linear-gradient(180deg, var(--surface-2), var(--bg))" }}
              >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ background: "linear-gradient(90deg, #00d4a0, #E5B649)" }}
                />
                <div className="flex h-48 items-end justify-center">
                  <img
                    src={p.img}
                    alt=""
                    className="max-h-48 w-auto object-contain transition duration-500 group-hover:scale-105"
                  />
                </div>
                <h3 className="mt-6 text-2xl font-black uppercase tracking-tight">{p.title}</h3>
                <p className="mt-1 text-sm text-muted">{p.stat}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="relative overflow-hidden px-4 py-28 text-center sm:px-6">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: FIELD_LINES }} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(40% 60% at 50% 50%, rgba(0,212,160,0.18), transparent 70%)" }}
        />
        <div className="relative">
          <h2 className="text-4xl font-black uppercase tracking-tight sm:text-6xl">Ready to get started?</h2>
          <p className="mt-4 text-lg text-muted">Sign in to your team, or create an account to set one up.</p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/login" className="btn-primary w-full px-10 py-4 text-base shadow-accent-lg sm:w-auto">
              Log in
            </Link>
            <Link href="/signup" className="btn-ghost w-full px-10 py-4 text-base sm:w-auto">
              Sign up
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <img src="/logo-lockup.svg" alt="Specialist Tracker" className="h-7 w-auto opacity-80" />
          <span>© {new Date().getFullYear()} Specialist Tracker</span>
        </div>
      </footer>
    </div>
  );
}
