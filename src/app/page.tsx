import Link from "next/link";

// Public landing page. Logged-in visitors are sent straight to /dashboard by
// the middleware, so this is only ever shown to people who aren't signed in.

const PHASES = [
  {
    title: "Field Goals & PATs",
    img: "/kicker-fg.png",
    body: "Log every kick by distance and hash. Track make percentage, misses by direction, and trends over time.",
  },
  {
    title: "Punting",
    img: "/punter.png",
    body: "Record gross, hang time, and punt type for every rep, in practice and on game day.",
  },
  {
    title: "Kickoffs",
    img: "/kickoff-kicker.png",
    body: "Chart depth, hang time, and placement so you know what your kickoff unit is actually doing.",
  },
  {
    title: "Long Snapping",
    img: "/snapper.png",
    body: "Time punt and field goal snaps and chart accuracy, so snappers get the same detail as kickers.",
  },
];

const FEATURES = [
  {
    title: "Practice & game sessions",
    body: "Run a live session from the sideline on your phone, then review it later in history.",
  },
  {
    title: "Statistics & charts",
    body: "Season and career numbers for every specialist, with charts built from the reps you log.",
  },
  {
    title: "Scouting",
    body: "Chart opponents' kickers, punters, and snappers and keep the reports in one place.",
  },
  {
    title: "Coaches & athletes",
    body: "Coaches manage the team. Athletes get their own login to see their numbers.",
  },
  {
    title: "Exports",
    body: "Download stats as PDF or Excel to share with staff, recruiters, or players.",
  },
  {
    title: "Your team's colors",
    body: "Set your school colors and the whole app is themed to match.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bg text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border backdrop-blur" style={{ backgroundColor: "rgba(10, 15, 20, 0.9)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo-mark.svg" alt="" className="h-8 w-8" />
            <span className="text-base font-extrabold tracking-tight">Specialist Tracker</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">
              Log in
            </Link>
            <Link href="/signup" className="btn-primary hidden sm:inline-block">
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24">
        <img src="/logo-mark.svg" alt="" className="mx-auto mb-6 h-16 w-16" />
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          Every kick, punt, and snap, <span className="text-accent">tracked.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-muted sm:text-lg">
          Specialist Tracker is a performance platform built for special teams. Chart practice and game
          reps for your kickers, punters, and long snappers, and see the numbers that matter.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary w-full px-8 py-3 text-base sm:w-auto">
            Log in
          </Link>
          <Link href="/signup" className="btn-ghost w-full px-8 py-3 text-base sm:w-auto">
            Create an account
          </Link>
        </div>
      </section>

      {/* Phases */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h2 className="mb-2 text-center text-2xl font-bold">Built for every specialist</h2>
        <p className="mb-10 text-center text-muted">One place for the whole special teams unit.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PHASES.map((p) => (
            <div key={p.title} className="card flex flex-col items-center text-center">
              <div className="mb-4 flex h-32 items-end justify-center">
                <img src={p.img} alt="" className="max-h-32 w-auto object-contain" />
              </div>
              <h3 className="mb-2 text-lg font-bold">{p.title}</h3>
              <p className="text-sm text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="mb-10 text-center text-2xl font-bold">Everything your staff needs</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card-2">
                <div className="mb-3 h-1 w-8 rounded-pill bg-accent" />
                <h3 className="mb-1 font-bold">{f.title}</h3>
                <p className="text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight">Ready to get started?</h2>
        <p className="mt-3 text-muted">Sign in to your team, or create an account to set one up.</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary w-full px-8 py-3 text-base sm:w-auto">
            Log in
          </Link>
          <Link href="/signup" className="btn-ghost w-full px-8 py-3 text-base sm:w-auto">
            Sign up
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Specialist Tracker</span>
          <span>Special teams performance platform</span>
        </div>
      </footer>
    </div>
  );
}
