// ─── Enums ──────────────────────────────────────────────────────────────────

export type SportType = "KICKING" | "PUNTING" | "KICKOFF" | "LONGSNAP";
export type UserRole = "admin" | "coach" | "athlete";

// FG Kicking
export type FGPosition = "LH" | "RH" | "LM" | "RM" | "M";
export type FGResult = "YL" | "YC" | "YR" | "XL" | "XR" | "XS" | "X";
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
export type KickoffHash = "LH" | "LM" | "M" | "RM" | "RH";
export type KickoffLandingZone =
  | "TB"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "OOB";
export type KickoffDirection = string;

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
  overall: StatBucket & { longFG: number; totalOpTime: number; opTimeAtt: number };
  position: Record<FGPosition, StatBucket>;
  distance: Record<DistRange, StatBucket>;
  miss: { XL: number; XR: number; XS: number; X: number };
  make: { YL: number; YC: number; YR: number };
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
  opTime?: number;
  isPAT?: boolean;
  starred?: boolean;
  kickNum?: number;
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
  directionalAccuracy: number | string;
  poochLandingYardLine?: number;
  starred?: boolean;
  kickNum?: number;
  // Game mode: absolute field position 0..100 (own goal line to opponent goal line)
  los?: number;
  landingYL?: number;
  fairCatch?: boolean;
  touchback?: boolean;
}

// ─── Punt stats ─────────────────────────────────────────────────────────────

export interface PuntStatBucket {
  att: number;
  totalYards: number;
  yardsAtt?: number;
  totalHang: number;
  hangAtt?: number;
  totalOpTime: number;
  opTimeAtt?: number;
  totalDirectionalAccuracy: number;
  daAtt?: number;
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
  kickNum?: number;
  endzone?: boolean;
  fairCatch?: boolean;
  hash?: KickoffHash;
  // Game mode only: absolute field positions 0..100
  los?: number;
  landingYL?: number;
}

// ─── Kickoff stats ──────────────────────────────────────────────────────────

export interface KickoffAthleteStats {
  overall: {
    att: number;
    touchbacks: number;
    oob: number;
    totalDist: number;
    distAtt?: number;
    totalHang: number;
    hangAtt?: number;
    totalReturn: number;
    endzones: number;
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
  critical?: boolean;
  laces?: string;
  spiral?: string;
  markerX?: number;
  markerY?: number;
  markerInZone?: boolean;
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
  criticals: number;
}

export interface LongSnapAthleteStats {
  overall: LongSnapStatBucket;
  byType: Record<SnapType, LongSnapStatBucket>;
  byAccuracy: Record<SnapAccuracy, number>;
}

// ─── Session ─────────────────────────────────────────────────────────────────

export type SessionMode = "practice" | "game";

export interface Session {
  id: string;
  teamId: string;
  sport: SportType;
  label: string;
  date: string;
  weather?: string;
  mode?: SessionMode; // undefined = practice (legacy)
  opponent?: string;
  gameTime?: string;
  entries?: FGKick[] | PuntEntry[] | KickoffEntry[] | LongSnapEntry[];
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface FGState {
  athletes: string[];
  stats: Record<string, AthleteStats>;
  history: Session[];
}

export interface PuntState {
  athletes: string[];
  stats: Record<string, PuntAthleteStats>;
  history: Session[];
}

export interface KickoffState {
  athletes: string[];
  stats: Record<string, KickoffAthleteStats>;
  history: Session[];
}

export interface LongSnapState {
  athletes: string[];
  stats: Record<string, LongSnapAthleteStats>;
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
  "DIR_LEFT",
  "DIR_STRAIGHT",
  "DIR_RIGHT",
  "POOCH_LEFT",
  "POOCH_MIDDLE",
  "POOCH_RIGHT",
  "RUGBY",
];
export const PUNT_HASHES: PuntHash[] = ["LH", "LM", "M", "RM", "RH"];
export const PUNT_LANDING_ZONES: PuntLandingZone[] = [
  "TB",
  "inside10",
  "inside20",
  "returned",
  "fairCatch",
];
export const KICKOFF_HASHES: KickoffHash[] = ["LH", "LM", "M", "RM", "RH"];
export const KICKOFF_TYPES: KickoffType[] = ["REG", "ONSIDE", "SQUIB", "FREE"];
export const KICKOFF_DIRECTIONS: KickoffDirection[] = ["1", "0.5", "OB"];
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
