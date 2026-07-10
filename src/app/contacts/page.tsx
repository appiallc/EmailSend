"use client";

import { useEffect, useState, useRef } from "react";
import { CSV_FORMAT } from "@/lib/csv";
import { Loader } from "@/components/Loader";

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

interface ContactList {
  id: string;
  name: string;
  createdAt: string;
  contactCount: number;
}

export default function ContactsPage() {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [showFormat, setShowFormat] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [viewing, setViewing] = useState<ContactList | null>(null);
  const [viewContacts, setViewContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const createFileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);

  const loadLists = () => {
    fetch("/api/contact-lists")
      .then((r) => r.json())
      .then((data) => {
        setLists(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadLists();
  }, []);

  const loadListContacts = async (list: ContactList) => {
    setViewing(list);
    setLoadingContacts(true);
    const contacts = await fetch(`/api/contacts?listId=${list.id}`).then((r) => r.json());
    setViewContacts(contacts);
    setLoadingContacts(false);
  };

  const createList = async (file: File) => {
    if (!newListName.trim()) {
      setMessage("Error: List name is required.");
      return;
    }
    setImporting(true);
    setMessage("");
    const csv = await file.text();
    const res = await fetch("/api/contact-lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newListName.trim(), csv }),
    });
    const data = await res.json();
    setImporting(false);
    if (data.error) {
      setMessage(`Error: ${data.error}`);
      return;
    }
    setMessage(`Created "${data.name}" with ${data.imported} contact(s).`);
    setCreating(false);
    setNewListName("");
    loadLists();
  };

  const replaceCsv = async (file: File) => {
    if (!viewing) return;
    setImporting(true);
    setMessage("");
    const csv = await file.text();
    const res = await fetch("/api/contact-lists", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: viewing.id, csv }),
    });
    const data = await res.json();
    setImporting(false);
    if (data.error) {
      setMessage(`Error: ${data.error}`);
      return;
    }
    setMessage(`Replaced contacts in "${data.name}" (${data.contactCount} total).`);
    setViewing(data);
    loadListContacts(data);
    loadLists();
  };

  const deleteList = async (id: string) => {
    if (!confirm("Delete this contact list and all contacts in it?")) return;
    await fetch(`/api/contact-lists?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMessage("Contact list deleted.");
    if (viewing?.id === id) {
      setViewing(null);
      setViewContacts([]);
    }
    loadLists();
  };

  const deleteContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
    if (viewing) loadListContacts(viewing);
    loadLists();
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
          <h1 className="text-2xl font-bold">Contact Lists</h1>
          <p className="text-slate-500 mt-1">
            Create named lists and import contacts from CSV
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
            onClick={() => setCreating(true)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Create List
          </button>
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
          </p>
          <pre className="text-xs bg-slate-900 text-green-400 p-4 rounded-lg overflow-x-auto">
            {CSV_FORMAT}
          </pre>
        </div>
      )}

      {creating && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold text-lg mb-4">Create Contact List</h2>
          <div className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium mb-1">List Name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={newListName}
                placeholder="e.g. SaaS Leads Q1"
                onChange={(e) => setNewListName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">CSV File</label>
              <button
                onClick={() => createFileRef.current?.click()}
                disabled={importing}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {importing ? "Importing..." : "Choose CSV File"}
              </button>
              <input
                ref={createFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) createList(f);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCreating(false);
                  setNewListName("");
                }}
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
              <h2 className="font-semibold">{viewing.name}</h2>
              <p className="text-xs text-slate-400 mt-1">
                {viewing.contactCount} contact(s)
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => replaceFileRef.current?.click()}
                disabled={importing}
                className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {importing ? "Replacing..." : "Replace CSV"}
              </button>
              <input
                ref={replaceFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) replaceCsv(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => {
                  setViewing(null);
                  setViewContacts([]);
                }}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
          </div>
          {loadingContacts ? (
            <Loader />
          ) : viewContacts.length === 0 ? (
            <p className="p-8 text-center text-slate-500 text-sm">No contacts in this list.</p>
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
                {viewContacts.map((c) => (
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
                        onClick={() => deleteContact(c.id)}
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
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="bg-white rounded-xl border shadow-sm min-h-[320px] flex items-center justify-center">
            <Loader />
          </div>
        ) : lists.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <p className="text-slate-500 mb-4">No contact lists yet.</p>
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg"
            >
              Create Contact List
            </button>
          </div>
        ) : (
          lists.map((list) => (
            <div key={list.id} className="bg-white rounded-xl border p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{list.name}</h3>
                  <div className="flex gap-3 mt-2 text-xs text-slate-400">
                    <span>{list.contactCount} contact(s)</span>
                    <span>•</span>
                    <span>{new Date(list.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => loadListContacts(list)}
                    className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50"
                  >
                    View
                  </button>
                  <button
                    onClick={() => deleteList(list.id)}
                    className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >
                    Delete
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
