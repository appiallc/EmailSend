"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_INITIAL_BODY,
  DEFAULT_INITIAL_SUBJECT,
} from "@/lib/templates";
import { Loader } from "@/components/Loader";
import { AlertBanner } from "@/components/AlertBanner";
import { CampaignTrackingTable } from "@/components/CampaignTrackingTable";
import { FollowUpStepsEditor } from "@/components/FollowUpStepsEditor";
import { EmailPreview } from "@/components/EmailPreview";
import { HtmlEmailEditor } from "@/components/HtmlEmailEditor";
import { API } from "@/lib/swr";
import type { Settings } from "@/lib/settings-validation";
import type { CampaignEmailLog } from "@/lib/campaign-types";
import { campaignMetrics } from "@/lib/campaign-types";
import {
  getFollowUpSteps,
  parseExtraFollowUps,
  validateCampaignFollowUps,
  type FollowUpStep,
} from "@/lib/follow-ups";

interface ContactList {
  id: string;
  name: string;
  contactCount: number;
}

interface Campaign {
  id: string;
  name: string;
  subject: string;
  subjectB?: string;
  abTesting?: boolean;
  bodyHtml: string;
  followUpSubject: string;
  followUpBodyHtml: string;
  followUpDays: number;
  extraFollowUps?: FollowUpStep[] | unknown;
  status: string;
  scheduledAt?: string | null;
  contactListIds: string[];
  contactLists: { id: string; name: string }[];
  emailLogs: CampaignEmailLog[];
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  kind: string;
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleLocalValue() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return toDatetimeLocalValue(d);
}

function formatScheduledAt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** e.g. "2 days 4 hours 30 mins" or "due now" */
function formatTimeUntil(target: Date, nowMs = Date.now()): string | null {
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - nowMs;
  if (ms <= 0) return "due now";

  const totalMins = Math.floor(ms / 60_000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins} min${mins === 1 ? "" : "s"}`);
  }
  return parts.join(" ");
}

function scheduleCountdownLabel(localOrIso: string, nowMs = Date.now()) {
  const target = new Date(localOrIso);
  if (Number.isNaN(target.getTime())) return null;
  const until = formatTimeUntil(target, nowMs);
  if (!until) return null;
  const when = formatScheduledAt(target.toISOString());
  if (until === "due now") {
    return `Will send now (${when})`;
  }
  return `Will be sent on ${when} — in ${until}`;
}

function ContactListPicker({
  lists,
  selected,
  onChange,
}: {
  lists: ContactList[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  if (lists.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        No contact lists yet.{" "}
        <a href="/contacts" className="underline">
          Create one first
        </a>
        .
      </p>
    );
  }

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {lists.map((list) => {
        const active = selected.includes(list.id);
        return (
          <button
            key={list.id}
            type="button"
            onClick={() => toggle(list.id)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              active
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {list.name} ({list.contactCount})
          </button>
        );
      })}
    </div>
  );
}

export default function CampaignsPage() {
  const {
    data: campaigns,
    isLoading: campaignsLoading,
    mutate: mutateCampaigns,
  } = useSWR<Campaign[]>(API.campaigns, {
    refreshInterval: (data) =>
      data?.some((c) => c.status === "sending") ? 5000 : 0,
  });
  const { data: contactLists } = useSWR<ContactList[]>(API.contactLists);
  const { data: settings } = useSWR<Settings>(API.settings);
  const { data: templatesData } = useSWR<EmailTemplate[]>(API.templates);
  const emailSignature = settings?.emailSignature ?? "";
  const templates = templatesData ?? [];
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, string>>({});
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState<Campaign | null>(null);
  const [sendSelections, setSendSelections] = useState<Record<string, string[]>>({});
  const [audiencePreview, setAudiencePreview] = useState<Record<
    string,
    {
      willSendCount: number;
      uniqueCount: number;
      duplicateCount: number;
      suppressedCount: number;
      rawCount: number;
    }
  >>({});
  const [testingSend, setTestingSend] = useState(false);

  const lists = contactLists ?? [];
  const campaignList = campaigns ?? [];
  const loading = campaignsLoading && !campaigns;

  useEffect(() => {
    if (!campaigns) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSendSelections((prev) => {
      const next = { ...prev };
      for (const c of campaigns) {
        if (!next[c.id]?.length && c.contactListIds?.length) {
          next[c.id] = c.contactListIds;
        }
      }
      return next;
    });
  }, [campaigns]);

  // Live countdown while picking a time or viewing a scheduled campaign.
  useEffect(() => {
    const needsTick =
      schedulingId !== null ||
      campaignList.some((c) => c.status === "scheduled" && !!c.scheduledAt);
    if (!needsTick) return;
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [schedulingId, campaignList]);

  const refreshCampaigns = async () => {
    const updated = await mutateCampaigns();
    if (viewing && updated) {
      const c = updated.find((x) => x.id === viewing.id);
      if (c) setViewing(c);
    }
  };

  const createCampaign = async () => {
    const res = await fetch(API.campaigns, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Campaign ${new Date().toLocaleDateString()}`,
        subject: DEFAULT_INITIAL_SUBJECT,
        subjectB: "",
        abTesting: false,
        bodyHtml: DEFAULT_INITIAL_BODY,
        followUpSubject: DEFAULT_FOLLOWUP_SUBJECT,
        followUpBodyHtml: DEFAULT_FOLLOWUP_BODY,
        followUpDays: 7,
        extraFollowUps: [],
        contactListIds: [],
      }),
    });
    const campaign = await res.json();
    setEditing({
      ...campaign,
      extraFollowUps: parseExtraFollowUps(campaign.extraFollowUps),
    });
    await mutateCampaigns();
  };

  const saveCampaign = async () => {
    if (!editing) return;

    const extraFollowUps = parseExtraFollowUps(editing.extraFollowUps);
    const validationError = validateCampaignFollowUps({
      followUpDays: editing.followUpDays,
      followUpSubject: editing.followUpSubject,
      followUpBodyHtml: editing.followUpBodyHtml,
      extraFollowUps,
    });
    if (validationError) {
      setMessage(`Error: ${validationError}`);
      return;
    }

    const res = await fetch(API.campaigns, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: editing.name,
        subject: editing.subject,
        subjectB: editing.subjectB || "",
        abTesting: !!editing.abTesting,
        bodyHtml: editing.bodyHtml,
        followUpSubject: editing.followUpSubject,
        followUpBodyHtml: editing.followUpBodyHtml,
        followUpDays: editing.followUpDays,
        extraFollowUps,
        contactListIds: editing.contactListIds,
      }),
    });
    const data = await res.json();
    if (data.error) {
      setMessage(`Error: ${data.error}`);
      return;
    }
    setMessage("Campaign saved successfully.");
    setEditing(null);
    await mutateCampaigns();
  };

  const sendCampaign = async (id: string, sendToAll: boolean) => {
    const selected = sendSelections[id] ?? [];

    if (!sendToAll && selected.length === 0) {
      setMessage("Error: Select at least one contact list, or use Send to All.");
      return;
    }

    setSendingId(id);
    setMessage("");
    try {
      const previewRes = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: id,
          action: "preview",
          sendToAll,
          contactListIds: sendToAll ? undefined : selected,
          allowDuplicates: false,
        }),
      });
      const preview = await previewRes.json();
      if (!previewRes.ok) {
        setMessage(`Error: ${preview.error || "Could not preview audience"}`);
        return;
      }

      setAudiencePreview((prev) => ({ ...prev, [id]: preview }));

      const dupNote =
        preview.duplicateCount > 0
          ? `\n\n${preview.duplicateCount} duplicate email(s) across lists will be skipped (deduped).`
          : "";
      const supNote =
        preview.suppressedCount > 0
          ? `\n${preview.suppressedCount} suppressed email(s) will be skipped.`
          : "";

      if (
        !confirm(
          `Send to ${preview.willSendCount} unique recipient(s)?${dupNote}${supNote}\n\nThis cannot be undone.`
        )
      ) {
        return;
      }

      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: id,
          action: "send",
          sendToAll,
          contactListIds: sendToAll ? undefined : selected,
          allowDuplicates: false,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else if (data.queued) {
        setMessage(
          `Campaign queued successfully — ${data.recipients} recipient(s) sending in the background.${
            data.suppressed
              ? ` ${data.suppressed} suppressed email(s) skipped.`
              : ""
          }`
        );
      } else {
        setMessage(
          `Campaign sent successfully — ${data.sent} email(s) to ${data.recipients} recipient(s).${
            data.failed ? ` ${data.failed} failed.` : ""
          }`
        );
      }
      await Promise.all([refreshCampaigns(), globalMutate(API.stats)]);
    } finally {
      setSendingId(null);
    }
  };

  const pauseOrResume = async (id: string, action: "pause" | "resume") => {
    setSendingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, action }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(
          action === "pause"
            ? "Campaign paused successfully. Follow-ups and schedules are halted."
            : `Campaign resumed (${data.status}).`
        );
      }
      await refreshCampaigns();
    } finally {
      setSendingId(null);
    }
  };

  const sendTestEmail = async () => {
    if (!editing) return;
    setTestingSend(true);
    setMessage("");
    try {
      const res = await fetch("/api/campaigns/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: editing.subject,
          bodyHtml: editing.bodyHtml,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error || "Test send failed"}`);
        return;
      }
      setMessage(data.message || "Test email sent successfully.");
    } finally {
      setTestingSend(false);
    }
  };

  const openSchedulePicker = (id: string) => {
    setSchedulingId(id);
    setScheduleDrafts((prev) => ({
      ...prev,
      [id]: prev[id] || defaultScheduleLocalValue(),
    }));
  };

  const scheduleCampaign = async (id: string, sendToAll: boolean) => {
    const selected = sendSelections[id] ?? [];
    const localValue = scheduleDrafts[id] || defaultScheduleLocalValue();
    const when = new Date(localValue);

    if (Number.isNaN(when.getTime())) {
      setMessage("Error: Choose a valid date and time.");
      return;
    }
    if (when.getTime() <= Date.now()) {
      setMessage("Error: Schedule time must be in the future.");
      return;
    }
    if (!sendToAll && selected.length === 0) {
      setMessage("Error: Select at least one contact list, or schedule for all contacts.");
      return;
    }

    const label = sendToAll
      ? "ALL contacts"
      : selected.map((lid) => lists.find((l) => l.id === lid)?.name).join(", ");

    if (
      !confirm(
        `Schedule this campaign for ${formatScheduledAt(when.toISOString())} to ${label}?`
      )
    ) {
      return;
    }

    setSendingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: id,
          action: "schedule",
          scheduledAt: when.toISOString(),
          sendToAll,
          contactListIds: sendToAll ? undefined : selected,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(
          `Successfully scheduled for ${formatScheduledAt(data.scheduledAt)} — ${data.recipients} recipient(s).`
        );
        setSchedulingId(null);
      }
      await Promise.all([refreshCampaigns(), globalMutate(API.stats)]);
    } finally {
      setSendingId(null);
    }
  };

  const cancelSchedule = async (id: string) => {
    if (!confirm("Cancel the scheduled send for this campaign?")) return;
    setSendingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: id, action: "cancel-schedule" }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage("Scheduled send cancelled successfully.");
        setSchedulingId(null);
      }
      await Promise.all([refreshCampaigns(), globalMutate(API.stats)]);
    } finally {
      setSendingId(null);
    }
  };

  const deleteCampaign = async (id: string) => {
    if (!confirm("Delete this campaign and all of its email logs? This cannot be undone.")) return;
    const res = await fetch(`${API.campaigns}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();

    if (data.error) {
      setMessage(`Error: ${data.error}`);
      return;
    }

    setMessage("Campaign deleted successfully.");
    if (editing?.id === id) setEditing(null);
    if (viewing?.id === id) setViewing(null);
    await Promise.all([mutateCampaigns(), globalMutate(API.stats)]);
  };

  const markReplied = async (logId: string) => {
    await fetch("/api/email-logs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: logId, status: "replied" }),
    });
    await Promise.all([refreshCampaigns(), globalMutate(API.stats)]);
  };

  const downloadLogsAsCSV = (logs: CampaignEmailLog[], campaignName: string) => {
    const sentLogs = logs.filter((l) => l.status !== "pending");
    if (sentLogs.length === 0) {
      alert("No email logs to download yet.");
      return;
    }
    const headers = [
      "First Name",
      "Last Name",
      "Email",
      "Company",
      "Type",
      "Status",
      "Sent At",
      "Opened At",
      "Replied At",
    ];

    const rows = sentLogs.map((log) => {
      const typeStr = log.type === "followup"
        ? `Follow-up ${log.followUpStep || 1}`
        : log.type;

      return [
        log.contact.firstName || "",
        log.contact.lastName || "",
        log.contact.email || "",
        log.contact.company || "",
        typeStr,
        log.status || "",
        log.sentAt ? new Date(log.sentAt).toLocaleString() : "",
        log.openedAt ? new Date(log.openedAt).toLocaleString() : "",
        log.repliedAt ? new Date(log.repliedAt).toLocaleString() : "",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            const escaped = String(val).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const sanitizedCampaignName = campaignName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    link.setAttribute("download", `${sanitizedCampaignName}_tracked_emails.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-slate-500 mt-1">
            Create outreach emails with automatic follow-up sequences
          </p>
        </div>
        <button
          onClick={createCampaign}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          + New Campaign
        </button>
      </div>

      {message && <AlertBanner message={message} onClose={() => setMessage("")} />}

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
              <label className="block text-sm font-medium mb-1">
                Default Contact Lists
              </label>
              <p className="text-xs text-slate-400 mb-2">
                Pre-selected when sending. You can override on each campaign card.
              </p>
              <ContactListPicker
                lists={lists}
                selected={editing.contactListIds ?? []}
                onChange={(ids) => setEditing({ ...editing, contactListIds: ids })}
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="block text-sm font-medium">Initial Email Subject</label>
                {templates.filter((t) => t.kind === "initial").length > 0 && (
                  <select
                    className="text-xs border rounded-lg px-2 py-1 max-w-[220px]"
                    defaultValue=""
                    onChange={(e) => {
                      const t = templates.find((x) => x.id === e.target.value);
                      if (!t) return;
                      setEditing({
                        ...editing,
                        subject: t.subject,
                        bodyHtml: t.bodyHtml,
                      });
                      e.target.value = "";
                    }}
                  >
                    <option value="">Apply template…</option>
                    {templates
                      .filter((t) => t.kind === "initial")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editing.subject}
                onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
              />
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!editing.abTesting}
                  onChange={(e) =>
                    setEditing({ ...editing, abTesting: e.target.checked })
                  }
                />
                A/B test subjects (split recipients 50/50)
              </label>
              {editing.abTesting && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    Subject B
                  </label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={editing.subjectB || ""}
                    placeholder="Alternate subject line"
                    onChange={(e) =>
                      setEditing({ ...editing, subjectB: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label className="block text-sm font-medium">Initial Email Body</label>
                <button
                  type="button"
                  onClick={sendTestEmail}
                  disabled={testingSend || !editing.bodyHtml.trim()}
                  className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                >
                  {testingSend ? "Sending test…" : "Send test to me"}
                </button>
              </div>
              <HtmlEmailEditor
                rows={10}
                value={editing.bodyHtml}
                onChange={(html) => setEditing({ ...editing, bodyHtml: html })}
              />
              <EmailPreview
                label="Initial email preview"
                subject={editing.subject}
                bodyHtml={editing.bodyHtml}
                signature={emailSignature}
              />
            </div>
            <FollowUpStepsEditor
              followUpDays={editing.followUpDays}
              followUpSubject={editing.followUpSubject}
              followUpBodyHtml={editing.followUpBodyHtml}
              extraFollowUps={parseExtraFollowUps(editing.extraFollowUps)}
              emailSignature={emailSignature}
              onChangeDefault={(patch) =>
                setEditing({ ...editing, ...patch })
              }
              onChangeExtra={(extraFollowUps) =>
                setEditing({ ...editing, extraFollowUps })
              }
            />
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
            <div className="flex items-center gap-4">
              <button
                onClick={() => downloadLogsAsCSV(viewing.emailLogs, viewing.name)}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                title="Download Tracked Emails as CSV"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download CSV
              </button>
              <button onClick={() => setViewing(null)} className="text-sm text-slate-500 hover:text-slate-800">
                Close
              </button>
            </div>
          </div>
          <CampaignTrackingTable
            logs={viewing.emailLogs}
            onMarkReplied={markReplied}
          />
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl border shadow-sm min-h-[320px] flex items-center justify-center">
            <Loader />
          </div>
        ) : campaignList.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <p className="text-slate-500 mb-4">No campaigns yet.</p>
            <button onClick={createCampaign} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg">
              Create Campaign
            </button>
          </div>
        ) : (
          campaignList.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{c.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{c.subject}</p>
                  <div className="flex gap-3 mt-2 text-xs text-slate-400">
                    <span>
                      Follow-ups: {getFollowUpSteps(c).length} step(s)
                    </span>
                    <span>•</span>
                    <span>{c.emailLogs.length} recipient(s)</span>
                    <span>•</span>
                    <span
                      className={`capitalize px-2 py-0.5 rounded-full font-medium ${
                        c.status === "paused"
                          ? "bg-orange-100 text-orange-800"
                          : c.status === "scheduled"
                            ? "bg-amber-100 text-amber-800"
                            : c.status === "sending"
                              ? "bg-blue-100 text-blue-700"
                              : c.status === "sent"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  {c.status === "paused" && (
                    <p className="mt-2 text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 inline-block">
                      Paused — sends and follow-ups are halted. Resume to continue.
                    </p>
                  )}
                  {c.status === "scheduled" && c.scheduledAt && (
                    <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
                      {scheduleCountdownLabel(c.scheduledAt, nowTick) ??
                        `Scheduled for ${formatScheduledAt(c.scheduledAt)}`}
                    </p>
                  )}
                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-600 mb-2">Send to lists:</p>
                    <ContactListPicker
                      lists={lists}
                      selected={sendSelections[c.id] ?? c.contactListIds ?? []}
                      onChange={(ids) =>
                        setSendSelections((prev) => ({ ...prev, [c.id]: ids }))
                      }
                    />
                    {audiencePreview[c.id] && (
                      <p className="mt-2 text-xs text-slate-500">
                        Last preview: {audiencePreview[c.id].willSendCount} will send
                        {audiencePreview[c.id].duplicateCount > 0
                          ? ` · ${audiencePreview[c.id].duplicateCount} dupes skipped`
                          : ""}
                        {audiencePreview[c.id].suppressedCount > 0
                          ? ` · ${audiencePreview[c.id].suppressedCount} suppressed`
                          : ""}
                      </p>
                    )}
                    {(() => {
                      const m = campaignMetrics(c.emailLogs);
                      return m.sent > 0 ? (
                        <p className="mt-2 text-xs text-slate-500">
                          Performance: {m.openRate}% open · {m.replyRate}% reply ·{" "}
                          {m.bounced} bounced
                          {c.abTesting && m.variantA.sent + m.variantB.sent > 0
                            ? ` · A ${m.variantA.openRate}%/${m.variantA.replyRate}% · B ${m.variantB.openRate}%/${m.variantB.replyRate}%`
                            : ""}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  {schedulingId === c.id && c.status !== "scheduled" && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Send date &amp; time
                        </label>
                        <input
                          type="datetime-local"
                          className="w-full max-w-xs border rounded-lg px-3 py-2 text-sm bg-white"
                          value={scheduleDrafts[c.id] || defaultScheduleLocalValue()}
                          min={toDatetimeLocalValue(new Date())}
                          onChange={(e) => {
                            setNowTick(Date.now());
                            setScheduleDrafts((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }));
                          }}
                        />
                        {(() => {
                          const draft =
                            scheduleDrafts[c.id] || defaultScheduleLocalValue();
                          const label = scheduleCountdownLabel(draft, nowTick);
                          const past =
                            !Number.isNaN(new Date(draft).getTime()) &&
                            new Date(draft).getTime() <= nowTick;
                          return label ? (
                            <p
                              className={`mt-2 text-sm font-medium ${
                                past ? "text-red-600" : "text-amber-800"
                              }`}
                            >
                              {label}
                            </p>
                          ) : null;
                        })()}
                        <p className="text-[11px] text-slate-400 mt-1">
                          Uses your local timezone. Sends within about a minute of this time while the app is running.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => scheduleCampaign(c.id, false)}
                          disabled={sendingId !== null}
                          className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg disabled:opacity-50"
                        >
                          {sendingId === c.id ? "Scheduling..." : "Confirm schedule (selected)"}
                        </button>
                        <button
                          type="button"
                          onClick={() => scheduleCampaign(c.id, true)}
                          disabled={sendingId !== null}
                          className="px-3 py-1.5 text-xs border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                        >
                          Schedule for all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchedulingId(null)}
                          className="px-3 py-1.5 text-xs border rounded-lg hover:bg-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setViewing(c)}
                    className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
                  >
                    Track
                  </button>
                  <button
                    onClick={() =>
                      setEditing({
                        ...c,
                        extraFollowUps: parseExtraFollowUps(c.extraFollowUps),
                      })
                    }
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
                  {c.status === "scheduled" ? (
                    <button
                      onClick={() => cancelSchedule(c.id)}
                      disabled={sendingId !== null}
                      className="px-3 py-1.5 text-xs border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                    >
                      Cancel schedule
                    </button>
                  ) : (
                    <button
                      onClick={() => openSchedulePicker(c.id)}
                      disabled={sendingId !== null || c.status === "sending"}
                      className="px-3 py-1.5 text-xs border border-amber-300 text-amber-800 rounded-lg hover:bg-amber-50 disabled:opacity-50"
                    >
                      Schedule
                    </button>
                  )}
                  {c.status === "paused" ? (
                    <button
                      onClick={() => pauseOrResume(c.id, "resume")}
                      disabled={sendingId !== null}
                      className="px-3 py-1.5 text-xs border border-orange-300 text-orange-800 rounded-lg hover:bg-orange-50 disabled:opacity-50"
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      onClick={() => pauseOrResume(c.id, "pause")}
                      disabled={
                        sendingId !== null ||
                        c.status === "sending" ||
                        c.status === "draft"
                      }
                      className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                    >
                      Pause
                    </button>
                  )}
                  <button
                    onClick={() => sendCampaign(c.id, false)}
                    disabled={
                      sendingId !== null ||
                      c.status === "sending" ||
                      c.status === "paused"
                    }
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {sendingId === c.id ? "Sending..." : "Send to Selected"}
                  </button>
                  <button
                    onClick={() => sendCampaign(c.id, true)}
                    disabled={
                      sendingId !== null ||
                      c.status === "sending" ||
                      c.status === "paused"
                    }
                    className="px-3 py-1.5 text-xs border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                  >
                    Send to All (deduped)
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
