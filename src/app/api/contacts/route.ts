import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");

  if (!listId) {
    return NextResponse.json({ error: "listId query parameter required" }, { status: 400 });
  }

  const contacts = await prisma.contact.findMany({
    where: { contactListId: listId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(contacts);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
