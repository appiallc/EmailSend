"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_INITIAL_BODY,
  DEFAULT_INITIAL_SUBJECT,
} from "@/lib/templates";
import { Loader } from "@/components/Loader";

interface EmailLog {
  id: string;
  type: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  contact: {
    email: string;
    firstName: string;
    lastName: string;
    company: string;
  };
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  followUpSubject: string;
  followUpBodyHtml: string;
  followUpDays: number;
  status: string;
  emailLogs: EmailLog[];
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState<Campaign | null>(null);

  const load = () => {
    fetch("/api/campaigns")
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const createCampaign = async () => {
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Campaign ${new Date().toLocaleDateString()}`,
        subject: DEFAULT_INITIAL_SUBJECT,
        bodyHtml: DEFAULT_INITIAL_BODY,
        followUpSubject: DEFAULT_FOLLOWUP_SUBJECT,
        followUpBodyHtml: DEFAULT_FOLLOWUP_BODY,
        followUpDays: 7,
      }),
    });
    const campaign = await res.json();
    setEditing(campaign);
    load();
  };

  const saveCampaign = async () => {
    if (!editing) return;
    await fetch("/api/campaigns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editing),
    });
    setMessage("Campaign saved.");
    setEditing(null);
    load();
  };

  const sendCampaign = async (id: string) => {
    if (!confirm("Send this campaign to ALL contacts? This cannot be undone.")) return;
    setSendingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, action: "send" }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(`Sent ${data.sent} email(s). ${data.failed} failed.`);
      }
      load();
    } finally {
      setSendingId(null);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign and all of its email logs? This cannot be undone.")) return;
    const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (data.error) {
      setMessage(`Error: ${data.error}`);
      return;
    }

    setMessage("Campaign deleted.");
    if (editing?.id === id) setEditing(null);
    if (viewing?.id === id) setViewing(null);
    load();
  };

  const markReplied = async (logId: string) => {
    await fetch("/api/email-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, status: "replied" }),
    });
    load();
    if (viewing) {
      const updated = await fetch("/api/campaigns").then((r) => r.json());
      const c = updated.find((x: Campaign) => x.id === viewing.id);
      if (c) setViewing(c);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-slate-100 text-slate-600",
      sent: "bg-blue-100 text-blue-700",
      opened: "bg-purple-100 text-purple-700",
      clicked: "bg-indigo-100 text-indigo-700",
      replied: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.pending}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-slate-500 mt-1">
            Create outreach emails with automatic 1-week follow-ups
          </p>
        </div>
        <button
          onClick={createCampaign}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + New Campaign
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-blue-800 text-sm">
          {message}
        </div>
      )}

      {editing && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold text-lg mb-4">Edit Campaign</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Campaign Name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Initial Email Subject</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editing.subject}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Initial Email Body (HTML)</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-32"
                value={editing.bodyHtml}
                onChange={(e) => setEditing({ ...editing, bodyHtml: e.target.value })}
              />
            </div>
            <div className="border-t pt-4">
              <h3 className="font-medium text-sm mb-3">Follow-up (sent after no reply)</h3>
              <div className="grid grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Days until follow-up</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={editing.followUpDays}
                    onChange={(e) =>
                      setEditing({ ...editing, followUpDays: parseInt(e.target.value) || 7 })
                    }
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">Follow-up Subject</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={editing.followUpSubject}
                  onChange={(e) => setEditing({ ...editing, followUpSubject: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Follow-up Body (HTML)</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-32"
                  value={editing.followUpBodyHtml}
                  onChange={(e) => setEditing({ ...editing, followUpBodyHtml: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Use tags: {"{{first_name}}"}, {"{{last_name}}"}, {"{{full_name}}"}, {"{{company}}"}, {"{{title}}"}, {"{{email}}"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={saveCampaign}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm border rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {viewing && (
        <div className="mb-8 bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="font-semibold">{viewing.name} — Tracking</h2>
              <p className="text-xs text-slate-400 mt-1">
                Opens are counted only 60+ seconds after send to filter automatic email prefetch.
              </p>
            </div>
            <button onClick={() => setViewing(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Close
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b bg-slate-50">
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Opened</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {viewing.emailLogs.map((log) => (
                <tr key={log.id} className="border-b border-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {[log.contact.firstName, log.contact.lastName].filter(Boolean).join(" ") || log.contact.email}
                    </div>
                    <div className="text-xs text-slate-400">{log.contact.email}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{log.type}</td>
                  <td className="px-4 py-3">{statusBadge(log.status)}</td>
                  <td className="px-4 py-3">
                    {log.sentAt ? new Date(log.sentAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {log.openedAt ? new Date(log.openedAt).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {log.status !== "replied" && (
                      <button
                        onClick={() => markReplied(log.id)}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Mark replied
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl border shadow-sm min-h-[320px] flex items-center justify-center">
            <Loader />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <p className="text-slate-500 mb-4">No campaigns yet.</p>
            <button onClick={createCampaign} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">
              Create Campaign
            </button>
          </div>
        ) : (
          campaigns.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{c.subject}</p>
                  <div className="flex gap-3 mt-2 text-xs text-slate-400">
                    <span>Follow-up: {c.followUpDays} days</span>
                    <span>•</span>
                    <span>{c.emailLogs.length} recipient(s)</span>
                    <span>•</span>
                    <span className="capitalize">{c.status}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setViewing(c)}
                    className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
                  >
                    Track
                  </button>
                  <button
                    onClick={() => setEditing(c)}
                    className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteCampaign(c.id)}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => sendCampaign(c.id)}
                    disabled={sendingId !== null || c.status === "sending"}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {sendingId === c.id ? "Sending..." : "Send to All"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
