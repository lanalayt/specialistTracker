// Tutorial videos shown on the public /tutorials page.
//
// To add a video, fill in ONE of these on the tutorial:
//   youtube: "https://www.youtube.com/watch?v=XXXXXXXXXXX"   (or a youtu.be / shorts link)
//   src:     "/tutorials/punting-session.mp4"                (a file placed in public/tutorials/)
// Tutorials with neither show as "Coming soon".
// Add, remove or reorder tutorials and sections freely.

export type Tutorial = {
  title: string;
  description: string;
  youtube?: string;
  src?: string;
  /** Optional preview image shown before a video file plays. */
  poster?: string;
};

export type TutorialSection = {
  id: string;
  title: string;
  icon?: string;
  tutorials: Tutorial[];
};

export const TUTORIAL_SECTIONS: TutorialSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    icon: "/logo-mark.svg",
    tutorials: [
      { title: "Creating your team", description: "Sign up, name your team and set your school colors." },
      { title: "Adding athletes", description: "Build your roster and assign each athlete to their phases." },
      { title: "Inviting coaches and athletes", description: "Give staff and players their own logins." },
      {
        title: "Manual Charting (FG, Kickoff & Punting)",
        description: "Enter a practice from film or notes, star key reps, and commit it to your stats.",
        src: "/tutorials/manual-charting.mp4",
        poster: "/tutorials/manual-charting.jpg",
      },
    ],
  },
  {
    id: "fg-kicking",
    title: "FG Kicking",
    icon: "/kicker-fg.png",
    tutorials: [
      {
        title: "Charting a FG Session - Manually",
        description: "Enter a practice after the fact from film or notes, star key reps, and commit it to your stats.",
        src: "/tutorials/fg-manual-charting.mp4",
        poster: "/tutorials/fg-manual-charting.jpg",
      },
      {
        title: "Charting a FG Session - Live",
        description: "Plan your kicks, then log each one live with the result, op timer and kick score.",
        src: "/tutorials/fg-live-charting.mp4",
        poster: "/tutorials/fg-live-charting.jpg",
      },
      {
        title: "Charting a FG Game",
        description: "Enter each kick on game day, save it to the chart and drag it to where the ball went.",
        src: "/tutorials/fg-game-charting.mp4",
        poster: "/tutorials/fg-game-charting.jpg",
      },
      { title: "Reading your FG statistics", description: "Make %, kick score, long FG and splits by hash." },
    ],
  },
  {
    id: "punting",
    title: "Punting",
    icon: "/punter.png",
    tutorials: [
      {
        title: "Charting a Punt Session - Manually",
        description: "Enter a practice after the fact from film or notes, see what you can customize, and commit it to your stats.",
        src: "/tutorials/punt-manual-charting.mp4",
        poster: "/tutorials/punt-manual-charting.jpg",
      },
      { title: "Game charting", description: "Chart punts on game day with net, returns and the live punt chart." },
      { title: "Charting games", description: "Line Golf, Punt Battle and the Big Ball Calculator." },
    ],
  },
  {
    id: "kickoff",
    title: "Kickoff",
    icon: "/kickoff-kicker.png",
    tutorials: [
      { title: "Charting kickoffs", description: "Track depth, hang time and placement." },
    ],
  },
  {
    id: "snapping",
    title: "Long Snapping",
    icon: "/snapper.png",
    tutorials: [
      { title: "Charting snaps", description: "Log accuracy, laces and spiral and mark where each snap hit." },
    ],
  },
  {
    id: "scouting",
    title: "Scouting",
    tutorials: [
      { title: "Charting and ranking kickers", description: "Run a preset chart and get instant rankings you can export." },
    ],
  },
];

/** Turns any common YouTube link into an embeddable URL, or null if it isn't one. */
export function youtubeEmbedUrl(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` : null;
}
