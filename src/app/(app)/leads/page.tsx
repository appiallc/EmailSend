"use client";

import { useMemo, useRef, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Loader } from "@/components/Loader";
import { AlertBanner } from "@/components/AlertBanner";
import { API } from "@/lib/swr";
import {
  LEADS_AI_PROMPT,
  LEADS_CSV_FORMAT,
  LEADS_JSON_SAMPLE,
} from "@/lib/leads-import";

interface Lead {
  id: string;
  contactName: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  upworkJobUrl: string;
  linkedinProfileUrl: string;
  linkedinCompanyUrl: string;
  companyWebsite: string;
  source: string;
  status: string;
  researchedBy: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ContactListOption {
  id: string;
  name: string;
  contactCount: number;
}

const emptyDraft = (): Omit<Lead, "id"> => ({
  contactName: "",
  email: "",
  company: "",
  title: "",
  phone: "",
  upworkJobUrl: "",
  linkedinProfileUrl: "",
  linkedinCompanyUrl: "",
  companyWebsite: "",
  source: "Upwork",
  status: "new",
  researchedBy: "",
  notes: "",
});

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  researching: "Researching",
  ready: "Ready",
  contacted: "Contacted",
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-800";
    case "researching":
      return "bg-amber-100 text-amber-800";
    case "contacted":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full border rounded-lg px-3 py-2 text-sm";

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function LeadsPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter) params.set("status", statusFilter);
    const qs = params.toString();
    return qs ? `${API.leads}?${qs}` : API.leads;
  }, [query, statusFilter]);

  const { data, isLoading, mutate } = useSWR<Lead[]>(listUrl);
  const { data: contactLists } = useSWR<ContactListOption[]>(API.contactLists);
  const [editing, setEditing] = useState<(Lead & { isNew?: boolean }) | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveListId, setMoveListId] = useState("");
  const [newListName, setNewListName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const leads = data ?? [];
  const lists = contactLists ?? [];
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(leads.map((l) => l.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const moveToList = async () => {
    if (!someSelected) {
      setMessage("Error: Select at least one lead.");
      return;
    }
    if (!moveListId && !newListName.trim()) {
      setMessage("Error: Choose a contact list or enter a new list name.");
      return;
    }
    setMoving(true);
    setMessage("");
    try {
      const res = await fetch(API.leadsMoveToList, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: [...selected],
          contactListId: moveListId || undefined,
          newListName: newListName.trim() || undefined,
          deleteLeads: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${body.error || "Move failed"}`);
        return;
      }
      const warn =
        Array.isArray(body.errors) && body.errors.length > 0
          ? ` Skipped ${body.skipped}: ${body.errors.slice(0, 3).join("; ")}`
          : "";
      setMessage(
        `Moved ${body.moved} lead(s) to “${body.contactListName}”.${warn}`
      );
      setSelected(new Set());
      setNewListName("");
      await mutate();
      await globalMutate(API.contactLists);
    } finally {
      setMoving(false);
    }
  };

  const startCreate = () => {
    setImportOpen(false);
    setEditing({ id: "new", ...emptyDraft(), isNew: true });
  };

  const openImport = () => {
    setEditing(null);
    setImportOpen(true);
  };

  const copyAiPrompt = async () => {
    await navigator.clipboard.writeText(LEADS_AI_PROMPT);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 2000);
  };

  const runImport = async (raw: string) => {
    const trimmed = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (!trimmed) {
      setMessage("Error: Paste JSON or CSV first.");
      return;
    }
    setImporting(true);
    setMessage("");
    try {
      const isJson = trimmed.startsWith("[") || trimmed.startsWith("{");
      const res = await fetch(API.leads, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isJson ? { json: trimmed } : { csv: trimmed }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${body.error || "Import failed"}`);
        return;
      }
      const warn =
        Array.isArray(body.errors) && body.errors.length > 0
          ? ` (${body.errors.length} row warning(s))`
          : "";
      setMessage(`Imported ${body.imported} lead(s)${warn}.`);
      setImportText("");
      setImportOpen(false);
      await mutate();
    } finally {
      setImporting(false);
    }
  };

  const onFileChosen = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = {
        id: editing.isNew ? undefined : editing.id,
        contactName: editing.contactName,
        email: editing.email,
        company: editing.company,
        title: editing.title,
        phone: editing.phone,
        upworkJobUrl: editing.upworkJobUrl,
        linkedinProfileUrl: editing.linkedinProfileUrl,
        linkedinCompanyUrl: editing.linkedinCompanyUrl,
        companyWebsite: editing.companyWebsite,
        source: editing.source,
        status: editing.status,
        researchedBy: editing.researchedBy,
        notes: editing.notes,
      };
      const res = await fetch(API.leads, {
        method: editing.isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${body.error || "Save failed"}`);
        return;
      }
      setMessage(editing.isNew ? "Lead added." : "Lead saved.");
      setEditing(null);
      await mutate();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this lead?")) return;
    const res = await fetch(`${API.leads}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(`Error: ${(body as { error?: string }).error || "Delete failed"}`);
      return;
    }
    setMessage("Lead deleted.");
    if (editing?.id === id) setEditing(null);
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await mutate();
  };

  if (isLoading && !data) return <Loader fullPage />;

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-slate-500 mt-1">
            Research in a table, then select leads and move them into a contact list
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={openImport}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50"
          >
            Import JSON / CSV
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Add lead
          </button>
        </div>
      </div>

      {message && <AlertBanner message={message} onClose={() => setMessage("")} />}

      {importOpen && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">Import multiple leads</h2>
              <p className="text-sm text-slate-500 mt-1">
                Copy the AI prompt → paste research into ChatGPT / Gemini → paste the
                JSON (or CSV) back here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Close
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyAiPrompt}
              className="px-3 py-1.5 text-xs bg-slate-900 text-white rounded-lg hover:bg-slate-800"
            >
              {promptCopied ? "Prompt copied" : "Copy AI prompt"}
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBlob(LEADS_CSV_FORMAT, "sample-leads.csv", "text/csv")
              }
              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
            >
              Download sample CSV
            </button>
            <button
              type="button"
              onClick={() =>
                downloadBlob(
                  LEADS_JSON_SAMPLE,
                  "sample-leads.json",
                  "application/json"
                )
              }
              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
            >
              Download sample JSON
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
            >
              Upload file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                void onFileChosen(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>

          <details className="text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Expected columns / JSON keys
            </summary>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              contact_name / contactName, email, company, title, phone,
              upwork_job_url / upworkJobUrl, linkedin_profile_url /
              linkedinProfileUrl, linkedin_company_url / linkedinCompanyUrl,
              company_website / companyWebsite, source, status, researched_by /
              researchedBy, notes
            </p>
          </details>

          <textarea
            className={`${inputClass} min-h-[180px] font-mono text-xs`}
            placeholder={`Paste JSON array from ChatGPT/Gemini, or CSV with headers…\n\nExample JSON:\n${LEADS_JSON_SAMPLE.slice(0, 280)}…`}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runImport(importText)}
              disabled={importing}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import leads"}
            </button>
            <button
              type="button"
              onClick={() => {
                setImportText("");
                setImportOpen(false);
              }}
              className="px-4 py-2 text-sm border rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <input
          className={`${inputClass} sm:flex-1`}
          placeholder="Search name, email, company, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className={`${inputClass} sm:w-48`}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {someSelected && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-end gap-3">
          <p className="text-sm font-medium text-blue-900 shrink-0 lg:pb-2">
            {selected.size} selected
          </p>
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Move to existing list">
              <select
                className={inputClass}
                value={moveListId}
                onChange={(e) => {
                  setMoveListId(e.target.value);
                  if (e.target.value) setNewListName("");
                }}
              >
                <option value="">Select contact list…</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.contactCount})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Or create new list">
              <input
                className={inputClass}
                placeholder="New list name"
                value={newListName}
                onChange={(e) => {
                  setNewListName(e.target.value);
                  if (e.target.value.trim()) setMoveListId("");
                }}
              />
            </Field>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void moveToList()}
              disabled={moving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {moving ? "Moving…" : "Move to contacts"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-4 py-2 text-sm border rounded-lg bg-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm space-y-4">
          <h2 className="font-semibold">
            {editing.isNew ? "Add lead" : "Edit lead"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Contact name">
              <input
                className={inputClass}
                placeholder="Prabal Mahendra"
                value={editing.contactName}
                onChange={(e) => setEditing({ ...editing, contactName: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                type="email"
                placeholder="prabal.mahendra@auscompcomputers.com"
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
              />
            </Field>
            <Field label="Company">
              <input
                className={inputClass}
                placeholder="Auscomp Computers"
                value={editing.company}
                onChange={(e) => setEditing({ ...editing, company: e.target.value })}
              />
            </Field>
            <Field label="Title / role">
              <input
                className={inputClass}
                placeholder="e.g. Founder, Procurement Manager"
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <Field label="Phone">
              <input
                className={inputClass}
                value={editing.phone}
                onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
              />
            </Field>
            <Field label="Researched by">
              <input
                className={inputClass}
                placeholder="Your name"
                value={editing.researchedBy}
                onChange={(e) => setEditing({ ...editing, researchedBy: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Upwork job URL">
              <input
                className={inputClass}
                placeholder="https://www.upwork.com/jobs/~…"
                value={editing.upworkJobUrl}
                onChange={(e) => setEditing({ ...editing, upworkJobUrl: e.target.value })}
              />
            </Field>
            <Field label="LinkedIn profile URL">
              <input
                className={inputClass}
                placeholder="https://www.linkedin.com/in/…"
                value={editing.linkedinProfileUrl}
                onChange={(e) =>
                  setEditing({ ...editing, linkedinProfileUrl: e.target.value })
                }
              />
            </Field>
            <Field label="LinkedIn company URL">
              <input
                className={inputClass}
                placeholder="https://www.linkedin.com/company/…"
                value={editing.linkedinCompanyUrl}
                onChange={(e) =>
                  setEditing({ ...editing, linkedinCompanyUrl: e.target.value })
                }
              />
            </Field>
            <Field label="Company website">
              <input
                className={inputClass}
                placeholder="https://…"
                value={editing.companyWebsite}
                onChange={(e) => setEditing({ ...editing, companyWebsite: e.target.value })}
              />
            </Field>
            <Field label="Source">
              <select
                className={inputClass}
                value={editing.source}
                onChange={(e) => setEditing({ ...editing, source: e.target.value })}
              >
                <option value="Upwork">Upwork</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="Website">Website</option>
                <option value="Referral">Referral</option>
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Status">
              <select
                className={inputClass}
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              className={`${inputClass} min-h-[100px]`}
              placeholder="Job context, how you found the email, next steps…"
              value={editing.notes}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
            />
          </Field>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="px-4 py-2 text-sm border rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            No leads yet. Add one, or use Import JSON / CSV for bulk research.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all leads"
                    />
                  </th>
                  <th className="px-3 py-3 font-medium">Name</th>
                  <th className="px-3 py-3 font-medium">Email</th>
                  <th className="px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Title</th>
                  <th className="px-3 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Links</th>
                  <th className="px-3 py-3 font-medium">Notes</th>
                  <th className="px-3 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {leads.map((lead) => {
                  const checked = selected.has(lead.id);
                  return (
                    <tr
                      key={lead.id}
                      className={checked ? "bg-blue-50/60" : "hover:bg-slate-50"}
                    >
                      <td className="px-3 py-2.5 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(lead.id)}
                          aria-label={`Select ${lead.contactName || lead.email || "lead"}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 align-top font-medium whitespace-nowrap">
                        {lead.contactName || "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        {lead.email || (
                          <span className="text-amber-700 text-xs">No email</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap">
                        {lead.company || "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top whitespace-nowrap text-slate-600">
                        {lead.title || "—"}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {lead.source ? (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {lead.source}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <span
                          className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${statusBadgeClass(lead.status)}`}
                        >
                          {STATUS_LABELS[lead.status] || lead.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <div className="flex flex-col gap-0.5 text-xs">
                          {lead.upworkJobUrl && (
                            <a
                              href={lead.upworkJobUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Upwork
                            </a>
                          )}
                          {lead.linkedinProfileUrl && (
                            <a
                              href={lead.linkedinProfileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              LinkedIn
                            </a>
                          )}
                          {lead.linkedinCompanyUrl && (
                            <a
                              href={lead.linkedinCompanyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Company LI
                            </a>
                          )}
                          {lead.companyWebsite && (
                            <a
                              href={lead.companyWebsite}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              Website
                            </a>
                          )}
                          {!lead.upworkJobUrl &&
                            !lead.linkedinProfileUrl &&
                            !lead.linkedinCompanyUrl &&
                            !lead.companyWebsite && (
                              <span className="text-slate-400">—</span>
                            )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-top max-w-[200px]">
                        <p className="text-slate-500 line-clamp-2 text-xs">
                          {lead.notes || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 align-top text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setImportOpen(false);
                            setEditing({ ...lead });
                          }}
                          className="px-2 py-1 text-xs border rounded-lg hover:bg-slate-50 mr-1"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void remove(lead.id)}
                          className="px-2 py-1 text-xs border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
