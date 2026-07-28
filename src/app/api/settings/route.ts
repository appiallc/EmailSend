import { NextRequest, NextResponse } from "next/server";
import { prisma, getSettings } from "@/lib/db";
import { PASSWORD_MASK } from "@/lib/password-mask";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    ...settings,
    smtpPass: settings.smtpPass ? PASSWORD_MASK : "",
    imapPass: settings.imapPass ? PASSWORD_MASK : "",
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  const data: Record<string, unknown> = {};
  const fields = [
    "companyName",
    "emailSignature",
    "smtpHost",
    "smtpPort",
    "smtpSecure",
    "smtpUser",
    "smtpFrom",
    "imapHost",
    "imapPort",
    "imapUser",
    "baseUrl",
  ] as const;

  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }

  if (body.smtpPass && body.smtpPass !== PASSWORD_MASK) {
    data.smtpPass = body.smtpPass;
  }
  if (body.imapPass && body.imapPass !== PASSWORD_MASK) {
    data.imapPass = body.imapPass;
  }

  const settings = await prisma.settings.update({
    where: { id: "default" },
    data,
  });

  return NextResponse.json({
    ...settings,
    smtpPass: settings.smtpPass ? PASSWORD_MASK : "",
    imapPass: settings.imapPass ? PASSWORD_MASK : "",
  });
}
