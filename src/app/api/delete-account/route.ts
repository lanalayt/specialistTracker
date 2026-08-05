import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side Supabase client with service_role for admin operations */
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Server-side Supabase client using the user's session cookie */
async function createUserClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
}

/**
 * Self-service account deletion for a user who JOINED a team (athlete or
 * co-coach). Removes only the caller's own footprint — their members row,
 * their per-user settings, and their auth login — and never touches the
 * team's shared data. The team owner (whose uid IS the team id) must use
 * /api/delete-team instead, which tears down the whole team.
 */
export async function POST() {
  try {
    const userClient = await createUserClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // The team the user joined lives in their metadata. If it's unset or equals
    // their own id, they're a team owner — self-delete would orphan the team.
    const teamId = (user.user_metadata?.teamId as string | undefined) ?? undefined;
    if (!teamId || teamId === user.id) {
      return NextResponse.json(
        { error: "Team owners must use team deletion, not account deletion." },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // 1. Remove their team membership so the coach's roster drops them.
    const { error: memberErr } = await admin
      .from("members")
      .delete()
      .eq("team_id", teamId)
      .eq("id", user.id);
    if (memberErr) {
      console.error("[delete-account] Failed to delete member row:", memberErr);
    }

    // 2. Remove their per-user settings (user-scoped, safe to delete).
    const { error: settingsErr } = await admin
      .from("user_settings")
      .delete()
      .eq("user_id", user.id);
    if (settingsErr) {
      console.error("[delete-account] Failed to delete user_settings:", settingsErr);
    }

    // 3. Delete their auth login (last — this invalidates the session).
    const { error: authDeleteErr } = await admin.auth.admin.deleteUser(user.id);
    if (authDeleteErr) {
      console.error("[delete-account] Failed to delete auth user:", authDeleteErr);
      return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-account] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete account" },
      { status: 500 }
    );
  }
}
