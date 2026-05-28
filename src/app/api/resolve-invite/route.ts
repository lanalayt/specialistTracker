import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const clean = code.trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (!clean) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("team_data")
      .select("team_id, data")
      .eq("data_key", "invite_codes");

    if (error || !data) {
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }

    for (const row of data) {
      const codes = row.data as { coachCode?: string; athleteCode?: string };
      if (codes.coachCode === clean) {
        return NextResponse.json({ teamId: row.team_id, role: "coach" });
      }
      if (codes.athleteCode === clean) {
        return NextResponse.json({ teamId: row.team_id, role: "athlete" });
      }
    }

    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
