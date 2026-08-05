import {
  campaignMetrics,
  formatCampaignFunnelSummary,
  type CampaignEmailLog,
} from "@/lib/campaign-types";

export function CampaignMetricsBar({
  logs,
  abTesting = false,
}: {
  logs: CampaignEmailLog[];
  abTesting?: boolean;
}) {
  const m = campaignMetrics(logs);
  if (m.sent === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      <span>
        <span className="font-medium text-slate-800">{m.initialSent}</span> initial
      </span>
      <span className="text-slate-300">·</span>
      <span>
        <span className="font-medium text-slate-800">{m.followUpsSent}</span> follow-ups
        {Object.keys(m.followUpByStep).length > 0 && (
          <span className="text-slate-400">
            {" "}
            (
            {Object.entries(m.followUpByStep)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([step, count]) => `step ${step}: ${count}`)
              .join(", ")}
            )
          </span>
        )}
      </span>
      <span className="text-slate-300">·</span>
      <span>
        <span className="font-medium text-slate-800">{m.openRate}%</span> open
      </span>
      <span className="text-slate-300">·</span>
      <span>
        <span className="font-medium text-slate-800">{m.replyRate}%</span> reply
      </span>
      {m.bounced > 0 && (
        <>
          <span className="text-slate-300">·</span>
          <span>
            <span className="font-medium text-slate-800">{m.bounced}</span> bounced
          </span>
        </>
      )}
      {m.followUpsPending > 0 && (
        <>
          <span className="text-slate-300">·</span>
          <span className="text-amber-700">
            {m.followUpsPending} follow-up queued
          </span>
        </>
      )}
      {abTesting && m.variantA.sent + m.variantB.sent > 0 && (
        <>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500">
            A {m.variantA.openRate}%/{m.variantA.replyRate}% · B{" "}
            {m.variantB.openRate}%/{m.variantB.replyRate}%
          </span>
        </>
      )}
      <span className="sr-only">{formatCampaignFunnelSummary(m)}</span>
    </div>
  );
}
