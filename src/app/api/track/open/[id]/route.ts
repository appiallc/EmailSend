import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const log = await prisma.emailLog.findUnique({ where: { trackingId: id } });

  if (log && !log.openedAt) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        openedAt: new Date(),
        status: log.status === "sent" ? "opened" : log.status,
      },
    });
  } else if (log && log.status === "sent") {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: "opened", openedAt: new Date() },
    });
  }

  const pixel = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  return new NextResponse(pixel, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
