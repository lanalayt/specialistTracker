"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getTeamId } from "@/lib/teamData";
import { loadScoutRankings, loadArchivedRankingIds, saveArchivedRankingIds, type ScoutRanking } from "@/lib/scoutStore";

const SPORT_LINKS = [
  { label: "FG", path: "/scout/fg" },
  { label: "Punt", path: "/scout/punt" },
  { label: "KO", path: "/scout/kickoff" },
  { label: "Snap", path: "/scout/snap" },
];

/** Scout Archives section: archived ranking groups, with links to their standings and Restore. */
export function ArchivedGroupsCard() {
  const [groups, setGroups] = useState<ScoutRanking[]>([]);
  const [archived, setArchived] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let tid = getTeamId();
      for (let i = 0; i < 20 && !tid; i++) { await new Promise((r) => setTimeout(r, 150)); tid = getTeamId(); }
      if (!tid) return;
      const [rks, arch] = await Promise.all([loadScoutRankings(tid), loadArchivedRankingIds(tid)]);
      setGroups(rks);
      setArchived(arch);
      setLoaded(true);
    })();
  }, []);

  const restore = async (id: string) => {
    const tid = getTeamId();
    if (!tid) return;
    const next = archived.filter((x) => x !== id);
    setArchived(next);
    try {
      await saveArchivedRankingIds(tid, next);
    } catch {
      setArchived(archived);
      window.alert("Couldn't restore that group. Check your connection and try again.");
    }
  };

  const archivedGroups = groups.filter((g) => archived.includes(g.id));
  if (!loaded) return null;

  return (
    <div className="card space-y-3">
      <div>
        <h2 className="text-sm font-bold text-slate-100">Archived Groups</h2>
        <p className="text-xs text-muted mt-0.5">
          Ranking groups you&apos;ve archived. They&apos;re hidden from the rankings and from Overall, but nothing is deleted.
        </p>
      </div>
      {archivedGroups.length === 0 ? (
        <p className="text-xs text-muted italic">
          No archived groups. To archive one, open any sport&apos;s Rankings, tap ✎ next to Ranking Group, then Archive.
        </p>
      ) : (
        <div className="divide-y divide-white/5">
          {archivedGroups.map((g) => (
            <div key={g.id} className="py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm font-semibold text-slate-100 flex-1 min-w-[8rem]">{g.name}</p>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <span className="text-muted font-normal">View:</span>
                {SPORT_LINKS.map((s) => (
                  <Link key={s.path} href={`${s.path}?tab=rankings&ranking=${encodeURIComponent(g.id)}`} className="text-slate-300 hover:text-amber-400 transition-colors">
                    {s.label}
                  </Link>
                ))}
                <button onClick={() => restore(g.id)} className="text-amber-400 hover:underline ml-1">Restore</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
