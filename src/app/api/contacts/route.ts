import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseContactsCsv } from "@/lib/csv";

export async function GET() {
  const contacts = await prisma.contact.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(contacts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.csv) {
    const { contacts, errors } = parseContactsCsv(body.csv);
    let imported = 0;

    for (const c of contacts) {
      await prisma.contact.upsert({
        where: { email: c.email.toLowerCase() },
        create: {
          email: c.email.toLowerCase(),
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          title: c.title,
          phone: c.phone,
          notes: c.notes,
        },
        update: {
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          title: c.title,
          phone: c.phone,
          notes: c.notes,
        },
      });
      imported++;
    }

    return NextResponse.json({ imported, errors, total: contacts.length });
  }

  if (body.email) {
    const contact = await prisma.contact.create({
      data: {
        email: body.email.toLowerCase(),
        firstName: body.firstName || "",
        lastName: body.lastName || "",
        company: body.company || "",
        title: body.title || "",
        phone: body.phone || "",
        notes: body.notes || "",
      },
    });
    return NextResponse.json(contact);
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
