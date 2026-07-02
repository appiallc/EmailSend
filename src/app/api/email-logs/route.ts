import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(request: NextRequest) {
  const { id, status } = await request.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const data: Record<string, unknown> = { status };
  if (status === "replied") data.repliedAt = new Date();

  const log = await prisma.emailLog.update({
    where: { id },
    data,
  });
  return NextResponse.json(log);
}
