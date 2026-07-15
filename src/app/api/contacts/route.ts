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

export async function POST(request: NextRequest) {
  const body = await request.json();
  const contactListId = body.contactListId as string | undefined;
  const email = (body.email as string | undefined)?.trim().toLowerCase();

  if (!contactListId) {
    return NextResponse.json({ error: "contactListId required" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        contactListId,
        email,
        firstName: body.firstName?.trim() || "",
        lastName: body.lastName?.trim() || "",
        company: body.company?.trim() || "",
        title: body.title?.trim() || "",
        phone: body.phone?.trim() || "",
        notes: body.notes?.trim() || "",
      },
    });
    return NextResponse.json(contact);
  } catch {
    return NextResponse.json(
      { error: "A contact with this email already exists in the list" },
      { status: 409 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();

  // Batch update: { contacts: [{ id, email, firstName, ... }] }
  if (Array.isArray(body.contacts)) {
    const updated = [];
    for (const row of body.contacts as Array<Record<string, string>>) {
      if (!row.id) continue;
      const email = row.email?.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return NextResponse.json(
          { error: `Invalid email for contact ${row.id}` },
          { status: 400 }
        );
      }
      try {
        const contact = await prisma.contact.update({
          where: { id: row.id },
          data: {
            email,
            firstName: row.firstName?.trim() ?? "",
            lastName: row.lastName?.trim() ?? "",
            company: row.company?.trim() ?? "",
            title: row.title?.trim() ?? "",
            phone: row.phone?.trim() ?? "",
            notes: row.notes?.trim() ?? "",
          },
        });
        updated.push(contact);
      } catch {
        return NextResponse.json(
          { error: `Could not update ${email} (duplicate email in this list?)` },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ updated: updated.length, contacts: updated });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const email =
    body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined;
  if (email !== undefined && (!email || !email.includes("@"))) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  try {
    const data: Record<string, string> = {};
    if (email !== undefined) data.email = email;
    if (body.firstName !== undefined) data.firstName = String(body.firstName).trim();
    if (body.lastName !== undefined) data.lastName = String(body.lastName).trim();
    if (body.company !== undefined) data.company = String(body.company).trim();
    if (body.title !== undefined) data.title = String(body.title).trim();
    if (body.phone !== undefined) data.phone = String(body.phone).trim();
    if (body.notes !== undefined) data.notes = String(body.notes).trim();

    const contact = await prisma.contact.update({ where: { id }, data });
    return NextResponse.json(contact);
  } catch {
    return NextResponse.json(
      { error: "Update failed (duplicate email in this list?)" },
      { status: 409 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
