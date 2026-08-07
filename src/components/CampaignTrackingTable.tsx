"use client";

import { useDeferredValue, useState } from "react";
import type { CampaignEmailLog } from "@/lib/campaign-types";
import { EmailStatusBadge } from "@/components/EmailStatusBadge";

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "sending", label: "Sending" },
  { value: "sent", label: "Sent" },
  { value: "opened", label: "Opened" },
  { value: "clicked", label: "Clicked" },
  { value: "replied", label: "Replied" },
  { value: "bounced", label: "Bounced" },
  { value: "failed", label: "Failed" },
] as const;

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "initial", label: "Initial" },
  { value: "followup", label: "Follow-ups" },
] as const;

export function CampaignTrackingTable({
  logs,
  onMarkReplied,
  emptyMessage = "No emails sent for this campaign yet.",
  embedded = false,
}: {
  logs: CampaignEmailLog[];
  onMarkReplied?: (logId: string) => void;
  emptyMessage?: string;
  /** Full-width layout inside dashboard expand — no inner horizontal scroll */
  embedded?: boolean;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(embedded ? 10 : 5);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const sentLogs = logs.filter(
    (l) => l.status !== "pending" && l.status !== "sending"
  );

  const filteredLogs = sentLogs.filter((log) => {
    if (statusFilter !== "all" && log.status !== statusFilter) return false;
    if (typeFilter === "initial" && log.type !== "initial") return false;
    if (typeFilter === "followup" && log.type !== "followup") return false;
    if (deferredSearch) {
      const name = [log.contact.firstName, log.contact.lastName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const hay = `${name} ${log.contact.email} ${log.contact.company || ""}`.toLowerCase();
      if (!hay.includes(deferredSearch)) return false;
    }
    return true;
  });

  const hasFilters =
    search.trim() !== "" || statusFilter !== "all" || typeFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setCurrentPage(1);
  };

  if (sentLogs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const activePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredLogs.length);
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

  const toolbar = (
    <div
      className={`flex flex-col sm:flex-row gap-2 sm:items-center border-b border-slate-100 bg-white ${
        embedded ? "px-3 py-2.5" : "px-4 py-3"
      }`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex-1 min-w-0">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search contact, email, company…"
          className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
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
        value={typeFilter}
        onChange={(e) => {
          setTypeFilter(e.target.value);
          setCurrentPage(1);
        }}
        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
      >
        {TYPE_FILTERS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <select
        value={statusFilter}
        onChange={(e) => {
          setStatusFilter(e.target.value);
          setCurrentPage(1);
        }}
        className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
      >
        {STATUS_FILTERS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-xs text-slate-500 hover:text-slate-800 px-1 py-1.5"
        >
          Clear
        </button>
      )}
    </div>
  );

  const table = (
    <table className={`w-full text-sm ${embedded ? "table-fixed" : ""}`}>
      <thead>
        <tr className="text-left text-slate-500 border-b bg-slate-50/80">
          <th className={`py-3 font-medium ${embedded ? "pl-4 pr-3" : "px-4"}`}>
            Contact
          </th>
          <th className={`py-3 font-medium w-32 ${embedded ? "" : "px-4"}`}>
            Type
          </th>
          <th className={`py-3 font-medium w-28 ${embedded ? "" : "px-4"}`}>
            Status
          </th>
          <th className={`py-3 font-medium w-44 ${embedded ? "" : "px-4"}`}>
            Sent
          </th>
          <th className={`py-3 font-medium w-44 ${embedded ? "" : "px-4"}`}>
            Opened
          </th>
          {onMarkReplied && (
            <th className={`py-3 font-medium w-32 ${embedded ? "" : "px-4"}`}>
              Actions
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {paginatedLogs.length === 0 ? (
          <tr>
            <td
              colSpan={onMarkReplied ? 6 : 5}
              className="px-4 py-8 text-center text-sm text-slate-500"
            >
              No emails match your filters.
              {hasFilters && (
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
          paginatedLogs.map((log) => (
            <tr
              key={log.id}
              className="border-b border-slate-100/80 hover:bg-slate-50/40 transition-colors"
            >
              <td
                className={`py-3.5 align-middle ${embedded ? "pl-4 pr-3" : "px-4"}`}
              >
                <div className="font-medium text-slate-900 break-words">
                  {[log.contact.firstName, log.contact.lastName]
                    .filter(Boolean)
                    .join(" ") || log.contact.email}
                </div>
                <div className="text-xs text-slate-400 break-all">
                  {log.contact.email}
                </div>
                {log.status === "failed" && log.error && (
                  <div
                    className="text-xs text-red-600 mt-0.5 break-words"
                    title={log.error}
                  >
                    {log.error}
                  </div>
                )}
                {log.status === "bounced" && (
                  <div className="text-xs text-amber-700 mt-0.5 break-words">
                    {[log.bounceType, log.bounceReason]
                      .filter(Boolean)
                      .join(" — ") || "Bounced"}
                  </div>
                )}
                {log.subjectVariant && (
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Subject {log.subjectVariant}
                  </div>
                )}
              </td>
              <td
                className={`py-3.5 capitalize align-middle text-slate-600 ${
                  embedded ? "" : "px-4"
                }`}
              >
                {log.type === "followup"
                  ? `Follow-up ${log.followUpStep || 1}`
                  : log.type}
              </td>
              <td className={`py-3.5 align-middle ${embedded ? "" : "px-4"}`}>
                <EmailStatusBadge status={log.status} />
              </td>
              <td
                className={`py-3.5 text-xs align-middle text-slate-500 whitespace-nowrap ${
                  embedded ? "" : "px-4"
                }`}
              >
                {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
              </td>
              <td
                className={`py-3.5 text-xs align-middle text-slate-500 whitespace-nowrap ${
                  embedded ? "" : "px-4"
                }`}
              >
                {log.openedAt ? new Date(log.openedAt).toLocaleString() : "—"}
              </td>
              {onMarkReplied && (
                <td className={`py-3.5 align-middle ${embedded ? "" : "px-4"}`}>
                  {log.status !== "replied" && log.status !== "bounced" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkReplied(log.id);
                      }}
                      className="text-xs text-green-600 hover:text-green-700 font-medium hover:underline border border-green-200 bg-green-50/50 hover:bg-green-50 px-2 h-7.5 rounded-lg transition-colors inline-flex items-center justify-center whitespace-nowrap"
                    >
                      Mark replied
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  const paginationControls = (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 px-4 py-3 bg-white mt-1 select-none text-xs">
      <div className="flex items-center gap-4 text-slate-500 flex-wrap">
        <span>
          Showing{" "}
          <span className="font-medium text-slate-700">
            {filteredLogs.length === 0 ? 0 : startIndex + 1}
          </span>{" "}
          to{" "}
          <span className="font-medium text-slate-700">{endIndex}</span> of{" "}
          <span className="font-medium text-slate-700">
            {filteredLogs.length}
          </span>
          {filteredLogs.length !== sentLogs.length && (
            <span className="text-slate-400">
              {" "}
              (of {sentLogs.length} sent)
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
          <span className="text-slate-400 font-medium">Rows</span>
          {[5, 10, 25].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              className={`px-2 py-1 rounded font-semibold border transition-colors ${
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
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={activePage === 1}
          className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Previous
        </button>
        <span className="text-slate-500 font-medium px-1">
          Page {activePage} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={activePage === totalPages}
          className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div className="border border-slate-100 rounded-lg overflow-hidden bg-white mt-2">
        {toolbar}
        <div className="overflow-x-auto">{table}</div>
        {paginationControls}
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-slate-150 rounded-lg bg-white">
      {toolbar}
      <div className="overflow-x-auto">{table}</div>
      {paginationControls}
    </div>
  );
}
