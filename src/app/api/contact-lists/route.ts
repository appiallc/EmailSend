import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { importContactsToList } from "@/lib/contact-lists";

export async function GET() {
  const lists = await prisma.contactList.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });

  return NextResponse.json(
    lists.map((l) => ({
      id: l.id,
      name: l.name,
      createdAt: l.createdAt,
      contactCount: l._count.contacts,
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: "List name is required" }, { status: 400 });
  }
  if (!body.csv) {
    return NextResponse.json({ error: "CSV file is required" }, { status: 400 });
  }

  const list = await prisma.contactList.create({ data: { name } });
  const result = await importContactsToList(list.id, body.csv, true);

  return NextResponse.json({
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    contactCount: result.imported,
    imported: result.imported,
    errors: result.errors,
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  if (body.name !== undefined) {
    await prisma.contactList.update({
      where: { id },
      data: { name: body.name.trim() || "Untitled List" },
    });
  }

  if (body.csv) {
    const replace = body.replace !== false;
    const result = await importContactsToList(id, body.csv, replace);
    const list = await prisma.contactList.findUnique({
      where: { id },
      include: { _count: { select: { contacts: true } } },
    });

    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      contactCount: list._count.contacts,
      imported: result.imported,
      errors: result.errors,
      replaced: replace,
    });
  }

  const list = await prisma.contactList.findUnique({
    where: { id },
    include: { _count: { select: { contacts: true } } },
  });

  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    contactCount: list._count.contacts,
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  await prisma.contactList.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
