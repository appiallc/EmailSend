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
import { API } from "@/lib/swr";
import type { CampaignEmailLog } from "@/lib/campaign-types";
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
  bodyHtml: string;
  followUpSubject: string;
  followUpBodyHtml: string;
  followUpDays: number;
  extraFollowUps?: FollowUpStep[] | unknown;
  status: string;
  contactListIds: string[];
  contactLists: { id: string; name: string }[];
  emailLogs: CampaignEmailLog[];
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
  } = useSWR<Campaign[]>(API.campaigns);
  const { data: contactLists } = useSWR<ContactList[]>(API.contactLists);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [viewing, setViewing] = useState<Campaign | null>(null);
  const [sendSelections, setSendSelections] = useState<Record<string, string[]>>({});

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
    setMessage("Campaign saved.");
    setEditing(null);
    await mutateCampaigns();
  };

  const sendCampaign = async (id: string, sendToAll: boolean) => {
    const selected = sendSelections[id] ?? [];
    const label = sendToAll
      ? "ALL contacts in ALL lists (duplicates allowed)"
      : `selected list(s): ${selected.length ? selected.map((lid) => lists.find((l) => l.id === lid)?.name).join(", ") : "none"}`;

    if (!sendToAll && selected.length === 0) {
      setMessage("Error: Select at least one contact list, or use Send to All.");
      return;
    }

    if (!confirm(`Send this campaign to ${label}? This cannot be undone.`)) return;

    setSendingId(id);
    setMessage("");
    try {
      const res = await fetch("/api/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: id,
          action: "send",
          sendToAll,
          contactListIds: sendToAll ? undefined : selected,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`Error: ${data.error}`);
      } else {
        setMessage(`Sent ${data.sent} email(s) to ${data.recipients} recipient(s). ${data.failed} failed.`);
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

    setMessage("Campaign deleted.");
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

      {message && <AlertBanner message={message} />}

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
            <FollowUpStepsEditor
              followUpDays={editing.followUpDays}
              followUpSubject={editing.followUpSubject}
              followUpBodyHtml={editing.followUpBodyHtml}
              extraFollowUps={parseExtraFollowUps(editing.extraFollowUps)}
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
            <button onClick={() => setViewing(null)} className="text-sm text-slate-500 hover:text-slate-800">
              Close
            </button>
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
                    <span className="capitalize">{c.status}</span>
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-600 mb-2">Send to lists:</p>
                    <ContactListPicker
                      lists={lists}
                      selected={sendSelections[c.id] ?? c.contactListIds ?? []}
                      onChange={(ids) =>
                        setSendSelections((prev) => ({ ...prev, [c.id]: ids }))
                      }
                    />
                  </div>
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
                  <button
                    onClick={() => sendCampaign(c.id, false)}
                    disabled={sendingId !== null || c.status === "sending"}
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {sendingId === c.id ? "Sending..." : "Send to Selected"}
                  </button>
                  <button
                    onClick={() => sendCampaign(c.id, true)}
                    disabled={sendingId !== null || c.status === "sending"}
                    className="px-3 py-1.5 text-xs border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                  >
                    Send to All
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
