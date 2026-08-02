import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.error("resolve-invite: Supabase env vars are not set");
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }
    const supabase = createClient(url, serviceKey);

    const body = await req.json();
    const { code, action } = body;

    // ─── Action: register-member ──────────────────────────────────
    // Called after signup to insert the new user into the members table
    // server-side (bypasses RLS via service role key).
    if (action === "register-member") {
      const { userId, teamId, email, name, role, access } = body;
      if (!userId || !teamId || !email || !name) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const { error: memberError } = await supabase.from("members").upsert(
        {
          id: userId,
          team_id: teamId,
          email,
          name,
          role: role || "athlete",
          access: access || "view",
          last_seen: new Date().toISOString(),
        },
        { onConflict: "team_id,id" }
      );
      if (memberError) {
        console.error("resolve-invite: member insert failed:", memberError);
        return NextResponse.json({ error: "Member registration failed" }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // ─── Action: resolve invite code ──────────────────────────────
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const clean = code.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!clean) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    // Try new invite_codes table first (indexed lookup)
    const { data: byCoach } = await supabase
      .from("invite_codes")
      .select("team_id")
      .eq("coach_code", clean)
      .maybeSingle();
    if (byCoach) {
      return NextResponse.json({ teamId: byCoach.team_id, role: "coach" });
    }

    const { data: byAthlete } = await supabase
      .from("invite_codes")
      .select("team_id")
      .eq("athlete_code", clean)
      .maybeSingle();
    if (byAthlete) {
      return NextResponse.json({ teamId: byAthlete.team_id, role: "athlete" });
    }

    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
