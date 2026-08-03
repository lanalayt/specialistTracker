import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { rowToTeamSettings, type TeamSettings } from "@/lib/teamSettingsTypes";
import { localKeyForSport } from "@/lib/settingsKeys";

export interface ServerBootstrap {
  team: TeamSettings | null;
  /** Per-user settings keyed by local key (fgSettings, snapSettings, ...). */
  settings: Record<string, unknown>;
}

/**
 * Resolve the signed-in user's team row and per-user settings on the server so
 * they can be injected into the initial HTML (window.__ST_BOOTSTRAP__). This
 * seeds the client caches synchronously → correct first paint, no flash, no
 * client storage. Returns empty data when logged out or on any error.
 *
 * Team id resolution mirrors the client (AppProviders): athletes use their
 * `teamId` metadata; everyone else's team id IS their user id.
 */
export async function getServerBootstrap(): Promise<ServerBootstrap> {
  const empty: ServerBootstrap = { team: null, settings: {} };
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          // No-op: a Server Component cannot set cookies; middleware refreshes them.
          setAll() {},
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return empty;

    const meta = (user.user_metadata ?? {}) as { role?: string; teamId?: string };
    // Match the client's getTeamId: the team a user JOINED (metadata.teamId) if
    // set — covers athletes AND co-coaches — else their own account is the team.
    const teamId = meta.teamId ? meta.teamId : user.id;

    const [teamRes, userSettingsRes, teamSettingsRes] = await Promise.all([
      supabase.from("teams").select("*").eq("id", teamId).single(),
      supabase.from("user_settings").select("sport, settings").eq("user_id", user.id),
      supabase.from("team_sport_settings").select("sport, settings").eq("team_id", teamId),
    ]);

    const team = teamRes.data ? rowToTeamSettings(teamRes.data) : null;

    const settings: Record<string, unknown> = {};
    // Per-user prefs first...
    for (const row of userSettingsRes.data ?? []) {
      const localKey = localKeyForSport(row.sport as string);
      if (localKey && row.settings != null) settings[localKey] = row.settings;
    }
    // ...then team charting config wins for the team-scoped keys (fg/punt/kickoff/
    // snap + strike zones), so athletes/co-coaches see the coach's setup.
    for (const row of teamSettingsRes.data ?? []) {
      const localKey = localKeyForSport(row.sport as string);
      if (localKey && row.settings != null) settings[localKey] = row.settings;
    }

    return { team, settings };
  } catch {
    return empty;
  }
}
