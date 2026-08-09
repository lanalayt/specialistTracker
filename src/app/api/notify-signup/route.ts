import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("Signup notification skipped: RESEND_API_KEY is not set");
      return NextResponse.json({ ok: false, error: "Email not configured" }, { status: 500 });
    }
    const resend = new Resend(apiKey);

    const { name, email, school, role } = await req.json();

    // Resend returns { data, error } — it does NOT throw on a rejected send
    // (e.g. a suppressed recipient), so check `error` explicitly or a failed
    // send looks like a success.
    const { data, error } = await resend.emails.send({
      from: "Specialist Tracker <noreply@specs-tracker.com>",
      to: "specialiststracker@gmail.com",
      subject: `New Signup: ${name} (${role})`,
      html: `
        <h2>New Specialist Tracker Signup</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="padding:6px 12px;font-weight:bold;">Name</td><td style="padding:6px 12px;">${name}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">Email</td><td style="padding:6px 12px;">${email}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">School</td><td style="padding:6px 12px;">${school || "—"}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;">Role</td><td style="padding:6px 12px;">${role === "athlete" ? "Athlete" : "Coach"}</td></tr>
        </table>
      `,
    });

    if (error) {
      console.error(`Signup notification: Resend rejected the send for ${email}:`, error);
      return NextResponse.json({ ok: false, error: error.message ?? String(error) }, { status: 502 });
    }

    console.log(`Signup notification sent (id ${data?.id}) for ${email}`);
    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error("Signup notification error (send threw):", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
