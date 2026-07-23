"use client";

import { Fragment, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { StatCard } from "@/components/StatCard";
import { Loader } from "@/components/Loader";
import { CampaignTrackingTable } from "@/components/CampaignTrackingTable";
import { API } from "@/lib/swr";
import { campaignMetrics, type CampaignSummary } from "@/lib/campaign-types";
import Link from "next/link";

interface Stats {
  contactLists: number;
  contacts: number;
  campaigns: number;
  statusCounts: Record<string, number>;
  smtpConfigured: boolean;
}

function campaignStatusClass(status: string) {
  if (status === "sent") return "bg-green-100 text-green-700";
  if (status === "sending") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useSWR<Stats>(API.stats);
  const { data: campaigns, isLoading: campaignsLoading } =
    useSWR<CampaignSummary[]>(API.campaigns);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const markReplied = async (logId: string) => {
    await fetch("/api/email-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, status: "replied" }),
    });
    await Promise.all([globalMutate(API.campaigns), globalMutate(API.stats)]);
  };

  if ((statsLoading && !stats) || (campaignsLoading && !campaigns)) {
    return <Loader fullPage />;
  }

  if (!stats) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Could not load dashboard.</p>
      </div>
    );
  }

  const campaignList = campaigns ?? [];
  const totalSent = stats.statusCounts.sent || 0;
  const totalOpened =
    (stats.statusCounts.opened || 0) +
    (stats.statusCounts.clicked || 0) +
    (stats.statusCounts.replied || 0);
  const totalReplied = stats.statusCounts.replied || 0;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">
          Overview of your email outreach campaigns
        </p>
      </div>

      {!stats.smtpConfigured && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 text-sm">
          SMTP is not configured yet.{" "}
          <Link href="/settings" className="font-semibold underline">
            Go to Settings
          </Link>{" "}
          to connect your email before sending campaigns.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Contact Lists" value={stats.contactLists ?? 0} accent="blue" />
        <StatCard label="Campaigns" value={stats.campaigns} accent="purple" />
        <StatCard
          label="Emails Sent"
          value={totalSent + totalOpened}
          accent="green"
        />
        <StatCard
          label="Replies"
          value={totalReplied}
          sub={
            totalSent + totalOpened > 0
              ? `${Math.round((totalReplied / (totalSent + totalOpened)) * 100)}% reply rate`
              : undefined
          }
          accent="amber"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Campaigns</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click a row to view sent email tracking
            </p>
          </div>
          <Link
            href="/campaigns"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            Manage campaigns →
          </Link>
        </div>

        {campaignList.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No campaigns yet.{" "}
            <Link href="/campaigns" className="text-blue-600 underline">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100 bg-slate-50/80">
                  <th className="px-6 py-3 font-medium w-8" aria-hidden />
                  <th className="px-6 py-3 font-medium">Campaign</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Sent</th>
                  <th className="px-6 py-3 font-medium">Opened</th>
                  <th className="px-6 py-3 font-medium">Replied</th>
                  <th className="px-6 py-3 font-medium">Failed</th>
                </tr>
              </thead>
              <tbody>
                {campaignList.map((c) => {
                  const m = campaignMetrics(c.emailLogs);
                  const expanded = expandedId === c.id;

                  return (
                    <Fragment key={c.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedId(expanded ? null : c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedId(expanded ? null : c.id);
                          }
                        }}
                        className={`border-b border-slate-50 cursor-pointer transition-colors ${
                          expanded ? "bg-blue-50/60" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-400">
                          <span
                            className={`inline-block transition-transform ${expanded ? "rotate-90" : ""}`}
                            aria-hidden
                          >
                            ▶
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          <div className="font-medium text-slate-900">{c.name}</div>
                          {c.subject && (
                            <div className="text-xs text-slate-400 mt-0.5 truncate max-w-md">
                              {c.subject}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${campaignStatusClass(c.status)}`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="px-6 py-3">
                          {m.sent}/{m.total}
                        </td>
                        <td className="px-6 py-3">{m.opened}</td>
                        <td className="px-6 py-3">{m.replied}</td>
                        <td className="px-6 py-3">{m.failed || "—"}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-slate-100 bg-slate-50/40">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <div>
                                  <h3 className="font-medium text-slate-800">
                                    {c.name} — Email tracking
                                  </h3>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    Opens count only 60+ seconds after send (prefetch filter).
                                  </p>
                                </div>
                                <Link
                                  href="/campaigns"
                                  className="text-xs text-blue-600 hover:underline shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  Open in Campaigns
                                </Link>
                              </div>
                              <CampaignTrackingTable
                                logs={c.emailLogs}
                                onMarkReplied={markReplied}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-2">1. Create contact lists</h3>
          <p className="text-slate-500">
            Create named lists and upload a CSV for each group of leads.
          </p>
          <Link href="/contacts" className="text-blue-600 mt-2 inline-block hover:underline">
            Manage lists →
          </Link>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-2">2. Create & send campaign</h3>
          <p className="text-slate-500">
            Write your outreach email with personalization tags like {"{{first_name}}"}.
          </p>
          <Link href="/campaigns" className="text-blue-600 mt-2 inline-block hover:underline">
            New campaign →
          </Link>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-2">3. Auto follow-up in 1 week</h3>
          <p className="text-slate-500">
            Contacts who don&apos;t reply get an automatic follow-up after 7 days.
          </p>
        </div>
      </div>
    </div>
  );
}
