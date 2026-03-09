"use client";

import { usePunt } from "@/lib/puntContext";
import { PUNT_TYPES, PUNT_HASHES } from "@/types";
import type { PuntType, PuntHash, PuntStatBucket, PuntAthleteStats } from "@/types";

const TYPE_LABELS: Record<PuntType, string> = {
  RED: "Red",
  BLUE: "Blue",
  POOCH_BLUE: "Pooch - Blue",
  POOCH_RED: "Pooch - Red",
  BROWN: "Brown",
};

const POS_LABELS: Record<PuntHash, string> = {
  LH: "Left Hash",
  LM: "Left Middle",
  M: "Middle",
  RM: "Right Middle",
  RH: "Right Hash",
};

function avgYds(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return (b.totalYards / b.att).toFixed(1);
}

function avgHT(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return (b.totalHang / b.att).toFixed(2);
}

function avgOT(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return (b.totalOpTime / b.att).toFixed(2);
}

function avgDA(b: PuntStatBucket): string {
  if (b.att === 0) return "—";
  return (b.totalDirectionalAccuracy / b.att).toFixed(2);
}

function PuntTable({
  athletes,
  statsMap,
  getBucket,
}: {
  athletes: string[];
  statsMap: Record<string, PuntAthleteStats>;
  getBucket: (s: PuntAthleteStats) => PuntStatBucket;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="table-header text-left">Athlete</th>
          <th className="table-header">Punts</th>
          <th className="table-header">Dist Avg</th>
          <th className="table-header">HT Avg</th>
          <th className="table-header">OT Avg</th>
          <th className="table-header">DA</th>
          <th className="table-header">Crit Dir</th>
        </tr>
      </thead>
      <tbody>
        {athletes.map((a) => {
          const s = statsMap[a];
          if (!s) return null;
          const b = getBucket(s);
          return (
            <tr key={a} className="hover:bg-surface/30 transition-colors">
              <td className="table-name">{a}</td>
              <td className="table-cell">{b.att || "—"}</td>
              <td className="table-cell">{avgYds(b)}</td>
              <td className="table-cell">{avgHT(b)}</td>
              <td className="table-cell">{avgOT(b)}</td>
              <td className="table-cell">{avgDA(b)}</td>
              <td className={`table-cell ${b.criticalDirections > 0 ? "text-miss" : ""}`}>
                {b.criticalDirections || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function PuntingStatisticsPage() {
  const { athletes, stats } = usePunt();

  const hasData = athletes.some((a) => stats[a]?.overall.att > 0);

  if (!hasData) {
    return (
      <main className="p-4 lg:p-6 max-w-5xl">
        <p className="text-sm text-muted">No punting data yet. Commit a practice to see statistics.</p>
      </main>
    );
  }

  return (
    <main className="p-4 lg:p-6 space-y-6 max-w-5xl overflow-y-auto">
      {/* Total Punts */}
      <section className="card-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Total Punts</p>
        <PuntTable
          athletes={athletes}
          statsMap={stats}
          getBucket={(s) => s.overall}
        />
      </section>

      {/* Total by Type */}
      <section>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Total by Type</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PUNT_TYPES.map((type) => (
            <div key={type} className="card-2">
              <p className="text-xs font-semibold text-slate-300 mb-2">{TYPE_LABELS[type]}</p>
              <PuntTable
                athletes={athletes}
                statsMap={stats}
                getBucket={(s) => s.byType[type]}
              />
            </div>
          ))}
        </div>
      </section>

      {/* By Position per Type */}
      {PUNT_TYPES.map((type) => (
        <section key={type}>
          <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            {TYPE_LABELS[type]} — By Position
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PUNT_HASHES.map((hash) => (
              <div key={hash} className="card-2">
                <p className="text-xs font-semibold text-slate-300 mb-2">{POS_LABELS[hash]}</p>
                <PuntByHashTable
                  athletes={athletes}
                  statsMap={stats}
                  type={type}
                  hash={hash}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}

/**
 * For "by hash per type" we need to filter punts by both type AND hash.
 * The current stats structure only has byType and byHash separately,
 * so we show byHash stats here (the cross-tabulation would require raw data).
 * To properly show per-type-per-hash stats, we render the hash breakdown.
 */
function PuntByHashTable({
  athletes,
  statsMap,
  type,
  hash,
}: {
  athletes: string[];
  statsMap: Record<string, PuntAthleteStats>;
  type: PuntType;
  hash: PuntHash;
}) {
  // Since the stats don't have a cross-tab of type+hash, we show the hash breakdown.
  // This matches the HTML file's layout structure.
  return (
    <PuntTable
      athletes={athletes}
      statsMap={statsMap}
      getBucket={(s) => s.byHash[hash]}
    />
  );
}
