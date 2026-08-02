import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { ThemeColors } from "@/lib/themeCss";

/**
 * Resolve the signed-in user's team theme colors on the server so they can be
 * injected into the initial HTML (no flash, no client storage). Returns null
 * when logged out or on any error — callers fall back to the default theme.
 *
 * Team id resolution mirrors the client (AppProviders): athletes use their
 * `teamId` metadata; everyone else's team id IS their user id.
 */
export async function getServerThemeColors(): Promise<ThemeColors | null> {
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
    if (!user) return null;

    const meta = (user.user_metadata ?? {}) as { role?: string; teamId?: string };
    const teamId = meta.role === "athlete" && meta.teamId ? meta.teamId : user.id;

    const { data } = await supabase
      .from("teams")
      .select("color_primary, color_secondary, color_tertiary")
      .eq("id", teamId)
      .single();

    if (!data?.color_primary || !data?.color_secondary || !data?.color_tertiary) return null;
    return {
      primary: data.color_primary,
      secondary: data.color_secondary,
      tertiary: data.color_tertiary,
    };
  } catch {
    return null;
  }
}
