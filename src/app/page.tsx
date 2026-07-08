"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/StatCard";
import { Loader } from "@/components/Loader";
import Link from "next/link";

interface Stats {
  contacts: number;
  campaigns: number;
  statusCounts: Record<string, number>;
  smtpConfigured: boolean;
  recentCampaigns: Array<{
    id: string;
    name: string;
    status: string;
    total: number;
    sent: number;
    opened: number;
    replied: number;
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then(setStats);
  }, []);

  if (!stats) {
    return <Loader fullPage />;
  }

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
        <StatCard label="Contacts" value={stats.contacts} accent="blue" />
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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Recent Campaigns</h2>
          <Link
            href="/campaigns"
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            View all →
          </Link>
        </div>
        {stats.recentCampaigns.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No campaigns yet.{" "}
            <Link href="/campaigns" className="text-blue-600 underline">
              Create your first campaign
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-6 py-3 font-medium">Campaign</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Sent</th>
                <th className="px-6 py-3 font-medium">Opened</th>
                <th className="px-6 py-3 font-medium">Replied</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentCampaigns.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium">{c.name}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === "sent"
                          ? "bg-green-100 text-green-700"
                          : c.status === "sending"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-6 py-3">{c.sent}/{c.total}</td>
                  <td className="px-6 py-3">{c.opened}</td>
                  <td className="px-6 py-3">{c.replied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-2">1. Import contacts</h3>
          <p className="text-slate-500">
            Upload a CSV with email, first_name, last_name, company, and more.
          </p>
          <Link href="/contacts" className="text-blue-600 mt-2 inline-block hover:underline">
            Import CSV →
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
