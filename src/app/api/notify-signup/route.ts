import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const { name, email, school, role } = await req.json();

    await resend.emails.send({
      from: "Specialist Tracker <onboarding@resend.dev>",
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

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Signup notification error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
