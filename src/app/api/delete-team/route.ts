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

export async function POST() {
  try {
    // 1. Verify the calling user is authenticated and is an admin
    const userClient = await createUserClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const role = user.user_metadata?.role;
    if (role !== "admin") {
      return NextResponse.json({ error: "Only admins can delete a team account" }, { status: 403 });
    }

    const teamId = user.id; // admin's UID = team_id
    const admin = createAdminClient();

    // 2. Find all team members (athletes + coaches) to delete their auth accounts
    const { data: members, error: membersError } = await admin
      .from("members")
      .select("id, role")
      .eq("team_id", teamId);

    if (membersError) {
      console.error("[delete-team] Failed to fetch members:", membersError);
    }

    const memberIds = (members ?? [])
      .map((m) => m.id as string)
      .filter((id) => id !== teamId); // exclude admin — deleted last

    // 3. Delete all team data from every table sequentially to ensure each completes
    const tables: [string, string, string][] = [
      ["sessions", "team_id", teamId],
      ["athletes", "team_id", teamId],
      ["archives", "team_id", teamId],
      ["members", "team_id", teamId],
      ["team_data", "team_id", teamId],
      ["teams", "id", teamId],
      ["user_data", "user_id", teamId],
    ];

    for (const [table, column, value] of tables) {
      const { error } = await admin.from(table).delete().eq(column, value);
      if (error) {
        console.error(`[delete-team] Failed to delete from ${table}:`, error);
      }
    }

    // 4. Delete athlete/coach auth accounts
    for (const memberId of memberIds) {
      await admin.from("user_data").delete().eq("user_id", memberId);
      const { error } = await admin.auth.admin.deleteUser(memberId);
      if (error) {
        console.error(`[delete-team] Failed to delete auth user ${memberId}:`, error);
      }
    }

    // 5. Delete the admin's own auth account (last)
    const { error: adminDeleteError } = await admin.auth.admin.deleteUser(teamId);
    if (adminDeleteError) {
      console.error("[delete-team] Failed to delete admin auth:", adminDeleteError);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-team] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete team account" },
      { status: 500 }
    );
  }
}
