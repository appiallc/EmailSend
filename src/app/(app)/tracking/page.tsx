"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { Loader } from "@/components/Loader";
import { DashboardCampaignsTable } from "@/components/DashboardCampaignsTable";
import { API } from "@/lib/swr";
import type { CampaignSummary } from "@/lib/campaign-types";
import Link from "next/link";

export default function TrackingPage() {
  const { data: campaigns, isLoading } = useSWR<CampaignSummary[]>(API.campaigns);

  const markReplied = async (logId: string) => {
    await fetch("/api/email-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, status: "replied" }),
    });
    await Promise.all([globalMutate(API.campaigns), globalMutate(API.stats)]);
  };

  if (isLoading && !campaigns) {
    return <Loader fullPage />;
  }

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tracking</h1>
          <p className="text-slate-500 mt-1">
            Campaign performance, follow-ups, opens, and replies
          </p>
        </div>
        <Link
          href="/campaigns"
          className="text-sm text-blue-600 hover:underline font-medium shrink-0"
        >
          Manage campaigns →
        </Link>
      </div>

      <DashboardCampaignsTable
        campaigns={campaigns ?? []}
        onMarkReplied={markReplied}
      />
    </div>
  );
}
