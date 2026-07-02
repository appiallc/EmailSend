"use client";

import { useEffect, useState, useRef } from "react";
import { CSV_FORMAT } from "@/lib/csv";

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  notes: string;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [showFormat, setShowFormat] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((data) => {
        setContacts(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  const handleFile = async (file: File) => {
    setImporting(true);
    setMessage("");
    const csv = await file.text();
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    const data = await res.json();
    setImporting(false);
    setMessage(
      `Imported ${data.imported} contact(s).` +
        (data.errors?.length ? ` ${data.errors.length} warning(s).` : "")
    );
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
    load();
  };

  const downloadSample = () => {
    const blob = new Blob([CSV_FORMAT], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-slate-500 mt-1">
            Import leads from CSV and manage your outreach list
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFormat(!showFormat)}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-white bg-white"
          >
            CSV Format
          </button>
          <button
            onClick={downloadSample}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-white bg-white"
          >
            Download Sample
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? "Importing..." : "Upload CSV"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {message}
        </div>
      )}

      {showFormat && (
        <div className="mb-6 bg-white rounded-xl border p-5">
          <h3 className="font-semibold mb-2">Required CSV Format</h3>
          <p className="text-sm text-slate-500 mb-3">
            The <code className="bg-slate-100 px-1 rounded">email</code> column is required.
            Other columns are optional but recommended for personalization.
          </p>
          <pre className="text-xs bg-slate-900 text-green-400 p-4 rounded-lg overflow-x-auto">
            {CSV_FORMAT}
          </pre>
          <p className="text-xs text-slate-400 mt-2">
            Supported aliases: first_name/firstName, last_name/lastName, company/organization, title/position, phone/mobile, notes/comments
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-8 text-slate-500 text-sm">Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 mb-4">No contacts yet. Upload a CSV to get started.</p>
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
            >
              Upload CSV
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b bg-slate-50">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}
                  </td>
                  <td className="px-4 py-3">{c.email}</td>
                  <td className="px-4 py-3">{c.company || "—"}</td>
                  <td className="px-4 py-3">{c.title || "—"}</td>
                  <td className="px-4 py-3">{c.phone || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {contacts.length > 0 && (
        <p className="text-xs text-slate-400 mt-3">{contacts.length} contact(s) total</p>
      )}
    </div>
  );
}
