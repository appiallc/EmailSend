import { NextRequest, NextResponse } from "next/server";
import type { Contact } from "@prisma/client";
import { auth } from "@/auth";
import { getSettings } from "@/lib/db";
import { sendTrackedEmail } from "@/lib/email";

/** Send a one-off test email (not stored as a campaign log). */
export async function POST(request: NextRequest) {
  const session = await auth();
  const body = await request.json();
  const subject = String(body.subject || "").trim();
  const bodyHtml = String(body.bodyHtml || "").trim();
  const to =
    String(body.to || "").trim() || session?.user?.email || "";

  if (!to) {
    return NextResponse.json(
      { error: "No recipient. Pass to= or sign in with an email." },
      { status: 400 }
    );
  }
  if (!subject || !bodyHtml) {
    return NextResponse.json(
      { error: "Subject and body are required" },
      { status: 400 }
    );
  }

  const settings = await getSettings();
  if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
    return NextResponse.json(
      { error: "SMTP is not configured. Save SMTP settings first." },
      { status: 400 }
    );
  }

  try {
    const fakeContact = {
      id: "test-send",
      email: to,
      firstName: "Test",
      lastName: "Recipient",
      company: "Test Company",
      title: "",
      phone: "",
      notes: "",
      contactListId: "test",
      createdAt: new Date(),
    } as Contact;

    await sendTrackedEmail({
      settings,
      contact: fakeContact,
      subject: `[TEST] ${subject}`,
      bodyHtml,
      trackingId: `test-${Date.now()}`,
    });

    return NextResponse.json({
      ok: true,
      message: `Test email sent to ${to}`,
      to,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to send test email",
      },
      { status: 400 }
    );
  }
}
