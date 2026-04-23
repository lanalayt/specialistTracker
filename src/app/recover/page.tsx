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

    // 1. Check sessions table (new storage)
    if (tid && tid !== "local-dev") {
      try {
        const { data } = await supabase
          .from("sessions")
          .select("*")
          .eq("team_id", tid)
          .is("deleted_at", null)
          .order("date", { ascending: true });
        if (data && data.length > 0) {
          const bySport = new Map<string, SessionInfo[]>();
          for (const row of data) {
            const sport = row.sport as string;
            if (!bySport.has(sport)) bySport.set(sport, []);
            bySport.get(sport)!.push({
              id: row.id,
              sport,
              label: row.label,
              date: row.date,
              mode: row.mode,
              opponent: row.opponent,
              entryCount: Array.isArray(row.entries) ? row.entries.length : 0,
            });
          }
          for (const [sport, sessions] of bySport) {
            all.push({
              source: `sessions table (${sport})`,
              dataKey: `sessions_${sport}`,
              sessions,
            });
          }
        }
      } catch {}

      // Also check deleted sessions
      try {
        const { data } = await supabase
          .from("sessions")
          .select("*")
          .eq("team_id", tid)
          .not("deleted_at", "is", null)
          .order("deleted_at", { ascending: false });
        if (data && data.length > 0) {
          all.push({
            source: "sessions table (soft-deleted)",
            dataKey: "sessions_deleted",
            sessions: data.map((row) => ({
              id: row.id,
              sport: row.sport,
              label: row.label,
              date: row.date,
              mode: row.mode,
              opponent: row.opponent,
              entryCount: Array.isArray(row.entries) ? row.entries.length : 0,
            })),
          });
        }
      } catch {}
    }

    // 2. Check localStorage (old blobs)
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

    // 3. Check team_data table (old blobs)
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

    // 4. Check user_data table (personal backup)
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

    // 5. Check archives table
    if (tid && tid !== "local-dev") {
      try {
        const { data } = await supabase
          .from("archives")
          .select("*")
          .eq("team_id", tid);
        if (data && data.length > 0) {
          for (const arch of data) {
            for (const sportKey of ["fg", "punt", "kickoff"] as const) {
              const phaseData = arch[sportKey] as Record<string, unknown> | undefined;
              if (phaseData?.history && Array.isArray(phaseData.history)) {
                const label = sportKey === "fg" ? "KICKING" : sportKey === "punt" ? "PUNTING" : "KICKOFF";
                all.push({
                  source: `Archive: "${arch.name}" (${sportKey})`,
                  dataKey: `archive_${sportKey}`,
                  sessions: extractSessions(phaseData, label),
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

  return (
    <div className="lg:pl-56 min-h-screen min-w-0 pb-20 lg:pb-0">
      <Header title="Data Recovery" />
      <main className="p-4 lg:p-6 max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-100">Data Recovery Scanner</h1>
          <p className="text-sm text-muted mt-1">
            Scanning all data sources for sessions — sessions table, localStorage, team_data blobs, and archives.
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
            const gameSessions = r.sessions.filter((s) => s.mode === "game");

            return (
              <div key={i} className="card space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <p className="text-sm font-bold text-slate-100">{r.source}</p>
                    <p className="text-xs text-muted">{r.sessions.length} total sessions</p>
                  </div>
                </div>

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
