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

function isPendingLike(status: string) {
  return status === "pending" || status === "sending";
}

function isSentLike(status: string) {
  return !isPendingLike(status);
}

function isDeliveredLike(status: string) {
  return ["sent", "opened", "clicked", "replied"].includes(status);
}

export function campaignMetrics(logs: CampaignEmailLog[]) {
  const delivered = logs.filter((l) => isDeliveredLike(l.status)).length;
  const opened = logs.filter((l) =>
    ["opened", "clicked", "replied"].includes(l.status)
  ).length;
  const clicked = logs.filter((l) =>
    ["clicked", "replied"].includes(l.status)
  ).length;
  const replied = logs.filter((l) => l.status === "replied").length;
  const bounced = logs.filter((l) => l.status === "bounced").length;
  const failed = logs.filter((l) => l.status === "failed").length;
  const sent = logs.filter((l) => isSentLike(l.status)).length;

  const initialLogs = logs.filter((l) => l.type === "initial");
  const followUpLogs = logs.filter((l) => l.type === "followup");
  const initialSent = initialLogs.filter((l) => isSentLike(l.status)).length;
  const followUpsSent = followUpLogs.filter((l) => isSentLike(l.status)).length;
  const followUpsPending = followUpLogs.filter((l) =>
    isPendingLike(l.status)
  ).length;

  const followUpByStep: Record<number, number> = {};
  for (const log of followUpLogs) {
    if (!isSentLike(log.status)) continue;
    const step = log.followUpStep || 1;
    followUpByStep[step] = (followUpByStep[step] || 0) + 1;
  }

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  const byVariant = (variant: "A" | "B") => {
    const subset = logs.filter((l) => l.subjectVariant === variant);
    const vDelivered = subset.filter((l) => isDeliveredLike(l.status)).length;
    const vOpened = subset.filter((l) =>
      ["opened", "clicked", "replied"].includes(l.status)
    ).length;
    const vReplied = subset.filter((l) => l.status === "replied").length;
    const vSent = subset.filter((l) => isSentLike(l.status)).length;
    return {
      sent: vSent,
      openRate: pct(vOpened, vDelivered || vSent),
      replyRate: pct(vReplied, vDelivered || vSent),
    };
  };

  return {
    total: logs.length,
    sent,
    initialSent,
    followUpsSent,
    followUpsPending,
    followUpByStep,
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

/** Compact summary line for campaign tracking headers. */
export function formatCampaignFunnelSummary(
  m: ReturnType<typeof campaignMetrics>
): string {
  const stepParts = Object.entries(m.followUpByStep)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([step, count]) => `FU${step}: ${count}`);
  const fuDetail =
    stepParts.length > 0 ? ` (${stepParts.join(" · ")})` : "";
  return (
    `${m.initialSent} initial · ${m.followUpsSent} follow-up${m.followUpsSent === 1 ? "" : "s"} sent${fuDetail}` +
    (m.followUpsPending > 0 ? ` · ${m.followUpsPending} follow-up queued` : "")
  );
}
