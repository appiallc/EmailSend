import { prisma } from "./db";
import type { Contact } from "@prisma/client";

export async function resolveContactsForSend(options: {
  contactListIds?: string[];
  sendToAll?: boolean;
  dedupeByEmail?: boolean;
}): Promise<Contact[]> {
  const { contactListIds, sendToAll, dedupeByEmail } = options;

  let contacts: Contact[];

  if (sendToAll) {
    contacts = await prisma.contact.findMany({
      orderBy: [{ contactListId: "asc" }, { createdAt: "asc" }],
    });
    return contacts;
  }

  if (!contactListIds?.length) {
    return [];
  }

  contacts = await prisma.contact.findMany({
    where: { contactListId: { in: contactListIds } },
    orderBy: [{ contactListId: "asc" }, { createdAt: "asc" }],
  });

  if (!dedupeByEmail) {
    return contacts;
  }

  const seen = new Set<string>();
  return contacts.filter((c) => {
    const email = c.email.toLowerCase();
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

export async function importContactsToList(
  contactListId: string,
  csv: string,
  replace: boolean
) {
  const { parseContactsCsv } = await import("./csv");
  const { contacts, errors } = parseContactsCsv(csv);

  if (replace) {
    await prisma.contact.deleteMany({ where: { contactListId } });
  }

  let imported = 0;
  const seenInCsv = new Set<string>();

  for (const c of contacts) {
    const email = c.email.toLowerCase();
    if (seenInCsv.has(email)) continue;
    seenInCsv.add(email);

    if (replace) {
      await prisma.contact.create({
        data: {
          contactListId,
          email,
          firstName: c.firstName,
          lastName: c.lastName,
          company: c.company,
          title: c.title,
          phone: c.phone,
          notes: c.notes,
        },
      });
    } else {
      await prisma.contact.upsert({
        where: { contactListId_email: { contactListId, email } },
        create: {
          contactListId,
          email,
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
    }
    imported++;
  }

  return { imported, errors, total: contacts.length };
}

export async function syncCampaignContactLists(
  campaignId: string,
  contactListIds: string[]
) {
  await prisma.campaignContactList.deleteMany({ where: { campaignId } });
  if (contactListIds.length > 0) {
    await prisma.campaignContactList.createMany({
      data: contactListIds.map((contactListId) => ({ campaignId, contactListId })),
      skipDuplicates: true,
    });
  }
}
