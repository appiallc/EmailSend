import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron-auth";

function dbHost(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const host = dbHost();

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Settings'
    ORDER BY column_name
  `;

  const identity = await prisma.$queryRaw<
    Array<{ current_database: string; current_user: string; current_schema: string }>
  >`SELECT current_database(), current_user, current_schema()`;

  let findUniqueError: string | null = null;
  try {
    await prisma.settings.findUnique({ where: { id: "default" } });
  } catch (err) {
    findUniqueError = err instanceof Error ? err.message : String(err);
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      findUniqueError = `${err.code}: ${err.message}`;
    }
  }

  return NextResponse.json({
    host,
    identity: identity[0] ?? null,
    settingsColumns: columns.map((c) => c.column_name),
    hasEmailSignature: columns.some((c) => c.column_name === "emailSignature"),
    findUniqueOk: !findUniqueError,
    findUniqueError,
  });
}
