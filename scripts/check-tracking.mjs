import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const settings = await prisma.settings.findUnique({ where: { id: "default" } });
console.log("baseUrl:", settings?.baseUrl);

const logs = await prisma.emailLog.findMany({
  take: 5,
  orderBy: { sentAt: "desc" },
  select: { trackingId: true, status: true, openedAt: true, sentAt: true },
});
console.log("recent logs:", JSON.stringify(logs, null, 2));

await prisma.$disconnect();
