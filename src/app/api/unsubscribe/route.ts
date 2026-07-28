import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleReplyOrBounce } from "@/lib/campaign";
import { suppressEmail } from "@/lib/suppression";

async function unsubscribeByTrackingId(trackingId: string) {
  const log = await prisma.emailLog.findUnique({
    where: { trackingId },
    include: { contact: true },
  });

  if (!log) {
    return { ok: false as const, error: "Invalid or expired unsubscribe link" };
  }

  await suppressEmail(log.contact.email, "unsubscribe", trackingId);
  await handleReplyOrBounce(log.campaignId, log.contactId);

  return {
    ok: true as const,
    email: log.contact.email,
  };
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  // One-click List-Unsubscribe (RFC 8058)
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    const trackingId =
      String(form.get("trackingId") || "") ||
      request.nextUrl.searchParams.get("trackingId") ||
      "";
    if (!trackingId) {
      return NextResponse.json({ error: "trackingId required" }, { status: 400 });
    }
    const result = await unsubscribeByTrackingId(trackingId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return new NextResponse(null, { status: 200 });
  }

  const body = await request.json().catch(() => ({}));
  const trackingId =
    (body as { trackingId?: string }).trackingId ||
    request.nextUrl.searchParams.get("trackingId") ||
    "";

  if (!trackingId) {
    return NextResponse.json({ error: "trackingId required" }, { status: 400 });
  }

  const result = await unsubscribeByTrackingId(trackingId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    message: `Unsubscribed ${result.email}`,
    email: result.email,
  });
}

export async function GET(request: NextRequest) {
  const trackingId = request.nextUrl.searchParams.get("trackingId");
  if (!trackingId) {
    return NextResponse.json({ error: "trackingId required" }, { status: 400 });
  }
  const result = await unsubscribeByTrackingId(trackingId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true, email: result.email });
}
