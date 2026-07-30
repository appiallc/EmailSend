/**
 * One-day QA setup: list, dummy contacts, campaign, settings, optional send.
 * Usage: node --experimental-strip-types scripts/qa-day-setup.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TARGET = "jaykakadiya1707@gmail.com";

function plus(tag) {
  const [local, domain] = TARGET.split("@");
  return `${local}+${tag}@${domain}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** HH:mm in Asia/Kolkata for `date` */
function kolkataTime(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "10";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** Add minutes in wall-clock Asia/Kolkata (approx via Date) */
function plusMinutes(date, mins) {
  return new Date(date.getTime() + mins * 60_000);
}

async function main() {
  const now = new Date();
  const fu1Time = kolkataTime(plusMinutes(now, 8));
  const fu2Time = kolkataTime(plusMinutes(now, 20));

  console.log("Configuring Settings for same-day QA…");
  await prisma.settings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  await prisma.settings.update({
    where: { id: "default" },
    data: {
      timezone: "Asia/Kolkata",
      businessDaysOnly: true,
      sendWindowStart: "00:00",
      sendWindowEnd: "23:59",
      dailySendLimit: 50,
      bouncePausePercent: 5,
      sendDelayMs: 500,
    },
  });

  console.log("Creating contact list + dummy contacts…");
  const listName = `QA Day ${now.toLocaleDateString("en-IN")}`;
  let list = await prisma.contactList.findFirst({ where: { name: listName } });
  if (!list) {
    list = await prisma.contactList.create({ data: { name: listName } });
  }

  const dummies = [
    {
      email: TARGET,
      firstName: "Jay",
      lastName: "Kakadiya",
      company: "Appia QA",
      title: "Founder",
    },
    {
      email: plus("qa1"),
      firstName: "Aisha",
      lastName: "Patel",
      company: "Sunrise Labs",
      title: "Marketing Lead",
    },
    {
      email: plus("qa2"),
      firstName: "Rohan",
      lastName: "Mehta",
      company: "Nimbus Soft",
      title: "CEO",
    },
    {
      email: plus("qa3"),
      firstName: "Priya",
      lastName: "Shah",
      company: "Orbit Retail",
      title: "Ops Manager",
    },
  ];

  for (const d of dummies) {
    await prisma.contact.upsert({
      where: {
        contactListId_email: { contactListId: list.id, email: d.email },
      },
      create: { contactListId: list.id, ...d },
      update: {
        firstName: d.firstName,
        lastName: d.lastName,
        company: d.company,
        title: d.title,
      },
    });
  }

  const campaignName = `QA Deliverability ${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

  console.log("Creating campaign with 0-day follow-ups…");
  console.log(`  FU1 at ${fu1Time} IST (≈8 min), FU2 at ${fu2Time} IST (≈20 min)`);

  const campaign = await prisma.campaign.create({
    data: {
      name: campaignName,
      subject: "QA test — quick hello {{first_name}}",
      bodyHtml: `<p>Hi {{first_name}},</p>
<p>This is a <strong>same-day QA</strong> send from the CRM to verify deliverability and follow-ups.</p>
<p>Company on file: <strong>{{company}}</strong> · Title: {{title}}</p>
<p>No action needed — you can reply to stop follow-ups, or ignore to receive FU1/FU2 today.</p>`,
      followUpDays: 0,
      followUpTimeOfDay: fu1Time,
      followUpSubject: "QA follow-up 1 — {{company}}",
      followUpBodyHtml: `<p>Hi {{first_name}},</p>
<p>This is <strong>follow-up 1</strong> (0 days at ${fu1Time} IST) for the QA campaign.</p>
<p>Reply to this thread if you want to stop further follow-ups.</p>`,
      extraFollowUps: [
        {
          days: 0,
          timeOfDay: fu2Time,
          subject: "QA follow-up 2 — last ping for {{first_name}}",
          bodyHtml: `<p>Hi {{first_name}},</p>
<p>This is <strong>follow-up 2</strong> (0 days at ${fu2Time} IST). End of today's QA sequence.</p>`,
        },
      ],
      status: "draft",
      contactLists: {
        create: [{ contactListId: list.id }],
      },
    },
  });

  console.log("\nReady:");
  console.log(`  List:     ${list.name} (${list.id})`);
  console.log(`  Campaign: ${campaign.name} (${campaign.id})`);
  console.log(`  Contacts: ${dummies.map((d) => `${d.firstName} <${d.email}>`).join(", ")}`);
  console.log(`  Window:   00:00–23:59 IST (wide open for QA)`);
  console.log(`  FU times: ${fu1Time}, ${fu2Time} IST`);
  console.log("\nNext: open Campaigns in the app → Send to All on this campaign,");
  console.log("or re-run with SEND=1 to queue+send from this script.");

  if (process.env.SEND === "1") {
    const { createCampaignWithContacts, processOutboundQueue, processDueFollowUps } =
      await import("../src/lib/campaign.ts");
    const contacts = await prisma.contact.findMany({
      where: { contactListId: list.id },
    });
    const prepared = await createCampaignWithContacts(campaign.id, contacts);
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "sending", scheduledAt: null },
    });
    console.log(`\nQueued ${prepared.created} (suppressed ${prepared.suppressed})…`);
    const out = await processOutboundQueue();
    console.log("Outbound:", out);
    const fu = await processDueFollowUps();
    console.log("Follow-ups created now:", fu);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
