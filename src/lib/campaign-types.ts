export interface CampaignEmailLog {
  id: string;
  type: string;
  followUpStep?: number;
  status: string;
  subjectVariant?: string | null;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
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
  subjectB?: string;
  abTesting?: boolean;
  emailLogs: CampaignEmailLog[];
}

export function campaignMetrics(logs: CampaignEmailLog[]) {
  const delivered = logs.filter((l) =>
    ["sent", "opened", "clicked", "replied"].includes(l.status)
  ).length;
  const opened = logs.filter((l) =>
    ["opened", "clicked", "replied"].includes(l.status)
  ).length;
  const clicked = logs.filter((l) =>
    ["clicked", "replied"].includes(l.status)
  ).length;
  const replied = logs.filter((l) => l.status === "replied").length;
  const bounced = logs.filter((l) => l.status === "bounced").length;
  const failed = logs.filter((l) => l.status === "failed").length;
  const sent = logs.filter((l) => l.status !== "pending").length;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  const byVariant = (variant: "A" | "B") => {
    const subset = logs.filter((l) => l.subjectVariant === variant);
    const vDelivered = subset.filter((l) =>
      ["sent", "opened", "clicked", "replied"].includes(l.status)
    ).length;
    const vOpened = subset.filter((l) =>
      ["opened", "clicked", "replied"].includes(l.status)
    ).length;
    const vReplied = subset.filter((l) => l.status === "replied").length;
    const vSent = subset.filter((l) => l.status !== "pending").length;
    return {
      sent: vSent,
      openRate: pct(vOpened, vDelivered || vSent),
      replyRate: pct(vReplied, vDelivered || vSent),
    };
  };

  return {
    total: logs.length,
    sent,
    delivered,
    opened,
    clicked,
    replied,
    bounced,
    failed,
    openRate: pct(opened, delivered || sent),
    clickRate: pct(clicked, delivered || sent),
    replyRate: pct(replied, delivered || sent),
    bounceRate: pct(bounced, sent),
    variantA: byVariant("A"),
    variantB: byVariant("B"),
  };
}
