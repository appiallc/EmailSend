import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

const c = await p.campaign.findFirst({
  where: { name: { startsWith: "QA Deliverability" } },
  orderBy: { createdAt: "desc" },
});
if (!c) throw new Error("no campaign");

const u = await p.emailLog.updateMany({
  where: { campaignId: c.id, status: "failed" },
  data: { status: "pending", error: null },
});
await p.campaign.update({
  where: { id: c.id },
  data: { status: "draft" },
});

console.log(
  JSON.stringify(
    {
      campaignId: c.id,
      name: c.name,
      resetToPending: u.count,
      followUpDays: c.followUpDays,
      followUpTimeOfDay: c.followUpTimeOfDay,
    },
    null,
    2
  )
);

const contacts = await p.contact.findMany({
  where: { contactList: { name: { startsWith: "QA Day" } } },
  select: { firstName: true, lastName: true, email: true, company: true },
});
console.log("contacts", contacts);
await p.$disconnect();
