export interface CampaignEmailLog {
  id: string;
  type: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  bounceReason: string | null;
  bounceType: string | null;
  repliedAt: string | null;
  error?: string | null;
  contact: {
    email: string;
    firstName: string;
    lastName: string;
    company: string;
  };
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  subject?: string;
  emailLogs: CampaignEmailLog[];
}

export function campaignMetrics(logs: CampaignEmailLog[]) {
  return {
    total: logs.length,
    sent: logs.filter((l) => l.status !== "pending").length,
    opened: logs.filter((l) =>
      ["opened", "clicked", "replied"].includes(l.status)
    ).length,
    replied: logs.filter((l) => l.status === "replied").length,
    bounced: logs.filter((l) => l.status === "bounced").length,
    failed: logs.filter((l) => l.status === "failed").length,
  };
}
