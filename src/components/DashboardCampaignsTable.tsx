"use client";

import { Fragment, useDeferredValue, useState } from "react";
import Link from "next/link";
import { CampaignTrackingTable } from "@/components/CampaignTrackingTable";
import { CampaignMetricsBar } from "@/components/CampaignMetricsBar";
import { campaignMetrics, type CampaignSummary } from "@/lib/campaign-types";

type SortKey =
  | "name"
  | "status"
  | "initial"
  | "followUps"
  | "openRate"
  | "replyRate"
  | "bounced"
  | "failed";

type SortDir = "asc" | "desc";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sending", label: "Sending" },
  { value: "sent", label: "Sent" },
  { value: "paused", label: "Paused" },
] as const;

function campaignStatusClass(status: string) {
  if (status === "sent") return "bg-green-100 text-green-700";
  if (status === "sending") return "bg-blue-100 text-blue-700";
  if (status === "scheduled") return "bg-amber-100 text-amber-800";
  if (status === "paused") return "bg-orange-100 text-orange-800";
  return "bg-slate-100 text-slate-600";
}

function initialRecipientCount(logs: CampaignSummary["emailLogs"]) {
  return logs.filter((l) => l.type === "initial").length;
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={`px-4 py-3 font-medium ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`inline-flex items-center gap-1 hover:text-slate-800 transition-colors ${
          active ? "text-slate-800" : "text-slate-500"
        }`}
      >
        {label}
        <span className="text-[10px] text-slate-400 w-3" aria-hidden>
          {active ? (sortDir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </th>
  );
}

export function DashboardCampaignsTable({
  campaigns,
  onMarkReplied,
}: {
  campaigns: CampaignSummary[];
  onMarkReplied: (logId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [activityFilter, setActivityFilter] = useState<"all" | "sent" | "none">(
    "all"
  );
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "status" ? "asc" : "desc");
    }
    setPage(1);
  };

  const enriched = campaigns.map((c) => {
    const m = campaignMetrics(c.emailLogs);
    return { campaign: c, metrics: m };
  });

  const filtered = enriched.filter(({ campaign: c, metrics: m }) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (activityFilter === "sent" && m.sent === 0) return false;
    if (activityFilter === "none" && m.sent > 0) return false;
    if (deferredSearch) {
      const hay = `${c.name} ${c.subject || ""}`.toLowerCase();
      if (!hay.includes(deferredSearch)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = (() => {
      switch (sortKey) {
        case "name":
          return a.campaign.name.toLowerCase();
        case "status":
          return a.campaign.status;
        case "initial":
          return a.metrics.initialSent;
        case "followUps":
          return a.metrics.followUpsSent;
        case "openRate":
          return a.metrics.openRate;
        case "replyRate":
          return a.metrics.replyRate;
        case "bounced":
          return a.metrics.bounced;
        case "failed":
          return a.metrics.failed;
      }
    })();
    const bv = (() => {
      switch (sortKey) {
        case "name":
          return b.campaign.name.toLowerCase();
        case "status":
          return b.campaign.status;
        case "initial":
          return b.metrics.initialSent;
        case "followUps":
          return b.metrics.followUpsSent;
        case "openRate":
          return b.metrics.openRate;
        case "replyRate":
          return b.metrics.replyRate;
        case "bounced":
          return b.metrics.bounced;
        case "failed":
          return b.metrics.failed;
      }
    })();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return a.campaign.name.localeCompare(b.campaign.name);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, totalPages);
  const start = (activePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setActivityFilter("all");
    setPage(1);
  };

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "all" || activityFilter !== "all";

  if (campaigns.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-500 text-sm">
        No campaigns yet.{" "}
        <Link href="/campaigns" className="text-blue-600 underline">
          Create your first campaign
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-800">All campaigns</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Search, filter, and expand a row for email-level tracking
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <div className="relative flex-1 min-w-0">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by campaign name or subject…"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
              />
            </svg>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[10rem]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={activityFilter}
            onChange={(e) => {
              setActivityFilter(e.target.value as "all" | "sent" | "none");
              setPage(1);
            }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[10rem]"
          >
            <option value="all">All activity</option>
            <option value="sent">Has sends</option>
            <option value="none">No sends yet</option>
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-slate-500 hover:text-slate-800 px-2 py-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[860px]">
          <thead>
            <tr className="text-left border-b border-slate-100 bg-slate-50/80">
              <th className="px-3 py-3 w-8" aria-hidden />
              <SortHeader
                label="Campaign"
                column="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Status"
                column="status"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Initial"
                column="initial"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Follow-ups"
                column="followUps"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Open %"
                column="openRate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Reply %"
                column="replyRate"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Bounced"
                column="bounced"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
              <SortHeader
                label="Failed"
                column="failed"
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={onSort}
              />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-slate-500">
                  No campaigns match your filters.
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="ml-2 text-blue-600 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              pageRows.map(({ campaign: c, metrics: m }) => {
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
                      className={`border-b border-slate-100 cursor-pointer transition-colors ${
                        expanded
                          ? "bg-blue-50/40 border-b-0"
                          : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-3 text-slate-400">
                        <span
                          className={`inline-block transition-transform text-xs ${
                            expanded ? "rotate-90" : ""
                          }`}
                          aria-hidden
                        >
                          ▶
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{c.name}</div>
                        {c.subject && (
                          <div className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">
                            {c.subject}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${campaignStatusClass(
                            c.status
                          )}`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {m.initialSent}
                        <span className="text-xs text-slate-400 ml-1">
                          / {initialRecipientCount(c.emailLogs)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {m.followUpsSent || "—"}
                        {m.followUpsPending > 0 && (
                          <div className="text-[10px] text-amber-700 mt-0.5">
                            {m.followUpsPending} queued
                          </div>
                        )}
                        {Object.keys(m.followUpByStep).length > 1 && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {Object.entries(m.followUpByStep)
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([s, n]) => `S${s}:${n}`)
                              .join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {m.openRate}%
                        <span className="text-xs text-slate-400 ml-1">
                          ({m.opened})
                        </span>
                        {c.abTesting &&
                          m.variantA.sent + m.variantB.sent > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              A {m.variantA.openRate}% · B {m.variantB.openRate}%
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {m.replyRate}%
                        <span className="text-xs text-slate-400 ml-1">
                          ({m.replied})
                        </span>
                        {c.abTesting &&
                          m.variantA.sent + m.variantB.sent > 0 && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              A {m.variantA.replyRate}% · B{" "}
                              {m.variantB.replyRate}%
                            </div>
                          )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {m.bounced || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {m.failed || "—"}
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="border-b border-slate-200">
                        <td colSpan={9} className="p-0 bg-slate-50/60">
                          <div className="pl-10 pr-5 py-5 border-t border-slate-200/80 border-l-[3px] border-l-blue-600">
                            <div className="mb-3 flex items-start justify-between gap-4">
                              <div>
                                <h3 className="font-semibold text-slate-800 text-sm">
                                  {c.name} — Email tracking
                                </h3>
                                <div className="mt-1.5">
                                  <CampaignMetricsBar
                                    logs={c.emailLogs}
                                    abTesting={!!c.abTesting}
                                  />
                                </div>
                              </div>
                              <Link
                                href="/campaigns"
                                className="text-xs text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-100 hover:border-blue-200 px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Manage →
                              </Link>
                            </div>
                            <CampaignTrackingTable
                              embedded
                              logs={c.emailLogs}
                              onMarkReplied={onMarkReplied}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500 bg-slate-50/40">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            Showing{" "}
            <span className="font-medium text-slate-700">
              {filtered.length === 0 ? 0 : start + 1}
            </span>
            –
            <span className="font-medium text-slate-700">
              {Math.min(start + pageSize, filtered.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-slate-700">{filtered.length}</span>
            {filtered.length !== campaigns.length && (
              <span className="text-slate-400">
                {" "}
                (filtered from {campaigns.length})
              </span>
            )}
          </span>
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="text-slate-400">Rows</span>
            {[10, 25, 50].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setPageSize(size);
                  setPage(1);
                }}
                className={`px-2 py-1 rounded border font-semibold transition-colors ${
                  pageSize === size
                    ? "bg-blue-50 text-blue-600 border-blue-200"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={activePage <= 1}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="font-medium px-1">
            Page {activePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={activePage >= totalPages}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
