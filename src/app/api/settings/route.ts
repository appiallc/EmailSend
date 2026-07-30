import { NextRequest, NextResponse } from "next/server";
import { prisma, getSettings } from "@/lib/db";
import { PASSWORD_MASK } from "@/lib/password-mask";
import { encryptSecret } from "@/lib/secrets";
import { normalizeSendDelayMs } from "@/lib/deliverability";
import { parseTimeOfDay, resolveTimezone } from "@/lib/send-time";

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

  if (body.sendDelayMs !== undefined) {
    data.sendDelayMs = normalizeSendDelayMs(body.sendDelayMs);
  }
  if (body.timezone !== undefined) {
    data.timezone = resolveTimezone(String(body.timezone));
  }
  if (body.businessDaysOnly !== undefined) {
    data.businessDaysOnly = !!body.businessDaysOnly;
  }
  if (body.sendWindowStart !== undefined) {
    data.sendWindowStart = parseTimeOfDay(body.sendWindowStart, "09:00");
  }
  if (body.sendWindowEnd !== undefined) {
    data.sendWindowEnd = parseTimeOfDay(body.sendWindowEnd, "17:00");
  }
  if (body.dailySendLimit !== undefined) {
    const n = Number(body.dailySendLimit);
    data.dailySendLimit = Number.isFinite(n)
      ? Math.max(0, Math.min(10_000, Math.floor(n)))
      : 100;
  }
  if (body.bouncePausePercent !== undefined) {
    const n = Number(body.bouncePausePercent);
    data.bouncePausePercent = Number.isFinite(n)
      ? Math.max(0, Math.min(100, Math.floor(n)))
      : 5;
  }

  if (body.smtpPass && body.smtpPass !== PASSWORD_MASK) {
    data.smtpPass = encryptSecret(String(body.smtpPass));
  }
  if (body.imapPass && body.imapPass !== PASSWORD_MASK) {
    data.imapPass = encryptSecret(String(body.imapPass));
  }

  const settings = await prisma.settings.update({
    where: { id: "default" },
    data,
  });

  const runtime = await getSettings();
  return NextResponse.json({
    ...runtime,
    smtpPass: settings.smtpPass || runtime.smtpPass ? PASSWORD_MASK : "",
    imapPass: settings.imapPass || runtime.imapPass ? PASSWORD_MASK : "",
  });
}
