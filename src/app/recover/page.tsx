"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { getTeamId } from "@/lib/teamData";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header, MobileNav } from "@/components/layout/Header";

interface SessionInfo {
  id: string;
  sport: string;
  label: string;
  date: string;
  mode?: string;
  opponent?: string;
  entryCount: number;
}

interface SourceResult {
  source: string;
  dataKey: string;
  sessions: SessionInfo[];
  raw?: unknown;
}

function extractSessions(data: unknown, sport: string): SessionInfo[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  const history = d.history;
  if (!Array.isArray(history)) return [];
  return history.map((s: Record<string, unknown>) => ({
    id: (s.id as string) ?? "?",
    sport,
    label: (s.label as string) ?? "?",
    date: (s.date as string) ?? "?",
    mode: (s.mode as string) ?? undefined,
    opponent: (s.opponent as string) ?? undefined,
    entryCount: Array.isArray(s.entries) ? s.entries.length : 0,
  }));
}

function RecoverContent() {
  const { user } = useAuth();
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    scanAll();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function scanAll() {
    setLoading(true);
    const all: SourceResult[] = [];
    const supabase = createClient();
    const tid = getTeamId();
    const sports = [
      { key: "punt_data", lsKey: "st_punt_v1", label: "PUNTING" },
      { key: "kickoff_data", lsKey: "st_kickoff_v1", label: "KICKOFF" },
      { key: "fg_data", lsKey: "st_fg_v1", label: "KICKING" },
      { key: "longsnap_data", lsKey: "st_longsnap_v1", label: "LONGSNAP" },
    ];

    // 1. Check localStorage
    for (const s of sports) {
      try {
        const raw = localStorage.getItem(s.lsKey);
        if (raw) {
          const data = JSON.parse(raw);
          all.push({
            source: `localStorage (${s.lsKey})`,
            dataKey: s.key,
            sessions: extractSessions(data, s.label),
            raw: data,
          });
        }
      } catch {}
    }

    // 2. Check team_data table
    if (tid && tid !== "local-dev") {
      for (const s of sports) {
        try {
          const { data } = await supabase
            .from("team_data")
            .select("data, updated_at")
            .eq("team_id", tid)
            .eq("data_key", s.key)
            .single();
          if (data?.data) {
            all.push({
              source: `team_data (team: ${tid.slice(0, 8)}..., key: ${s.key})`,
              dataKey: s.key,
              sessions: extractSessions(data.data, s.label),
              raw: data.data,
            });
          }
        } catch {}
      }
    }

    // 3. Check user_data table (personal backup)
    if (user && user.id !== "local-dev") {
      for (const s of sports) {
        try {
          const { data } = await supabase
            .from("user_data")
            .select("data, updated_at")
            .eq("user_id", user.id)
            .eq("data_key", s.key)
            .single();
          if (data?.data) {
            all.push({
              source: `user_data (user: ${user.id.slice(0, 8)}..., key: ${s.key})`,
              dataKey: s.key,
              sessions: extractSessions(data.data, s.label),
              raw: data.data,
            });
          }
        } catch {}
      }
    }

    // 4. Check trash bin
    if (tid && tid !== "local-dev") {
      try {
        const { data } = await supabase
          .from("team_data")
          .select("data")
          .eq("team_id", tid)
          .eq("data_key", "deleted_sessions")
          .single();
        if (data?.data && Array.isArray(data.data)) {
          const trashed = data.data as Record<string, unknown>[];
          all.push({
            source: "Trash bin (deleted_sessions)",
            dataKey: "deleted_sessions",
            sessions: trashed.map((s) => ({
              id: (s.id as string) ?? "?",
              sport: (s.sport as string) ?? "?",
              label: (s.label as string) ?? "?",
              date: (s.date as string) ?? "?",
              mode: (s.mode as string) ?? undefined,
              opponent: (s.opponent as string) ?? undefined,
              entryCount: Array.isArray(s.entries) ? s.entries.length : 0,
            })),
          });
        }
      } catch {}
    }

    // 5. Check archives
    if (tid && tid !== "local-dev") {
      try {
        const { data } = await supabase
          .from("team_data")
          .select("data")
          .eq("team_id", tid)
          .eq("data_key", "stat_archives")
          .single();
        if (data?.data && Array.isArray(data.data)) {
          const archives = data.data as Record<string, unknown>[];
          for (const arch of archives) {
            const archName = (arch.name as string) ?? "Unnamed";
            for (const sportKey of ["fg", "punt", "kickoff"] as const) {
              const phaseData = arch[sportKey] as Record<string, unknown> | undefined;
              if (phaseData?.history && Array.isArray(phaseData.history)) {
                const label = sportKey === "fg" ? "KICKING" : sportKey === "punt" ? "PUNTING" : "KICKOFF";
                all.push({
                  source: `Archive: "${archName}" (${sportKey})`,
                  dataKey: `archive_${sportKey}`,
                  sessions: extractSessions(phaseData, label),
                });
              }
            }
          }
        }
      } catch {}
    }

    // 6. Check ALL team_data rows for this team (in case there's old data under different keys)
    if (tid && tid !== "local-dev") {
      try {
        const { data } = await supabase
          .from("team_data")
          .select("data_key, data, updated_at")
          .eq("team_id", tid);
        if (data) {
          const knownKeys = new Set(["punt_data", "kickoff_data", "fg_data", "longsnap_data", "deleted_sessions", "stat_archives", "team_members", "theme_colors", "settings_team"]);
          for (const row of data) {
            if (!knownKeys.has(row.data_key) && row.data) {
              // Unknown key — might contain sessions
              const sessions = extractSessions(row.data, row.data_key);
              if (sessions.length > 0) {
                all.push({
                  source: `team_data (unknown key: ${row.data_key})`,
                  dataKey: row.data_key,
                  sessions,
                  raw: row.data,
                });
              }
            }
          }
        }
      } catch {}
    }

    setResults(all);
    setLoading(false);
  }

  // Restore sessions from a source back into team_data
  async function restoreFromSource(result: SourceResult) {
    if (!result.raw) {
      setMessage("No raw data available for this source");
      return;
    }
    const targetKey = result.dataKey;
    if (!["punt_data", "kickoff_data", "fg_data", "longsnap_data"].includes(targetKey)) {
      setMessage("Cannot restore from this source type — manual recovery needed");
      return;
    }
    if (!confirm(`Restore ${result.sessions.length} sessions from "${result.source}" into ${targetKey}? This will MERGE with existing data (no data will be lost).`)) return;

    setRestoring(result.source);
    try {
      const supabase = createClient();
      const tid = getTeamId();
      if (!tid) throw new Error("No team ID");

      // Get current data
      const { data: current } = await supabase
        .from("team_data")
        .select("data")
        .eq("team_id", tid)
        .eq("data_key", targetKey)
        .single();

      const currentData = (current?.data ?? { athletes: [], stats: {}, history: [], snapshot: null }) as Record<string, unknown>;
      const sourceData = result.raw as Record<string, unknown>;

      // Merge histories
      const currentHistory = (Array.isArray(currentData.history) ? currentData.history : []) as Record<string, unknown>[];
      const sourceHistory = (Array.isArray(sourceData.history) ? sourceData.history : []) as Record<string, unknown>[];

      const merged = new Map<string, Record<string, unknown>>();
      for (const s of currentHistory) merged.set(s.id as string, s);
      for (const s of sourceHistory) {
        if (!merged.has(s.id as string)) merged.set(s.id as string, s);
      }
      const mergedHistory = Array.from(merged.values()).sort(
        (a, b) => new Date(a.date as string).getTime() - new Date(b.date as string).getTime()
      );

      // Merge athletes
      const athleteSet = new Set([
        ...((currentData.athletes as string[]) ?? []),
        ...((sourceData.athletes as string[]) ?? []),
      ]);

      const restored = {
        ...currentData,
        athletes: Array.from(athleteSet),
        history: mergedHistory,
      };

      // Write merged data to team_data
      await supabase
        .from("team_data")
        .upsert({
          team_id: tid,
          data_key: targetKey,
          data: restored,
          updated_at: new Date().toISOString(),
        }, { onConflict: "team_id,data_key" });

      // Also update localStorage
      const lsKeys: Record<string, string> = {
        punt_data: "st_punt_v1",
        kickoff_data: "st_kickoff_v1",
        fg_data: "st_fg_v1",
        longsnap_data: "st_longsnap_v1",
      };
      try {
        localStorage.setItem(lsKeys[targetKey], JSON.stringify(restored));
      } catch {}

      setMessage(`Restored! Merged to ${mergedHistory.length} total sessions in ${targetKey}. Refresh the page to see them.`);
      // Re-scan
      scanAll();
    } catch (err) {
      setMessage(`Restore failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Data Recovery" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Data Recovery Scanner</h1>
          <p className="text-sm text-muted mt-1">
            Scanning every data source for sessions. Looking for lost punt/kickoff game sessions from 4/11.
          </p>
        </div>

        {message && (
          <div className="card bg-accent/10 border-accent/30 text-accent text-sm p-3">
            {message}
          </div>
        )}

        {loading ? (
          <p className="text-muted text-sm py-8 text-center">Scanning all data sources...</p>
        ) : (
          results.map((r, i) => {
            const april11Sessions = r.sessions.filter((s) => s.date.startsWith("2026-04-11"));
            const gameSessions = r.sessions.filter((s) => s.mode === "game");
            const puntKoSessions = r.sessions.filter((s) => s.sport === "PUNTING" || s.sport === "KICKOFF");

            return (
              <div key={i} className="card space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-slate-100">{r.source}</p>
                    <p className="text-xs text-muted">{r.sessions.length} total sessions</p>
                  </div>
                  {!!r.raw && r.sessions.length > 0 && ["punt_data", "kickoff_data", "fg_data", "longsnap_data"].includes(r.dataKey) && (
                    <button
                      onClick={() => restoreFromSource(r)}
                      disabled={restoring === r.source}
                      className="text-xs px-3 py-1.5 rounded-input border border-make/50 text-make hover:bg-make/10 font-semibold transition-all disabled:opacity-40"
                    >
                      {restoring === r.source ? "Restoring..." : "Merge & Restore"}
                    </button>
                  )}
                </div>

                {april11Sessions.length > 0 && (
                  <div className="bg-make/10 border border-make/30 rounded-input p-2">
                    <p className="text-xs font-bold text-make mb-1">
                      FOUND {april11Sessions.length} session(s) from April 11:
                    </p>
                    {april11Sessions.map((s) => (
                      <p key={s.id} className="text-xs text-slate-200">
                        {s.sport} — {s.label} — {s.mode ?? "practice"} {s.opponent ? `vs ${s.opponent}` : ""} — {s.entryCount} entries
                      </p>
                    ))}
                  </div>
                )}

                {gameSessions.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">Game Sessions</p>
                    <div className="space-y-1">
                      {gameSessions.map((s) => (
                        <p key={s.id} className="text-xs text-slate-300">
                          {new Date(s.date).toLocaleDateString()} — {s.sport} — {s.label} {s.opponent ? `vs ${s.opponent}` : ""} — {s.entryCount} entries
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {r.sessions.length > 0 && gameSessions.length === 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">All Sessions (dates)</p>
                    <p className="text-xs text-muted">
                      {r.sessions.map((s) => new Date(s.date).toLocaleDateString()).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
                    </p>
                  </div>
                )}

                {r.sessions.length === 0 && (
                  <p className="text-xs text-muted">No sessions found in this source.</p>
                )}
              </div>
            );
          })
        )}

        {!loading && results.length === 0 && (
          <p className="text-muted text-sm py-8 text-center">No data sources found.</p>
        )}
      </main>
    </div>
  );
}

export default function RecoverPage() {
  return (
    <div className="flex overflow-x-hidden max-w-[100vw]">
      <Sidebar />
      <RecoverContent />
      <MobileNav />
    </div>
  );
}
