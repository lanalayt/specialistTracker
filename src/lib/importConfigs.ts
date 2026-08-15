import { norm, type ImportConfig } from "@/components/ui/ImportModal";

const numeric = (s: string) => (s && !isNaN(parseFloat(s)) ? s : "");

// ── Punt ─────────────────────────────────────────────────────────────────────
export function buildPuntImportConfig(opts: {
  puntTypes: { id: string; label: string; metric: "distance" | "yardline" }[];
  hashOptions: { id: string; label: string }[];
}): ImportConfig {
  const { puntTypes, hashOptions } = opts;
  const autoType = (raw: string) => { const n = norm(raw); return puntTypes.find((t) => norm(t.label) === n || norm(t.id) === n)?.id; };
  const autoHash = (raw: string) => { const n = norm(raw); return hashOptions.find((h) => norm(h.label) === n || norm(h.id) === n)?.id; };
  return {
    title: "Import Punt Report",
    storageKey: "puntImportMaps_v2",
    sheetHint: "punt",
    columns: [
      { key: "athlete", label: "Athlete (name or #)", synonyms: ["pffkicker", "kicker", "punter", "athlete", "player", "jersey", "kickernum", "playernum", "number", "name"] },
      { key: "type", label: "Punt type", synonyms: ["call", "type", "punttype", "kicktype"] },
      { key: "direction", label: "Direction score", synonyms: ["landzn", "landzone", "landingzone", "direction", "dir"] },
      { key: "yards", label: "Distance (yards)", synonyms: ["pffkickdepth", "kickdepth", "distance", "dist", "yards", "yds", "gross", "depth"] },
      { key: "yardline", label: "Pooch landing YL", synonyms: ["yldown", "yardline", "poochyl", "landingyl"] },
      { key: "hang", label: "Hang time", synonyms: ["pffhangtime", "hangtime", "hang", "ht"] },
      { key: "optime", label: "Op time", synonyms: ["oper", "opptime", "optime", "operation", "operationtime", "opp"] },
      { key: "hash", label: "Hash / position", synonyms: ["hash", "pos", "position"] },
    ],
    athleteKey: "athlete",
    requiredKeys: [],
    valueGroups: [
      { key: "type", label: "Punt types", hint: "match your report's calls to your types", options: puntTypes.map((t) => ({ id: t.id, label: t.label })), autoMatch: autoType },
      { key: "hash", label: "Hash / position", hint: "optional", optional: true, options: hashOptions, autoMatch: autoHash },
    ],
    buildRow: (get, resolveVal, resolveAthlete) => {
      const rawType = get("type");
      const typeId = rawType ? resolveVal("type", rawType) ?? "" : "";
      const cfg = puntTypes.find((t) => t.id === typeId);
      const isYL = cfg?.metric === "yardline";
      const depth = get("yards");
      const ylCol = get("yardline");
      const rawAth = get("athlete");
      const rawHash = get("hash");
      const row = {
        athlete: rawAth ? resolveAthlete(rawAth) ?? "" : "",
        type: typeId,
        hash: rawHash ? resolveVal("hash", rawHash) ?? "" : "",
        yards: isYL ? "" : depth,
        poochYL: isYL ? (ylCol || depth) : "",
        hangTime: get("hang"),
        opTime: get("optime"),
        directionalAccuracy: numeric(get("direction")),
      };
      if (!row.athlete || !(row.type || row.yards || row.poochYL || row.hangTime || row.opTime || row.directionalAccuracy)) return null;
      return row;
    },
    previewCols: [
      { label: "Athlete", get: (r) => r.athlete, className: "text-slate-200" },
      { label: "Type", get: (r) => puntTypes.find((t) => t.id === r.type)?.label ?? "" },
      { label: "Dist / YL", get: (r) => (r.poochYL ? `${r.poochYL} YL` : r.yards ? `${r.yards} yd` : "") },
      { label: "Hang", get: (r) => r.hangTime, className: "text-muted" },
      { label: "OT", get: (r) => r.opTime, className: "text-muted" },
      { label: "Dir", get: (r) => r.directionalAccuracy, className: "text-accent" },
    ],
  };
}

// ── Kickoff ──────────────────────────────────────────────────────────────────
export function buildKickoffImportConfig(opts: {
  koTypes: { id: string; label: string }[];
  hashOptions: { id: string; label: string }[];
}): ImportConfig {
  const { koTypes, hashOptions } = opts;
  const autoType = (raw: string) => { const n = norm(raw); return koTypes.find((t) => norm(t.label) === n || norm(t.id) === n)?.id; };
  const autoHash = (raw: string) => { const n = norm(raw); return hashOptions.find((h) => norm(h.label) === n || norm(h.id) === n)?.id; };
  return {
    title: "Import Kickoff Report",
    storageKey: "koImportMaps_v1",
    sheetHint: "kickoff",
    columns: [
      { key: "athlete", label: "Athlete (name or #)", synonyms: ["pffkicker", "kicker", "athlete", "player", "jersey", "kickernum", "playernum", "number", "name"] },
      { key: "type", label: "Kick type", synonyms: ["call", "type", "kicktype", "kotype"] },
      { key: "distance", label: "Distance / depth", synonyms: ["pffkickdepth", "kickdepth", "distance", "dist", "yards", "yds", "depth", "gross"] },
      { key: "hang", label: "Hang time", synonyms: ["pffhangtime", "hangtime", "hang", "ht"] },
      { key: "direction", label: "Direction score", synonyms: ["direction", "dir", "dirscore"] },
      { key: "hash", label: "Hash / position", synonyms: ["hash", "pos", "position"] },
    ],
    athleteKey: "athlete",
    requiredKeys: [],
    valueGroups: [
      { key: "type", label: "Kick types", hint: "optional — match your report's calls", optional: true, options: koTypes.map((t) => ({ id: t.id, label: t.label })), autoMatch: autoType },
      { key: "hash", label: "Hash / position", hint: "optional", optional: true, options: hashOptions, autoMatch: autoHash },
    ],
    buildRow: (get, resolveVal, resolveAthlete) => {
      const rawAth = get("athlete");
      const rawType = get("type");
      const rawHash = get("hash");
      const row = {
        athlete: rawAth ? resolveAthlete(rawAth) ?? "" : "",
        type: rawType ? resolveVal("type", rawType) ?? "" : "",
        hash: rawHash ? resolveVal("hash", rawHash) ?? "" : "",
        distance: get("distance"),
        hangTime: get("hang"),
        direction: numeric(get("direction")),
      };
      if (!row.athlete || !(row.distance || row.hangTime || row.type || row.direction)) return null;
      return row;
    },
    previewCols: [
      { label: "Athlete", get: (r) => r.athlete, className: "text-slate-200" },
      { label: "Type", get: (r) => koTypes.find((t) => t.id === r.type)?.label ?? "" },
      { label: "Dist", get: (r) => (r.distance ? `${r.distance} yd` : "") },
      { label: "Hang", get: (r) => r.hangTime, className: "text-muted" },
      { label: "Dir", get: (r) => r.direction, className: "text-accent" },
    ],
  };
}

// ── FG ───────────────────────────────────────────────────────────────────────
const FG_RESULT_OPTIONS = [
  { id: "YC", label: "Good — Center" },
  { id: "YL", label: "Good — Left" },
  { id: "YR", label: "Good — Right" },
  { id: "XL", label: "Miss — Left" },
  { id: "XR", label: "Miss — Right" },
  { id: "XS", label: "Miss — Short" },
  { id: "X", label: "Miss / Block" },
];
export function buildFGImportConfig(opts: { posOptions: { id: string; label: string }[] }): ImportConfig {
  const { posOptions } = opts;
  const autoResult = (raw: string): string | undefined => {
    const n = norm(raw);
    if (n === "good" || n === "make" || n === "g" || n === "made") return "YC";
    if (n.includes("wr") || n === "wideright" || n === "right") return "XR";
    if (n.includes("wl") || n === "wideleft" || n === "left") return "XL";
    if (n.includes("short") || n === "sh") return "XS";
    if (n.includes("block") || n === "bk" || n === "blk") return "X";
    return FG_RESULT_OPTIONS.find((o) => norm(o.id) === n)?.id;
  };
  const autoPos = (raw: string) => { const n = norm(raw); return posOptions.find((p) => norm(p.label) === n || norm(p.id) === n)?.id; };
  return {
    title: "Import FG Report",
    storageKey: "fgImportMaps_v1",
    sheetHint: "fg",
    columns: [
      { key: "athlete", label: "Athlete (name or #)", synonyms: ["pffkicker", "kicker", "athlete", "player", "jersey", "kickernum", "playernum", "number", "name"] },
      { key: "dist", label: "Distance", synonyms: ["pffkickdepth", "kickdepth", "distance", "dist", "yards", "yds", "depth"] },
      { key: "result", label: "Result", synonyms: ["comments5", "comments", "result", "make", "outcome", "res"] },
      { key: "optime", label: "Op time", synonyms: ["oper", "opptime", "optime", "operation", "operationtime", "opp"] },
      { key: "pos", label: "Position / hash", synonyms: ["hash", "pos", "position"] },
    ],
    athleteKey: "athlete",
    requiredKeys: [],
    valueGroups: [
      { key: "result", label: "Results", hint: "match your report's codes to make/miss", options: FG_RESULT_OPTIONS, autoMatch: autoResult },
      { key: "pos", label: "Position / hash", hint: "optional", optional: true, options: posOptions, autoMatch: autoPos },
    ],
    buildRow: (get, resolveVal, resolveAthlete) => {
      const rawAth = get("athlete");
      const distRaw = get("dist");
      const isPAT = distRaw.toUpperCase() === "PAT";
      const rawPos = get("pos");
      const rawResult = get("result");
      const row = {
        athlete: rawAth ? resolveAthlete(rawAth) ?? "" : "",
        dist: isPAT ? "" : numeric(distRaw),
        pos: rawPos ? resolveVal("pos", rawPos) ?? "" : "",
        result: rawResult ? resolveVal("result", rawResult) ?? "" : "",
        score: "",
        opTime: get("optime"),
      };
      if (!row.athlete || !(row.dist || row.result || row.opTime)) return null;
      return row;
    },
    previewCols: [
      { label: "Athlete", get: (r) => r.athlete, className: "text-slate-200" },
      { label: "Dist", get: (r) => (r.dist ? `${r.dist} yd` : "PAT") },
      { label: "Pos", get: (r) => r.pos },
      { label: "Result", get: (r) => FG_RESULT_OPTIONS.find((o) => o.id === r.result)?.label ?? "", className: "text-slate-300" },
      { label: "OT", get: (r) => r.opTime, className: "text-muted" },
    ],
  };
}
