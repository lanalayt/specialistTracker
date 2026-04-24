/**
 * Core stats computation — ported from SpecialTeams_FG.html
 * Pure functions, no side effects, no DOM dependencies.
 */

import {
  AthleteStats,
  DistRange,
  FGKick,
  FGPosition,
  DIST_RANGES,
  POSITIONS,
  PuntAthleteStats,
  PuntStatBucket,
  PuntEntry,
  PUNT_HASHES,
  PUNT_TYPES,
  PUNT_LANDING_ZONES,
  PuntLandingZone,
  KickoffAthleteStats,
  KickoffEntry,
  KICKOFF_ZONES,
  LongSnapAthleteStats,
  LongSnapEntry,
  LongSnapStatBucket,
  SNAP_ACCURACIES,
  SNAP_TYPES,
  SnapType,
  SnapBenchmark,
} from "@/types";

// ─── FG Kicking ──────────────────────────────────────────────────────────────

export function emptyStatBucket() {
  return { att: 0, made: 0, score: 0 };
}

export function emptyAthleteStats(): AthleteStats {
  const position = {} as Record<FGPosition, { att: number; made: number; score: number }>;
  POSITIONS.forEach((p) => {
    position[p] = { att: 0, made: 0, score: 0 };
  });
  const distance = {} as Record<DistRange, { att: number; made: number; score: number }>;
  DIST_RANGES.forEach((r) => {
    distance[r] = { att: 0, made: 0, score: 0 };
  });
  return {
    overall: { att: 0, made: 0, score: 0, longFG: 0, totalOpTime: 0, opTimeAtt: 0 },
    position,
    distance,
    miss: { XL: 0, XR: 0, XS: 0, X: 0 },
    make: { YL: 0, YC: 0, YR: 0 },
    pat: { att: 0, made: 0, score: 0 },
  };
}

export function getDistRange(yards: number): DistRange | null {
  if (yards >= 20 && yards <= 29) return "20-29";
  if (yards >= 30 && yards <= 39) return "30-39";
  if (yards >= 40 && yards <= 49) return "40-49";
  if (yards >= 50 && yards <= 60) return "50-60";
  if (yards > 60) return "60+";
  return null;
}

export function isFGMake(result: string): boolean {
  return result.startsWith("Y");
}

export function processKick(
  kick: FGKick,
  statsMap: Record<string, AthleteStats>
): Record<string, AthleteStats> {
  const { athlete, dist, pos, result, score, isPAT, opTime } = kick;
  const isMake = isFGMake(result);
  const hasOT = (opTime ?? 0) > 0;

  if (!statsMap[athlete]) {
    statsMap = { ...statsMap, [athlete]: emptyAthleteStats() };
  }
  const s = { ...statsMap[athlete] };

  // Ensure pat bucket exists (migration guard)
  if (!s.pat) s.pat = { att: 0, made: 0, score: 0 };

  // PAT tracking (separate from regular FG stats)
  if (isPAT) {
    s.pat = {
      att: s.pat.att + 1,
      made: s.pat.made + (isMake ? 1 : 0),
      score: s.pat.score + score,
    };
    return { ...statsMap, [athlete]: s };
  }

  // Overall
  s.overall = {
    att: s.overall.att + 1,
    made: s.overall.made + (isMake ? 1 : 0),
    score: s.overall.score + score,
    longFG: isMake ? Math.max(s.overall.longFG, dist) : s.overall.longFG,
    totalOpTime: (s.overall.totalOpTime || 0) + (hasOT ? opTime! : 0),
    opTimeAtt: (s.overall.opTimeAtt || 0) + (hasOT ? 1 : 0),
  };

  // Position
  if (POSITIONS.includes(pos as FGPosition)) {
    s.position = {
      ...s.position,
      [pos]: {
        att: s.position[pos as FGPosition].att + 1,
        made: s.position[pos as FGPosition].made + (isMake ? 1 : 0),
        score: s.position[pos as FGPosition].score + score,
      },
    };
  }

  // Distance range
  const dr = getDistRange(dist);
  if (dr) {
    s.distance = {
      ...s.distance,
      [dr]: {
        att: s.distance[dr].att + 1,
        made: s.distance[dr].made + (isMake ? 1 : 0),
        score: s.distance[dr].score + score,
      },
    };
  }

  // Miss tracking
  if (!isMake && (result === "XL" || result === "XR" || result === "XS" || result === "X")) {
    s.miss = { ...s.miss, [result]: s.miss[result] + 1 };
  }

  // Make tracking (detailed)
  if (!s.make) s.make = { YL: 0, YC: 0, YR: 0 };
  if (isMake && (result === "YL" || result === "YC" || result === "YR")) {
    s.make = { ...s.make, [result]: s.make[result] + 1 };
  }

  return { ...statsMap, [athlete]: s };
}

export function recomputeFGStats(
  athletes: string[],
  sessions: { kicks: FGKick[] }[]
): Record<string, AthleteStats> {
  let statsMap: Record<string, AthleteStats> = {};
  athletes.forEach((a) => {
    statsMap[a] = emptyAthleteStats();
  });
  sessions.forEach((s) => {
    s.kicks.forEach((k) => {
      statsMap = processKick(k, statsMap);
    });
  });
  return statsMap;
}

export function buildCommitSummary(kicks: FGKick[]): string {
  const makes = kicks.filter((k) => isFGMake(k.result)).length;
  const misses = kicks.length - makes;
  const athletes = [...new Set(kicks.map((k) => k.athlete))].join(", ");
  return `Athletes: ${athletes}\nMakes: ${makes}   Misses: ${misses}`;
}

export function makePct(att: number, made: number): string {
  if (att === 0) return "—";
  return `${Math.round((made / att) * 100)}%`;
}

export function avgScore(att: number, score: number): string {
  if (att === 0) return "—";
  return (score / att).toFixed(1);
}

// ─── Punt ────────────────────────────────────────────────────────────────────

export function emptyPuntStats(): PuntAthleteStats {
  const byType = {} as PuntAthleteStats["byType"];
  PUNT_TYPES.forEach((t) => {
    byType[t] = { att: 0, totalYards: 0, totalHang: 0, totalOpTime: 0, totalDirectionalAccuracy: 0, criticalDirections: 0 };
  });
  const byHash = {} as PuntAthleteStats["byHash"];
  PUNT_HASHES.forEach((h) => {
    byHash[h] = { att: 0, totalYards: 0, totalHang: 0, totalOpTime: 0, totalDirectionalAccuracy: 0, criticalDirections: 0 };
  });
  const byLanding = {} as PuntAthleteStats["byLanding"];
  PUNT_LANDING_ZONES.forEach((z) => {
    byLanding[z] = 0;
  });
  return {
    overall: { att: 0, totalYards: 0, totalHang: 0, totalOpTime: 0, totalDirectionalAccuracy: 0, criticalDirections: 0, long: 0, totalReturnYards: 0, poochYardLineTotal: 0, poochYardLineAtt: 0 },
    byType,
    byHash,
    byLanding,
  };
}

export function processPunt(
  punt: PuntEntry,
  statsMap: Record<string, PuntAthleteStats>,
  typeConfig?: { metric: "distance" | "yardline"; hangTime: boolean }
): Record<string, PuntAthleteStats> {
  const { athlete, yards, hangTime, type, hash } = punt;
  const opTime = punt.opTime || 0;

  // Use type config if provided, otherwise fall back to legacy POOCH detection
  const isYardLine = typeConfig ? typeConfig.metric === "yardline"
    : (typeof type === "string" && type.toUpperCase().includes("POOCH"));
  const htEnabled = typeConfig ? typeConfig.hangTime : true;
  // Determine which metrics have data (0 = not entered for numeric fields)
  const hasYards = yards > 0 && !isYardLine;
  const hasHang = hangTime > 0 && htEnabled;
  const hasOT = opTime > 0;
  const daRaw = punt.directionalAccuracy;
  const isNumericDA = typeof daRaw === "number";
  const hasDA = isNumericDA && daRaw >= 0;

  // Migration: old entries may have single landingZone instead of landingZones array
  const landingZones: PuntLandingZone[] = Array.isArray(punt.landingZones)
    ? punt.landingZones
    : (punt as unknown as { landingZone?: PuntLandingZone }).landingZone
      ? [(punt as unknown as { landingZone: PuntLandingZone }).landingZone]
      : [];

  // For numeric mode, use the value directly; for field-based mode (string), skip aggregation
  const directionalAccuracy: number = isNumericDA ? daRaw : 0;

  const isCritical = hasDA && directionalAccuracy === 0 ? 1 : 0;
  const returnYards = punt.returnYards;
  const { poochLandingYardLine } = punt;

  if (!statsMap[athlete]) {
    statsMap = { ...statsMap, [athlete]: emptyPuntStats() };
  }
  const s = { ...statsMap[athlete] };

  // Migration guards
  if (!s.byLanding) {
    const byLanding = {} as PuntAthleteStats["byLanding"];
    PUNT_LANDING_ZONES.forEach((z) => { byLanding[z] = 0; });
    s.byLanding = byLanding;
  }
  if (s.overall.totalReturnYards === undefined) {
    s.overall = { ...s.overall, totalReturnYards: 0 };
  }
  if (s.overall.totalDirectionalAccuracy === undefined) {
    s.overall = { ...s.overall, totalDirectionalAccuracy: 0, criticalDirections: 0 };
  }
  if (s.overall.poochYardLineTotal === undefined) {
    s.overall = { ...s.overall, poochYardLineTotal: 0, poochYardLineAtt: 0 };
  }

  const hasPoochYL = isYardLine && poochLandingYardLine != null;

  s.overall = {
    att: s.overall.att + 1,
    totalYards: s.overall.totalYards + (hasYards ? yards : 0),
    yardsAtt: (s.overall.yardsAtt || 0) + (hasYards ? 1 : 0),
    totalHang: s.overall.totalHang + (hasHang ? hangTime : 0),
    hangAtt: (s.overall.hangAtt || 0) + (hasHang ? 1 : 0),
    totalOpTime: (s.overall.totalOpTime || 0) + (hasOT ? opTime : 0),
    opTimeAtt: (s.overall.opTimeAtt || 0) + (hasOT ? 1 : 0),
    totalDirectionalAccuracy: s.overall.totalDirectionalAccuracy + (hasDA ? directionalAccuracy : 0),
    daAtt: (s.overall.daAtt || 0) + (hasDA ? 1 : 0),
    criticalDirections: s.overall.criticalDirections + isCritical,
    long: hasYards ? Math.max(s.overall.long, yards) : s.overall.long,
    totalReturnYards: s.overall.totalReturnYards + (returnYards || 0),
    poochYardLineTotal: s.overall.poochYardLineTotal + (hasPoochYL ? poochLandingYardLine! : 0),
    poochYardLineAtt: s.overall.poochYardLineAtt + (hasPoochYL ? 1 : 0),
  };

  const updateBucket = (b: PuntStatBucket | undefined) => ({
    att: (b?.att || 0) + 1,
    totalYards: (b?.totalYards || 0) + (hasYards ? yards : 0),
    yardsAtt: (b?.yardsAtt || 0) + (hasYards ? 1 : 0),
    totalHang: (b?.totalHang || 0) + (hasHang ? hangTime : 0),
    hangAtt: (b?.hangAtt || 0) + (hasHang ? 1 : 0),
    totalOpTime: (b?.totalOpTime || 0) + (hasOT ? opTime : 0),
    opTimeAtt: (b?.opTimeAtt || 0) + (hasOT ? 1 : 0),
    totalDirectionalAccuracy: (b?.totalDirectionalAccuracy || 0) + (hasDA ? directionalAccuracy : 0),
    daAtt: (b?.daAtt || 0) + (hasDA ? 1 : 0),
    criticalDirections: (b?.criticalDirections || 0) + isCritical,
  });

  // Only update byType/byHash if those fields were provided
  if (type) {
    s.byType = { ...s.byType, [type]: updateBucket(s.byType[type]) };
  }
  if (hash) {
    s.byHash = { ...s.byHash, [hash]: updateBucket(s.byHash[hash]) };
  }

  // Landing zones (multi-select array)
  const newByLanding = { ...s.byLanding };
  landingZones.forEach((z) => {
    if (PUNT_LANDING_ZONES.includes(z)) {
      newByLanding[z] = (newByLanding[z] || 0) + 1;
    }
  });
  s.byLanding = newByLanding;

  return { ...statsMap, [athlete]: s };
}

export function recomputePuntStats(
  athletes: string[],
  sessions: { punts: PuntEntry[] }[],
  typeConfigs?: { id: string; metric: "distance" | "yardline"; hangTime: boolean }[]
): Record<string, PuntAthleteStats> {
  let statsMap: Record<string, PuntAthleteStats> = {};
  athletes.forEach((a) => {
    statsMap[a] = emptyPuntStats();
  });
  sessions.forEach((s) => {
    s.punts.forEach((p) => {
      const tc = typeConfigs?.find((t) => t.id === p.type);
      statsMap = processPunt(p, statsMap, tc);
    });
  });
  return statsMap;
}

// Punt stat helpers
export function inside20Pct(byLanding: Record<PuntLandingZone, number>, total: number): string {
  if (total === 0) return "—";
  const n = (byLanding.inside10 || 0) + (byLanding.inside20 || 0);
  return `${Math.round((n / total) * 100)}%`;
}

export function touchbackPct(byLanding: Record<PuntLandingZone, number>, total: number): string {
  if (total === 0) return "—";
  return `${Math.round(((byLanding.TB || 0) / total) * 100)}%`;
}

export function avgNet(totalYards: number, totalReturnYards: number, att: number): string {
  if (att === 0) return "—";
  return ((totalYards - totalReturnYards) / att).toFixed(1);
}

// ─── Long Snap benchmark ──────────────────────────────────────────────────────

export function getSnapBenchmark(snapType: SnapType, time: number): SnapBenchmark {
  if (snapType === "PUNT") {
    if (time <= 0.80) return "excellent";
    if (time <= 0.95) return "good";
    return "needsWork";
  }
  // FG / PAT
  if (time <= 0.38) return "excellent";
  if (time <= 0.45) return "good";
  return "needsWork";
}

// ─── Kickoff ─────────────────────────────────────────────────────────────────

export function emptyKickoffStats(): KickoffAthleteStats {
  const byZone = {} as KickoffAthleteStats["byZone"];
  KICKOFF_ZONES.forEach((z) => {
    byZone[z] = 0;
  });
  return {
    overall: {
      att: 0,
      touchbacks: 0,
      oob: 0,
      totalDist: 0,
      totalHang: 0,
      totalReturn: 0,
      endzones: 0,
    },
    byZone,
  };
}

export function processKickoff(
  entry: KickoffEntry,
  statsMap: Record<string, KickoffAthleteStats>,
  typeConfig?: { metric: "distance" | "yardline" | "none"; hangTime: boolean }
): Record<string, KickoffAthleteStats> {
  const { athlete, distance, hangTime, landingZone, result, returnYards, endzone } =
    entry;

  const metricEnabled = typeConfig ? typeConfig.metric !== "none" : true;
  const htEnabled = typeConfig ? typeConfig.hangTime : true;
  const hasDist = distance > 0 && metricEnabled;
  const hasHang = hangTime > 0 && htEnabled;

  if (!statsMap[athlete]) {
    statsMap = { ...statsMap, [athlete]: emptyKickoffStats() };
  }
  const s = { ...statsMap[athlete] };

  s.overall = {
    att: s.overall.att + 1,
    touchbacks: s.overall.touchbacks + (result === "TB" ? 1 : 0),
    oob: s.overall.oob + (result === "OOB" ? 1 : 0),
    totalDist: s.overall.totalDist + (hasDist ? distance : 0),
    distAtt: (s.overall.distAtt || 0) + (hasDist ? 1 : 0),
    totalHang: s.overall.totalHang + (hasHang ? hangTime : 0),
    hangAtt: (s.overall.hangAtt || 0) + (hasHang ? 1 : 0),
    totalReturn: s.overall.totalReturn + (returnYards ?? 0),
    endzones: (s.overall.endzones || 0) + (endzone ? 1 : 0),
  };

  if (landingZone) {
    s.byZone = {
      ...s.byZone,
      [landingZone]: (s.byZone[landingZone] || 0) + 1,
    };
  }

  return { ...statsMap, [athlete]: s };
}

export function recomputeKickoffStats(
  athletes: string[],
  sessions: { entries: KickoffEntry[] }[],
  typeConfigs?: { id: string; metric: "distance" | "yardline" | "none"; hangTime: boolean }[]
): Record<string, KickoffAthleteStats> {
  let statsMap: Record<string, KickoffAthleteStats> = {};
  athletes.forEach((a) => {
    statsMap[a] = emptyKickoffStats();
  });
  sessions.forEach((s) => {
    s.entries.forEach((e) => {
      const tc = typeConfigs?.find((t) => t.id === e.type);
      statsMap = processKickoff(e, statsMap, tc);
    });
  });
  return statsMap;
}

// ─── Long Snap ────────────────────────────────────────────────────────────────

function emptySnapBucket(): LongSnapStatBucket {
  return { att: 0, onTarget: 0, totalTime: 0, score: 0, excellent: 0, good: 0, needsWork: 0 };
}

export function emptyLongSnapStats(): LongSnapAthleteStats {
  const byType = {} as LongSnapAthleteStats["byType"];
  SNAP_TYPES.forEach((t) => {
    byType[t] = emptySnapBucket();
  });
  const byAccuracy = {} as LongSnapAthleteStats["byAccuracy"];
  SNAP_ACCURACIES.forEach((a) => {
    byAccuracy[a] = 0;
  });
  return {
    overall: emptySnapBucket(),
    byType,
    byAccuracy,
  };
}

export function processLongSnap(
  entry: LongSnapEntry,
  statsMap: Record<string, LongSnapAthleteStats>
): Record<string, LongSnapAthleteStats> {
  const { athlete, snapType, time, accuracy, score } = entry;
  const isOnTarget = accuracy === "ON_TARGET";
  // Compute benchmark if not already set
  const bm = entry.benchmark ?? getSnapBenchmark(snapType, time);

  if (!statsMap[athlete]) {
    statsMap = { ...statsMap, [athlete]: emptyLongSnapStats() };
  }
  const s = { ...statsMap[athlete] };

  // Migration guard: ensure new fields exist
  if (s.overall.excellent === undefined) {
    s.overall = { ...s.overall, excellent: 0, good: 0, needsWork: 0 };
  }

  const updateBucket = (b: LongSnapStatBucket): LongSnapStatBucket => ({
    att: b.att + 1,
    onTarget: b.onTarget + (isOnTarget ? 1 : 0),
    totalTime: b.totalTime + time,
    score: b.score + score,
    excellent: (b.excellent || 0) + (bm === "excellent" ? 1 : 0),
    good: (b.good || 0) + (bm === "good" ? 1 : 0),
    needsWork: (b.needsWork || 0) + (bm === "needsWork" ? 1 : 0),
  });

  s.overall = updateBucket(s.overall);

  s.byType = {
    ...s.byType,
    [snapType]: updateBucket(s.byType[snapType] ?? emptySnapBucket()),
  };

  s.byAccuracy = {
    ...s.byAccuracy,
    [accuracy]: (s.byAccuracy[accuracy] || 0) + 1,
  };

  return { ...statsMap, [athlete]: s };
}

export function recomputeLongSnapStats(
  athletes: string[],
  sessions: { entries: LongSnapEntry[] }[]
): Record<string, LongSnapAthleteStats> {
  let statsMap: Record<string, LongSnapAthleteStats> = {};
  athletes.forEach((a) => {
    statsMap[a] = emptyLongSnapStats();
  });
  sessions.forEach((s) => {
    s.entries.forEach((e) => {
      statsMap = processLongSnap(e, statsMap);
    });
  });
  return statsMap;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function sessionLabel(date: Date = new Date()): string {
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return `${DAYS[date.getDay()]} ${date.getMonth() + 1}/${date.getDate()}`;
}
