import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function buildContactNotes(lead: {
  notes: string;
  upworkJobUrl: string;
  linkedinCompanyUrl: string;
  source: string;
}): string {
  const bits: string[] = [];
  if (lead.notes.trim()) bits.push(lead.notes.trim());
  if (lead.upworkJobUrl.trim()) bits.push(`Upwork: ${lead.upworkJobUrl.trim()}`);
  if (lead.linkedinCompanyUrl.trim()) {
    bits.push(`LinkedIn company: ${lead.linkedinCompanyUrl.trim()}`);
  }
  if (lead.source.trim()) bits.push(`Source: ${lead.source.trim()}`);
  return bits.join("\n");
}

/** Move selected research leads into a contact list for campaigns. */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    leadIds?: unknown;
    contactListId?: unknown;
    newListName?: unknown;
    deleteLeads?: unknown;
  };

  const leadIds = Array.isArray(body.leadIds)
    ? body.leadIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "Select at least one lead." }, { status: 400 });
  }

  let contactListId = String(body.contactListId || "").trim();
  const newListName = String(body.newListName || "").trim();
  const deleteLeads = body.deleteLeads !== false;

  if (!contactListId && !newListName) {
    return NextResponse.json(
      { error: "Choose a contact list or enter a new list name." },
      { status: 400 }
    );
  }

  if (!contactListId && newListName) {
    const list = await prisma.contactList.create({ data: { name: newListName } });
    contactListId = list.id;
  } else {
    const exists = await prisma.contactList.findUnique({ where: { id: contactListId } });
    if (!exists) {
      return NextResponse.json({ error: "Contact list not found." }, { status: 404 });
    }
  }

  const leads = await prisma.lead.findMany({ where: { id: { in: leadIds } } });
  if (leads.length === 0) {
    return NextResponse.json({ error: "No matching leads found." }, { status: 404 });
  }

  const errors: string[] = [];
  let moved = 0;
  const movedIds: string[] = [];

  for (const lead of leads) {
    const email = lead.email.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      errors.push(
        `${lead.contactName || lead.company || lead.id}: skipped (email required for contacts)`
      );
      continue;
    }

    const { firstName, lastName } = splitName(lead.contactName);
    const notes = buildContactNotes(lead);

    try {
      await prisma.contact.upsert({
        where: { contactListId_email: { contactListId, email } },
        create: {
          contactListId,
          email,
          firstName,
          lastName,
          company: lead.company,
          title: lead.title,
          phone: lead.phone,
          linkedinUrl: lead.linkedinProfileUrl,
          companyUrl: lead.companyWebsite,
          notes,
        },
        update: {
          firstName,
          lastName,
          company: lead.company,
          title: lead.title,
          phone: lead.phone,
          linkedinUrl: lead.linkedinProfileUrl,
          companyUrl: lead.companyWebsite,
          notes,
        },
      });
      moved++;
      movedIds.push(lead.id);
    } catch {
      errors.push(`${email}: could not add to list`);
    }
  }

  if (deleteLeads && movedIds.length > 0) {
    await prisma.lead.deleteMany({ where: { id: { in: movedIds } } });
  } else if (movedIds.length > 0) {
    await prisma.lead.updateMany({
      where: { id: { in: movedIds } },
      data: { status: "contacted" },
    });
  }

  const list = await prisma.contactList.findUnique({
    where: { id: contactListId },
    include: { _count: { select: { contacts: true } } },
  });

  return NextResponse.json({
    moved,
    skipped: errors.length,
    errors,
    deletedLeads: deleteLeads,
    contactListId,
    contactListName: list?.name ?? "",
    contactCount: list?._count.contacts ?? 0,
  });
}
