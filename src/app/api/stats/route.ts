import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [contactLists, campaigns, logs, settings] = await Promise.all([
    prisma.contactList.count(),
    prisma.campaign.count(),
    prisma.emailLog.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.settings.findUnique({ where: { id: "default" } }),
  ]);

  const statusCounts = Object.fromEntries(
    logs.map((l) => [l.status, l._count])
  );

  const recentCampaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      _count: { select: { emailLogs: true } },
      emailLogs: {
        select: { status: true },
      },
    },
  });

  const smtpConfigured = !!(settings?.smtpHost && settings?.smtpUser);

  return NextResponse.json({
    contactLists,
    contacts: await prisma.contact.count(),
    campaigns,
    statusCounts,
    smtpConfigured,
    recentCampaigns: recentCampaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      createdAt: c.createdAt,
      total: c._count.emailLogs,
      sent: c.emailLogs.filter((l) => l.status !== "pending").length,
      opened: c.emailLogs.filter((l) =>
        ["opened", "clicked", "replied"].includes(l.status)
      ).length,
      replied: c.emailLogs.filter((l) => l.status === "replied").length,
    })),
  });
}
