// ─── Enums ──────────────────────────────────────────────────────────────────

export type SportType = "KICKING" | "PUNTING" | "KICKOFF" | "LONGSNAP";
export type UserRole = "coach" | "athlete";

// FG Kicking
export type FGPosition = "LH" | "RH" | "LM" | "RM" | "M";
export type FGResult = "YL" | "YC" | "YR" | "XL" | "XR" | "XS";
export type DistRange = "20-29" | "30-39" | "40-49" | "50-60" | "60+";

// Punting
export type PuntType = string;
export type PuntHash = "LH" | "LM" | "M" | "RM" | "RH";
export type PuntLandingZone =
  | "TB"
  | "inside10"
  | "inside20"
  | "returned"
  | "fairCatch";

// Kickoff
export type KickoffType = "REG" | "ONSIDE" | "SQUIB" | "FREE";
export type KickoffLandingZone =
  | "TB"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "OOB";
export type KickoffDirection = "left" | "middle" | "right";

// Long Snap
export type SnapType = "PUNT" | "FG" | "PAT";
export type SnapAccuracy =
  | "ON_TARGET"
  | "HIGH"
  | "LOW"
  | "LEFT"
  | "RIGHT";
export type SnapBenchmark = "excellent" | "good" | "needsWork";

// ─── Athlete ────────────────────────────────────────────────────────────────

export interface Athlete {
  id: string;
  name: string;
  position?: string;
  active: boolean;
}

// ─── FG Stats ────────────────────────────────────────────────────────────────

export interface StatBucket {
  att: number;
  made: number;
  score: number;
}

export interface AthleteStats {
  overall: StatBucket & { longFG: number };
  position: Record<FGPosition, StatBucket>;
  distance: Record<DistRange, StatBucket>;
  miss: { XL: number; XR: number; XS: number };
  pat: StatBucket;
}

// ─── FG Kick entry ──────────────────────────────────────────────────────────

export interface FGKick {
  id?: string;
  sessionId?: string;
  athleteId: string;
  athlete: string; // display name
  dist: number;
  pos: FGPosition;
  result: FGResult;
  score: number;
  isPAT?: boolean;
}

// ─── Punt entry ─────────────────────────────────────────────────────────────

export interface PuntEntry {
  id?: string;
  sessionId?: string;
  athleteId: string;
  athlete: string;
  type: PuntType;
  hash: PuntHash;
  yards: number;
  hangTime: number;
  opTime: number; // punter operation time in seconds
  landingZones: PuntLandingZone[];
  returnYards?: number;
  directionalAccuracy: 0 | 0.5 | 1;
  poochLandingYardLine?: number;
}

// ─── Punt stats ─────────────────────────────────────────────────────────────

export interface PuntStatBucket {
  att: number;
  totalYards: number;
  totalHang: number;
  totalOpTime: number;
  totalDirectionalAccuracy: number;
  criticalDirections: number;
}

export interface PuntAthleteStats {
  overall: PuntStatBucket & { long: number; totalReturnYards: number; poochYardLineTotal: number; poochYardLineAtt: number };
  byType: Record<PuntType, PuntStatBucket>;
  byHash: Record<PuntHash, PuntStatBucket>;
  byLanding: Record<PuntLandingZone, number>;
}

// ─── Kickoff entry ──────────────────────────────────────────────────────────

export interface KickoffEntry {
  id?: string;
  sessionId?: string;
  athleteId: string;
  athlete: string;
  type: KickoffType;
  distance: number;
  hangTime: number;
  direction: KickoffDirection;
  score: number;
  landingZone?: KickoffLandingZone;
  result?: "TB" | "RETURN" | "OOB";
  returnYards?: number;
}

// ─── Kickoff stats ──────────────────────────────────────────────────────────

export interface KickoffAthleteStats {
  overall: {
    att: number;
    touchbacks: number;
    oob: number;
    totalDist: number;
    totalHang: number;
    totalReturn: number;
  };
  byZone: Record<KickoffLandingZone, number>;
}

// ─── Long Snap entry ─────────────────────────────────────────────────────────

export interface LongSnapEntry {
  id?: string;
  sessionId?: string;
  athleteId: string;
  athlete: string;
  snapType: SnapType;
  time: number; // snap time in seconds
  accuracy: SnapAccuracy;
  score: number;
  benchmark?: SnapBenchmark;
}

// ─── Long Snap stats ─────────────────────────────────────────────────────────

export interface LongSnapStatBucket {
  att: number;
  onTarget: number;
  totalTime: number;
  score: number;
  excellent: number;
  good: number;
  needsWork: number;
}

export interface LongSnapAthleteStats {
  overall: LongSnapStatBucket;
  byType: Record<SnapType, LongSnapStatBucket>;
  byAccuracy: Record<SnapAccuracy, number>;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  teamId: string;
  sport: SportType;
  label: string;
  date: string;
  weather?: string;
  entries?: FGKick[] | PuntEntry[] | KickoffEntry[] | LongSnapEntry[];
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface FGState {
  athletes: string[];
  stats: Record<string, AthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

export interface PuntState {
  athletes: string[];
  stats: Record<string, PuntAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

export interface KickoffState {
  athletes: string[];
  stats: Record<string, KickoffAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

export interface LongSnapState {
  athletes: string[];
  stats: Record<string, LongSnapAthleteStats>;
  snapshot: Session[] | null;
  history: Session[];
}

// ─── Team / Config ───────────────────────────────────────────────────────────

export interface TeamConfig {
  enabledSports: SportType[];
  customLabels?: Partial<Record<string, string>>;
  maxKickScore?: number;
}

export interface Team {
  id: string;
  name: string;
  school: string;
  config: TeamConfig;
  athletes: Athlete[];
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  teamId?: string;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

export interface SportCard {
  sport: SportType;
  label: string;
  icon: string;
  href: string;
  makeRate?: number;
  lastSession?: string;
  keyStat?: string;
}

// Left → right field order for the heat grid
export const POSITIONS: FGPosition[] = ["LH", "LM", "M", "RM", "RH"];
export const RESULTS: FGResult[] = ["YL", "YC", "YR", "XL", "XR", "XS"];
export const MAKE_RESULTS: FGResult[] = ["YL", "YC", "YR"];
export const MISS_RESULTS: FGResult[] = ["XL", "XR", "XS"];
export const DIST_RANGES: DistRange[] = [
  "20-29",
  "30-39",
  "40-49",
  "50-60",
  "60+",
];
export const PUNT_TYPES: PuntType[] = [
  "RED",
  "BLUE",
  "POOCH_BLUE",
  "POOCH_RED",
  "BROWN",
];
export const PUNT_HASHES: PuntHash[] = ["LH", "LM", "M", "RM", "RH"];
export const PUNT_LANDING_ZONES: PuntLandingZone[] = [
  "TB",
  "inside10",
  "inside20",
  "returned",
  "fairCatch",
];
export const KICKOFF_TYPES: KickoffType[] = ["REG", "ONSIDE", "SQUIB", "FREE"];
export const KICKOFF_DIRECTIONS: KickoffDirection[] = ["left", "middle", "right"];
export const KICKOFF_ZONES: KickoffLandingZone[] = [
  "TB",
  "1",
  "2",
  "3",
  "4",
  "5",
  "OOB",
];
export const SNAP_TYPES: SnapType[] = ["PUNT", "FG", "PAT"];
export const SNAP_ACCURACIES: SnapAccuracy[] = [
  "ON_TARGET",
  "HIGH",
  "LOW",
  "LEFT",
  "RIGHT",
];
