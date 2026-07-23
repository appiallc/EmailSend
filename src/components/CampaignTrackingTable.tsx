import type { CampaignEmailLog } from "@/lib/campaign-types";
import { EmailStatusBadge } from "@/components/EmailStatusBadge";

export function CampaignTrackingTable({
  logs,
  onMarkReplied,
  emptyMessage = "No emails sent for this campaign yet.",
}: {
  logs: CampaignEmailLog[];
  onMarkReplied?: (logId: string) => void;
  emptyMessage?: string;
}) {
  const sentLogs = logs.filter((l) => l.status !== "pending");

  if (sentLogs.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b bg-slate-50">
            <th className="px-4 py-3 font-medium">Contact</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Sent</th>
            <th className="px-4 py-3 font-medium">Opened</th>
            <th className="px-4 py-3 font-medium">Bounced</th>
            {onMarkReplied && <th className="px-4 py-3 font-medium">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {sentLogs.map((log) => (
            <tr key={log.id} className="border-b border-slate-50">
              <td className="px-4 py-3">
                <div className="font-medium">
                  {[log.contact.firstName, log.contact.lastName]
                    .filter(Boolean)
                    .join(" ") || log.contact.email}
                </div>
                <div className="text-xs text-slate-400">{log.contact.email}</div>
                {log.status === "failed" && log.error && (
                  <div className="text-xs text-red-600 mt-0.5 max-w-xs truncate" title={log.error}>
                    {log.error}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 capitalize">{log.type}</td>
              <td className="px-4 py-3">
                <EmailStatusBadge status={log.status} />
              </td>
              <td className="px-4 py-3">
                {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3">
                {log.openedAt ? new Date(log.openedAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-3">
                {log.bouncedAt ? (
                  <div>
                    <div>{new Date(log.bouncedAt).toLocaleString()}</div>
                    {log.bounceReason && (
                      <div
                        className="text-xs text-slate-400 mt-0.5 max-w-xs truncate"
                        title={log.bounceReason}
                      >
                        {log.bounceType}: {log.bounceReason}
                      </div>
                    )}
                  </div>
                ) : (
                  "—"
                )}
              </td>
              {onMarkReplied && (
                <td className="px-4 py-3">
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
    </div>
  );
}
