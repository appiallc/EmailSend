import { useState } from "react";
import type { CampaignEmailLog } from "@/lib/campaign-types";
import { EmailStatusBadge } from "@/components/EmailStatusBadge";

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
  const [pageSize, setPageSize] = useState(5);

  const sentLogs = logs.filter((l) => l.status !== "pending");

  if (sentLogs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
    );
  }

  const totalPages = Math.ceil(sentLogs.length / pageSize);
  const activePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
  const startIndex = (activePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, sentLogs.length);
  const paginatedLogs = sentLogs.slice(startIndex, startIndex + pageSize);

  const table = (
    <table
      className={`w-full text-sm ${embedded ? "table-fixed" : ""}`}
    >
      <thead>
        <tr className="text-left text-slate-500 border-b bg-slate-50/80">
          <th className={`py-3 font-medium ${embedded ? "pl-0 pr-3" : "px-4"}`}>Contact</th>
          <th className={`py-3 font-medium w-16 ${embedded ? "" : "px-4"}`}>Type</th>
          <th className={`py-3 font-medium w-24 ${embedded ? "" : "px-4"}`}>Status</th>
          <th className={`py-3 font-medium w-36 ${embedded ? "" : "px-4"}`}>Sent</th>
          <th className={`py-3 font-medium w-36 ${embedded ? "" : "px-4"}`}>Opened</th>
          <th className={`py-3 font-medium w-36 ${embedded ? "" : "px-4"}`}>Clicked</th>
          <th className={`py-3 font-medium w-36 ${embedded ? "" : "px-4"}`}>Bounced</th>
          {onMarkReplied && (
            <th className={`py-3 font-medium w-24 ${embedded ? "" : "px-4"}`}>Actions</th>
          )}
        </tr>
      </thead>
      <tbody>
        {paginatedLogs.map((log) => (
          <tr key={log.id} className="border-b border-slate-100/80">
            <td className={`py-3 align-top ${embedded ? "pl-0 pr-3" : "px-4"}`}>
              <div className="font-medium break-words">
                {[log.contact.firstName, log.contact.lastName]
                  .filter(Boolean)
                  .join(" ") || log.contact.email}
              </div>
              <div className="text-xs text-slate-400 break-all">{log.contact.email}</div>
              {log.status === "failed" && log.error && (
                <div className="text-xs text-red-600 mt-0.5 break-words" title={log.error}>
                  {log.error}
                </div>
              )}
            </td>
              <td className={`py-3 capitalize align-top ${embedded ? "" : "px-4"}`}>
                {log.type === "followup"
                  ? `Follow-up ${log.followUpStep || 1}`
                  : log.type}
              </td>
            <td className={`py-3 align-top ${embedded ? "" : "px-4"}`}>
              <EmailStatusBadge status={log.status} />
            </td>
            <td className={`py-3 text-xs align-top whitespace-normal ${embedded ? "" : "px-4"}`}>
              {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
            </td>
            <td className={`py-3 text-xs align-top whitespace-normal ${embedded ? "" : "px-4"}`}>
              {log.openedAt ? new Date(log.openedAt).toLocaleString() : "—"}
            </td>
            <td className={`py-3 text-xs align-top whitespace-normal ${embedded ? "" : "px-4"}`}>
              {log.clickedAt ? new Date(log.clickedAt).toLocaleString() : "—"}
            </td>
            <td className={`py-3 text-xs align-top whitespace-normal ${embedded ? "" : "px-4"}`}>
              {log.bouncedAt ? (
                <div>
                  <div>{new Date(log.bouncedAt).toLocaleString()}</div>
                  {log.bounceReason && (
                    <div className="text-xs text-slate-400 mt-0.5 break-words" title={log.bounceReason}>
                      {log.bounceType}: {log.bounceReason}
                    </div>
                  )}
                </div>
              ) : (
                "—"
              )}
            </td>
            {onMarkReplied && (
              <td className={`py-3 align-top ${embedded ? "" : "px-4"}`}>
                {log.status !== "replied" && log.status !== "bounced" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMarkReplied(log.id);
                    }}
                    className="text-xs text-green-600 hover:underline"
                  >
                    Mark replied
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );

  const paginationControls = (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100 px-4 py-3 bg-white mt-1 select-none text-xs">
      <div className="flex items-center gap-4 text-slate-500">
        <span>
          Showing <span className="font-medium text-slate-700">{sentLogs.length === 0 ? 0 : startIndex + 1}</span> to{" "}
          <span className="font-medium text-slate-700">{endIndex}</span> of{" "}
          <span className="font-medium text-slate-700">{sentLogs.length}</span> emails
        </span>
        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
          <span className="text-slate-400 font-medium">Batch:</span>
          {[5, 10].map((size) => (
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
          Page {activePage} of {Math.max(1, totalPages)}
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
        <div className="overflow-x-auto">{table}</div>
        {paginationControls}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-slate-150 rounded-lg bg-white">
      {table}
      {paginationControls}
    </div>
  );
}
