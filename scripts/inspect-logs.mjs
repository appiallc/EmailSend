import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.emailLog.findMany({
    include: {
      contact: true,
      campaign: true,
    },
    orderBy: {
      sentAt: "asc",
    },
  });

  console.log("=== EMAIL LOGS ===");
  for (const log of logs) {
    console.log({
      id: log.id,
      contact: log.contact.email,
      campaign: log.campaign.name,
      type: log.type,
      followUpStep: log.followUpStep,
      status: log.status,
      followUpDue: log.followUpDue,
      sentAt: log.sentAt,
      messageId: log.messageId,
    });
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
