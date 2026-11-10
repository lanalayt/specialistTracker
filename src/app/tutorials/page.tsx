import Link from "next/link";
import type { Metadata } from "next";
import { TUTORIAL_SECTIONS, youtubeEmbedUrl, type Tutorial } from "@/lib/tutorials";

export const metadata: Metadata = {
  title: "Tutorials · Specialist Tracker",
  description: "Video walkthroughs of how to use Specialist Tracker.",
};

export default function TutorialsPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg text-slate-100">
      <header
        className="sticky inset-x-0 top-0 z-30 border-b border-border backdrop-blur"
        style={{ backgroundColor: "rgba(10, 15, 20, 0.7)" }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Specialist Tracker home">
            <img src="/logo-mark.svg" alt="" className="h-9 w-9" />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/login" className="btn-ghost">Log in</Link>
            <Link href="/signup" className="btn-primary">Sign up</Link>
          </nav>
        </div>
      </header>

      {/* Title */}
      <section className="relative px-4 pb-10 pt-16 text-center sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[900px] -translate-x-1/2"
          style={{ background: "radial-gradient(50% 50% at 50% 30%, rgba(0,212,160,0.18), transparent 75%)" }}
        />
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">Learn the app</p>
          <h1 className="mt-3 text-4xl font-black uppercase tracking-tight sm:text-6xl">Tutorials</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
            Short videos that walk you through every part of Specialist Tracker.
          </p>

          {/* Jump links */}
          <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
            {TUTORIAL_SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-pill border border-border px-4 py-1.5 text-sm text-slate-200 transition hover:border-accent hover:text-accent"
              >
                {s.title}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Sections */}
      <main className="mx-auto max-w-7xl space-y-16 px-4 pb-24 sm:px-6">
        {TUTORIAL_SECTIONS.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <div className="mb-6 flex items-center gap-3">
              {section.icon && <img src={section.icon} alt="" className="h-10 w-10 object-contain" />}
              <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">{section.title}</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.tutorials.map((t) => (
                <TutorialCard key={t.title} tutorial={t} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
          <Link href="/">
            <img src="/logo-lockup.svg" alt="Specialist Tracker" className="h-7 w-auto opacity-80" />
          </Link>
          <span>© {new Date().getFullYear()} Specialist Tracker</span>
        </div>
      </footer>
    </div>
  );
}

function TutorialCard({ tutorial }: { tutorial: Tutorial }) {
  const embed = tutorial.youtube ? youtubeEmbedUrl(tutorial.youtube) : null;

  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="relative aspect-video w-full bg-bg">
        {embed ? (
          <iframe
            src={embed}
            title={tutorial.title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : tutorial.src ? (
          <video
            src={tutorial.src}
            poster={tutorial.poster}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: "repeating-linear-gradient(135deg, var(--surface) 0 16px, var(--bg) 16px 32px)" }}
          >
            <span
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border text-lg text-muted"
              style={{ background: "rgba(10,15,20,0.8)" }}
            >
              ▶
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-muted">Coming soon</span>
          </div>
        )}
      </div>
      <div className="p-5">
        <h3 className="font-bold">{tutorial.title}</h3>
        <p className="mt-1 text-sm text-muted">{tutorial.description}</p>
      </div>
    </div>
  );
}
