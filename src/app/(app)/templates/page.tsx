"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader } from "@/components/Loader";
import { AlertBanner } from "@/components/AlertBanner";
import { HtmlEmailEditor } from "@/components/HtmlEmailEditor";
import { EmailPreview } from "@/components/EmailPreview";
import { API } from "@/lib/swr";
import type { Settings } from "@/lib/settings-validation";

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  kind: string;
  updatedAt?: string;
}

const emptyDraft = (): Omit<EmailTemplate, "id"> => ({
  name: "",
  subject: "",
  bodyHtml: "<p>Hi {{first_name}},</p>\n<p></p>",
  kind: "initial",
});

export default function TemplatesPage() {
  const { data, isLoading, mutate } = useSWR<EmailTemplate[]>(API.templates);
  const { data: settings } = useSWR<Settings>(API.settings);
  const [editing, setEditing] = useState<(EmailTemplate & { isNew?: boolean }) | null>(
    null
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const templates = data ?? [];
  const signature = settings?.emailSignature ?? "";

  const startCreate = () => {
    setEditing({ id: "new", ...emptyDraft(), isNew: true });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.subject.trim() || !editing.bodyHtml.trim()) {
      setMessage("Error: Name, subject, and body are required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(API.templates, {
        method: editing.isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.isNew ? undefined : editing.id,
          name: editing.name.trim(),
          subject: editing.subject.trim(),
          bodyHtml: editing.bodyHtml,
          kind: editing.kind,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${body.error || "Save failed"}`);
        return;
      }
      setMessage(editing.isNew ? "Template created successfully." : "Template saved.");
      setEditing(null);
      await mutate();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const res = await fetch(`${API.templates}?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(`Error: ${(body as { error?: string }).error || "Delete failed"}`);
      return;
    }
    setMessage("Template deleted.");
    if (editing?.id === id) setEditing(null);
    await mutate();
  };

  if (isLoading && !data) return <Loader fullPage />;

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-slate-500 mt-1">
            Reusable Appia email copy — apply from the Campaigns editor
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          New template
        </button>
      </div>

      {message && <AlertBanner message={message} onClose={() => setMessage("")} />}

      {editing && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm space-y-4">
          <h2 className="font-semibold">
            {editing.isNew ? "New template" : "Edit template"}
          </h2>
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Kind</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={editing.kind}
              onChange={(e) => setEditing({ ...editing, kind: e.target.value })}
            >
              <option value="initial">Initial email</option>
              <option value="followup">Follow-up</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Subject</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={editing.subject}
              onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Body</label>
            <HtmlEmailEditor
              rows={8}
              value={editing.bodyHtml}
              onChange={(html) => setEditing({ ...editing, bodyHtml: html })}
            />
            <EmailPreview
              label="Template preview"
              subject={editing.subject}
              bodyHtml={editing.bodyHtml}
              signature={signature}
            />
          </div>
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

      <div className="space-y-3">
        {templates.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center text-slate-500 text-sm">
            No templates yet. Create one to speed up campaign writing.
          </div>
        ) : (
          templates.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-xl border p-5 shadow-sm flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{t.name}</h3>
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                    {t.kind}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-1 truncate">{t.subject}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing({ ...t })}
                  className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="px-3 py-1.5 text-xs border border-red-200 text-red-700 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
