"use client";

import type { Contact } from "@prisma/client";
import { renderTemplate } from "@/lib/templates";

/** Sample contact used only for live HTML previews in the UI. */
export const PREVIEW_CONTACT = {
  id: "preview",
  email: "alex@acme.com",
  firstName: "Alex",
  lastName: "Rivera",
  company: "Acme Corp",
  title: "VP Engineering",
  phone: "+1 555-0100",
  notes: "",
  contactListId: "preview",
  createdAt: new Date(0),
} as Contact;

export function buildEmailPreviewHtml(
  bodyHtml: string,
  signature?: string | null,
  contact: Contact = PREVIEW_CONTACT
) {
  const body = renderTemplate(bodyHtml || "", contact);
  const sig = signature?.trim();
  if (!sig) return body;
  return `${body}<div style="margin-top:16px">${renderTemplate(sig, contact)}</div>`;
}

export function EmailPreview({
  subject,
  bodyHtml,
  signature,
  label = "Preview",
}: {
  subject: string;
  bodyHtml: string;
  signature?: string | null;
  label?: string;
}) {
  const renderedSubject = renderTemplate(subject || "(no subject)", PREVIEW_CONTACT);
  const html = buildEmailPreviewHtml(bodyHtml, signature);

  return (
    <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden bg-white">
      <div className="px-3 py-2 border-b bg-slate-50 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-[11px] text-slate-400">
          Sample: {PREVIEW_CONTACT.firstName} @ {PREVIEW_CONTACT.company}
        </p>
      </div>
      <div className="px-4 py-2.5 border-b text-sm">
        <span className="text-slate-400">Subject:&nbsp;</span>
        <span className="font-medium text-slate-800">{renderedSubject}</span>
      </div>
      <div
        className="p-4 text-sm text-slate-800 [&_a]:text-blue-600 [&_p]:mb-3 [&_p:last-child]:mb-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {signature?.trim() ? (
        <p className="px-4 pb-3 text-[11px] text-slate-400">
          Includes your email signature from Settings.
        </p>
      ) : (
        <p className="px-4 pb-3 text-[11px] text-amber-700">
          No email signature set — add one in Settings to include it here.
        </p>
      )}
    </div>
  );
}
