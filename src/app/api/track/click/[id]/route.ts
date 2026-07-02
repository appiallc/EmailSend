import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = request.nextUrl.searchParams.get("url");

  const log = await prisma.emailLog.findUnique({ where: { trackingId: id } });
  if (log) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        clickedAt: new Date(),
        status: ["sent", "opened"].includes(log.status) ? "clicked" : log.status,
      },
    });
  }

  if (url) {
    return NextResponse.redirect(url);
  }

  return NextResponse.json({ ok: true });
}
