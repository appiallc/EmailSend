import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { shouldCountOpen } from "@/lib/tracking";

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const log = await prisma.emailLog.findUnique({ where: { trackingId: id } });

  if (log && !log.openedAt && shouldCountOpen(log.sentAt)) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        openedAt: new Date(),
        status: log.status === "sent" ? "opened" : log.status,
      },
    });
  }

  return new NextResponse(TRANSPARENT_GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
