import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { verifySmtpConnection } from "@/lib/email";

export async function POST() {
  try {
    const settings = await getSettings();
    if (!settings.smtpHost || !settings.smtpUser) {
      return NextResponse.json(
        { error: "Save SMTP host and username first." },
        { status: 400 }
      );
    }
    if (!settings.smtpPass) {
      return NextResponse.json(
        { error: "SMTP password is empty. Save your password, then test again." },
        { status: 400 }
      );
    }

    await verifySmtpConnection(settings);
    return NextResponse.json({
      ok: true,
      message: `SMTP connection successful (${settings.smtpHost}:${settings.smtpPort}).`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "SMTP connection failed. Check host, port, SSL, and credentials.",
      },
      { status: 400 }
    );
  }
}
