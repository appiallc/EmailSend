/**
 * Queue + send the latest QA campaign via Prisma + cron outbound.
 * Usage: node scripts/qa-day-send.mjs
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

const prisma = new PrismaClient();

function loadCronSecret() {
  const envPath = resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("CRON_SECRET="));
  if (!line) throw new Error("CRON_SECRET missing in .env");
  return line.slice("CRON_SECRET=".length).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const campaign = await prisma.campaign.findFirst({
    where: { name: { startsWith: "QA Deliverability" } },
    orderBy: { createdAt: "desc" },
    include: {
      contactLists: true,
    },
  });
  if (!campaign) throw new Error("No QA campaign found — run qa-day-setup.mjs first");

  const listIds = campaign.contactLists.map((c) => c.contactListId);
  const contacts = await prisma.contact.findMany({
    where: { contactListId: { in: listIds } },
  });

  const suppressed = await prisma.suppressedEmail.findMany({
    select: { email: true },
  });
  const suppressedSet = new Set(
    suppressed.map((s) => s.email.trim().toLowerCase())
  );

  const existing = await prisma.emailLog.findMany({
    where: { campaignId: campaign.id, type: "initial" },
    select: { contactId: true },
  });
  const existingIds = new Set(existing.map((e) => e.contactId));

  const toCreate = contacts.filter(
    (c) =>
      !existingIds.has(c.id) &&
      !suppressedSet.has(c.email.trim().toLowerCase())
  );

  if (toCreate.length > 0) {
    await prisma.emailLog.createMany({
      data: toCreate.map((c) => ({
        campaignId: campaign.id,
        contactId: c.id,
        type: "initial",
        followUpStep: 0,
        status: "pending",
      })),
    });
  }

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "sending", scheduledAt: null },
  });

  const pending = await prisma.emailLog.count({
    where: { campaignId: campaign.id, type: "initial", status: "pending" },
  });
  console.log(
    `Campaign ${campaign.name}: ${toCreate.length} new logs, ${pending} pending`
  );

  const secret = loadCronSecret();
  const base = "http://localhost:3000";

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${base}/api/cron/outbound`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.json();
    console.log(`Outbound run ${i + 1}:`, body);
    if (!res.ok) break;
    if ((body.sent ?? 0) === 0 && (body.followUpsCreated ?? 0) === 0) {
      const still = await prisma.emailLog.count({
        where: { campaignId: campaign.id, status: "pending" },
      });
      if (still === 0) break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  const logs = await prisma.emailLog.findMany({
    where: { campaignId: campaign.id },
    include: { contact: true },
    orderBy: { id: "asc" },
  });
  console.log("\nEmail log status:");
  for (const log of logs) {
    console.log(
      `  ${log.type} step=${log.followUpStep} ${log.status} → ${log.contact.email}${
        log.error ? ` (${log.error})` : ""
      }${log.followUpDue ? ` due=${log.followUpDue.toISOString()}` : ""}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
