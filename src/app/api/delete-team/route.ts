import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Server-side Supabase client with service_role for admin operations */
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
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
    const { data: members } = await admin
      .from("members")
      .select("id, role")
      .eq("team_id", teamId);

    const memberIds = (members ?? [])
      .map((m) => m.id as string)
      .filter((id) => id !== teamId); // exclude admin — deleted last

    // 3. Delete all team data from every table
    const deletes = await Promise.all([
      admin.from("sessions").delete().eq("team_id", teamId),
      admin.from("athletes").delete().eq("team_id", teamId),
      admin.from("archives").delete().eq("team_id", teamId),
      admin.from("members").delete().eq("team_id", teamId),
      admin.from("team_data").delete().eq("team_id", teamId),
      admin.from("teams").delete().eq("id", teamId),
      admin.from("user_data").delete().eq("user_id", teamId),
    ]);
    const tableNames = ["sessions", "athletes", "archives", "members", "team_data", "teams", "user_data"];
    deletes.forEach((r, i) => {
      if (r.error) console.error(`[delete-team] Failed to delete ${tableNames[i]}:`, r.error);
    });

    // 4. Delete athlete/coach auth accounts
    for (const memberId of memberIds) {
      // Also clean up their user_data
      await admin.from("user_data").delete().eq("user_id", memberId);
      await admin.auth.admin.deleteUser(memberId);
    }

    // 5. Delete the admin's own auth account (last)
    await admin.auth.admin.deleteUser(teamId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[delete-team] Error:", err);
    return NextResponse.json(
      { error: "Failed to delete team account" },
      { status: 500 }
    );
  }
}
