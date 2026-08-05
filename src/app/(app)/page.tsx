"use client";

import useSWR from "swr";
import { StatCard } from "@/components/StatCard";
import { Loader } from "@/components/Loader";
import { API } from "@/lib/swr";
import Link from "next/link";

interface Stats {
  contactLists: number;
  contacts: number;
  campaigns: number;
  statusCounts: Record<string, number>;
  smtpConfigured: boolean;
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useSWR<Stats>(API.stats);

  if (statsLoading && !stats) {
    return <Loader fullPage />;
  }

  if (!stats) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Could not load dashboard.</p>
      </div>
    );
  }

  const totalSent = stats.statusCounts.sent || 0;
  const totalOpened =
    (stats.statusCounts.opened || 0) +
    (stats.statusCounts.clicked || 0) +
    (stats.statusCounts.replied || 0);
  const totalClicked =
    (stats.statusCounts.clicked || 0) + (stats.statusCounts.replied || 0);
  const totalReplied = stats.statusCounts.replied || 0;
  const totalBounced = stats.statusCounts.bounced || 0;
  const deliveredBase = totalSent + totalOpened;
  const openRate =
    deliveredBase > 0 ? Math.round((totalOpened / deliveredBase) * 100) : 0;
  const replyRate =
    deliveredBase > 0 ? Math.round((totalReplied / deliveredBase) * 100) : 0;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard label="Contact Lists" value={stats.contactLists ?? 0} accent="blue" />
        <StatCard label="Campaigns" value={stats.campaigns} accent="purple" />
        <StatCard label="Emails Sent" value={deliveredBase} accent="green" />
        <StatCard
          label="Open rate"
          value={`${openRate}%`}
          sub={`${totalOpened} opens · ${totalClicked} clicks`}
          accent="blue"
        />
        <StatCard
          label="Reply rate"
          value={`${replyRate}%`}
          sub={`${totalReplied} replies · ${totalBounced} bounced`}
          accent="amber"
        />
      </div>

      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
        <div>
          <h2 className="font-semibold text-slate-800">Campaign tracking</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Search, filter, and drill into sends, follow-ups, opens, and replies.
          </p>
        </div>
        <Link
          href="/tracking"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 shrink-0"
        >
          Open tracking →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
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
          <h3 className="font-semibold mb-2">3. Track results</h3>
          <p className="text-slate-500">
            Monitor opens, replies, and follow-ups per campaign.
          </p>
          <Link href="/tracking" className="text-blue-600 mt-2 inline-block hover:underline">
            Open tracking →
          </Link>
        </div>
      </div>
    </div>
  );
}
