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
  const sentLogs = logs.filter((l) => l.status !== "pending");

  if (sentLogs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
    );
  }

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
          <th className={`py-3 font-medium w-36 ${embedded ? "" : "px-4"}`}>Bounced</th>
          {onMarkReplied && (
            <th className={`py-3 font-medium w-24 ${embedded ? "" : "px-4"}`}>Actions</th>
          )}
        </tr>
      </thead>
      <tbody>
        {sentLogs.map((log) => (
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

  if (embedded) return table;

  return <div className="overflow-x-auto">{table}</div>;
}
