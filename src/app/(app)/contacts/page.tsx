"use client";

import { useEffect, useState, useRef } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { CSV_FORMAT } from "@/lib/csv";
import { Loader } from "@/components/Loader";
import { AlertBanner } from "@/components/AlertBanner";
import { ContactsTable } from "@/components/ContactsTable";
import { API } from "@/lib/swr";

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  linkedinUrl: string;
  companyUrl: string;
  notes: string;
}

interface ContactList {
  id: string;
  name: string;
  createdAt: string;
  contactCount: number;
}

const emptyContact = (): Contact => ({
  id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  email: "",
  firstName: "",
  lastName: "",
  company: "",
  title: "",
  phone: "",
  linkedinUrl: "",
  companyUrl: "",
  notes: "",
});

function isTempId(id: string) {
  return id.startsWith("new-");
}

function listNameFromFileName(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "").trim();
}

export default function ContactsPage() {
  const {
    data: listsData,
    isLoading: listsLoading,
    mutate: mutateLists,
  } = useSWR<ContactList[]>(API.contactLists);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContactList | null>(null);
  const [editName, setEditName] = useState("");
  const [editContacts, setEditContacts] = useState<Contact[]>([]);
  const [editCsvFile, setEditCsvFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [showFormat, setShowFormat] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [viewing, setViewing] = useState<ContactList | null>(null);
  const [listSearch, setListSearch] = useState("");
  const createFileRef = useRef<HTMLInputElement>(null);
  const replaceFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const lists = listsData ?? [];
  const loading = listsLoading && !listsData;
  const filteredLists = lists.filter((l) =>
    !listSearch.trim()
      ? true
      : l.name.toLowerCase().includes(listSearch.trim().toLowerCase())
  );

  const {
    data: viewContactsData,
    isLoading: loadingContacts,
    mutate: mutateViewContacts,
  } = useSWR<Contact[]>(viewing ? API.contacts(viewing.id) : null);

  const {
    data: editContactsData,
    isLoading: loadingEditContacts,
    mutate: mutateEditContacts,
  } = useSWR<Contact[]>(editing ? API.contacts(editing.id) : null);

  const viewContacts = viewContactsData ?? [];

  useEffect(() => {
    if (!editing) return;
    if (editContactsData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditContacts(Array.isArray(editContactsData) ? editContactsData : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed local rows when list or remote data changes
  }, [editing?.id, editContactsData]);

  const editContactsPending =
    !!editing && editContacts.length === 0 && (loadingEditContacts || !editContactsData);

  const refreshListsAndStats = () =>
    Promise.all([mutateLists(), globalMutate(API.stats), globalMutate(API.campaigns)]);

  const createList = async (file: File) => {
    const name = newListName.trim() || listNameFromFileName(file.name);
    if (!name) {
      setMessage("Error: List name is required.");
      return;
    }
    setImporting(true);
    setMessage("");
    const csv = await file.text();
    const res = await fetch(API.contactLists, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, csv }),
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
    await refreshListsAndStats();
  };

  const replaceCsv = async (file: File) => {
    if (!viewing) return;
    setImporting(true);
    setMessage("");
    const csv = await file.text();
    const res = await fetch(API.contactLists, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: viewing.id, csv, replace: true }),
    });
    const data = await res.json();
    setImporting(false);
    if (data.error) {
      setMessage(`Error: ${data.error}`);
      return;
    }
    setMessage(`Replaced contacts in "${data.name}" (${data.contactCount} total).`);
    setViewing(data);
    await Promise.all([
      mutateViewContacts(),
      refreshListsAndStats(),
    ]);
  };

  const startEdit = (list: ContactList) => {
    setCreating(false);
    setViewing(null);
    setEditing(list);
    setEditName(list.name);
    setEditCsvFile(null);
    setEditContacts([]);
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditName("");
    setEditContacts([]);
    setEditCsvFile(null);
    if (editFileRef.current) editFileRef.current.value = "";
  };

  const updateEditContact = (id: string, field: keyof Contact, value: string) => {
    setEditContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const addEditRow = () => {
    setEditContacts((prev) => [...prev, emptyContact()]);
  };

  const removeEditRow = async (contact: Contact) => {
    if (isTempId(contact.id)) {
      setEditContacts((prev) => prev.filter((c) => c.id !== contact.id));
      return;
    }
    if (!confirm(`Delete ${contact.email || "this contact"}?`)) return;
    await fetch(`/api/contacts?id=${contact.id}`, { method: "DELETE" });
    setEditContacts((prev) => prev.filter((c) => c.id !== contact.id));
    await Promise.all([mutateEditContacts(), refreshListsAndStats()]);
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      setMessage("Error: List name is required.");
      return;
    }

    for (const c of editContacts) {
      if (!c.email.trim() || !c.email.includes("@")) {
        setMessage("Error: Every contact needs a valid email.");
        return;
      }
    }

    const emails = editContacts.map((c) => c.email.trim().toLowerCase());
    if (new Set(emails).size !== emails.length) {
      setMessage("Error: Duplicate emails in the list.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const listRes = await fetch(API.contactLists, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.id, name: editName.trim() }),
      });
      const listData = await listRes.json();
      if (listData.error) {
        setMessage(`Error: ${listData.error}`);
        return;
      }

      const existing = editContacts.filter((c) => !isTempId(c.id));
      const created = editContacts.filter((c) => isTempId(c.id));

      if (existing.length > 0) {
        const patchRes = await fetch("/api/contacts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contacts: existing.map((c) => ({
              id: c.id,
              email: c.email,
              firstName: c.firstName,
              lastName: c.lastName,
              company: c.company,
              title: c.title,
              phone: c.phone,
              linkedinUrl: c.linkedinUrl,
              companyUrl: c.companyUrl,
              notes: c.notes,
            })),
          }),
        });
        const patchData = await patchRes.json();
        if (patchData.error) {
          setMessage(`Error: ${patchData.error}`);
          return;
        }
      }

      for (const c of created) {
        const createRes = await fetch("/api/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactListId: editing.id,
            email: c.email,
            firstName: c.firstName,
            lastName: c.lastName,
            company: c.company,
            title: c.title,
            phone: c.phone,
            linkedinUrl: c.linkedinUrl,
            companyUrl: c.companyUrl,
            notes: c.notes,
          }),
        });
        const createData = await createRes.json();
        if (createData.error) {
          setMessage(`Error: ${createData.error}`);
          return;
        }
      }

      let imported = 0;
      if (editCsvFile) {
        const csv = await editCsvFile.text();
        const csvRes = await fetch(API.contactLists, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, csv, replace: false }),
        });
        const csvData = await csvRes.json();
        if (csvData.error) {
          setMessage(`Error: ${csvData.error}`);
          return;
        }
        imported = csvData.imported ?? 0;
      }

      const parts = [`Saved "${listData.name}"`];
      if (existing.length || created.length) {
        parts.push(`${existing.length + created.length} contact row(s) updated`);
      }
      if (imported) parts.push(`${imported} from CSV`);
      setMessage(parts.join(" · "));
      const listId = editing.id;
      cancelEdit();
      await Promise.all([
        mutateLists(),
        globalMutate(API.contacts(listId)),
        globalMutate(API.stats),
        globalMutate(API.campaigns),
      ]);
    } finally {
      setSaving(false);
    }
  };

  const deleteList = async (id: string) => {
    if (!confirm("Delete this contact list and all contacts in it?")) return;
    await fetch(`${API.contactLists}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMessage("Contact list deleted.");
    if (viewing?.id === id) setViewing(null);
    if (editing?.id === id) cancelEdit();
    await refreshListsAndStats();
  };

  const deleteContactsBulk = async (ids: string[]) => {
    const res = await fetch("/api/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(`Error: ${data.error || "Could not delete contacts"}`);
      return;
    }
    setMessage(`Deleted ${data.deleted ?? ids.length} contact(s).`);
    const [updatedLists] = await Promise.all([
      mutateLists(),
      viewing ? mutateViewContacts() : Promise.resolve(),
      globalMutate(API.stats),
      globalMutate(API.campaigns),
    ]);
    if (viewing && updatedLists) {
      const fresh = updatedLists.find((l) => l.id === viewing.id);
      if (fresh) setViewing(fresh);
    }
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

  const downloadListAsCSV = (contacts: Contact[], listName: string) => {
    if (contacts.length === 0) {
      alert("No contacts in this list to download.");
      return;
    }
    const headers = [
      "email",
      "first_name",
      "last_name",
      "company",
      "title",
      "phone",
      "linkedin_url",
      "company_url",
      "notes",
    ];

    const rows = contacts.map((c) => [
      c.email || "",
      c.firstName || "",
      c.lastName || "",
      c.company || "",
      c.title || "",
      c.phone || "",
      c.linkedinUrl || "",
      c.companyUrl || "",
      c.notes || "",
    ]);

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
    const sanitizedName = listName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    link.setAttribute("download", `${sanitizedName}_contacts.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const inputClass = "w-full border rounded px-2 py-1.5 text-xs bg-white";

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
            onClick={() => {
              cancelEdit();
              setCreating(true);
            }}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Create List
          </button>
        </div>
      </div>

      {message && <AlertBanner message={message} onClose={() => setMessage("")} />}

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
                placeholder="Optional — uses CSV file name if empty"
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

      {editing && (
        <div className="mb-8 bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold text-lg mb-4">Edit Contact List</h2>
          <div className="space-y-4">
            <div className="max-w-md">
              <label className="block text-sm font-medium mb-1">List Name</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Contacts</label>
                <button
                  type="button"
                  onClick={addEditRow}
                  disabled={saving || editContactsPending}
                  className="px-3 py-1.5 text-xs border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  + Add Contact
                </button>
              </div>
              {editContactsPending ? (
                <Loader />
              ) : editContacts.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                  No contacts yet. Add a row or append a CSV.
                </p>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-xs min-w-[1100px]">
                    <thead>
                      <tr className="text-left text-slate-500 border-b bg-slate-50">
                        <th className="px-2 py-2 font-medium">Email</th>
                        <th className="px-2 py-2 font-medium">First name</th>
                        <th className="px-2 py-2 font-medium">Last name</th>
                        <th className="px-2 py-2 font-medium">Company</th>
                        <th className="px-2 py-2 font-medium">Title</th>
                        <th className="px-2 py-2 font-medium">Phone</th>
                        <th className="px-2 py-2 font-medium">LinkedIn URL</th>
                        <th className="px-2 py-2 font-medium">Company URL</th>
                        <th className="px-2 py-2 font-medium">Notes</th>
                        <th className="px-2 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editContacts.map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.email}
                              onChange={(e) =>
                                updateEditContact(c.id, "email", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.firstName}
                              onChange={(e) =>
                                updateEditContact(c.id, "firstName", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.lastName}
                              onChange={(e) =>
                                updateEditContact(c.id, "lastName", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.company}
                              onChange={(e) =>
                                updateEditContact(c.id, "company", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.title}
                              onChange={(e) =>
                                updateEditContact(c.id, "title", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.phone}
                              onChange={(e) =>
                                updateEditContact(c.id, "phone", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              placeholder="https://linkedin.com/in/…"
                              value={c.linkedinUrl || ""}
                              onChange={(e) =>
                                updateEditContact(c.id, "linkedinUrl", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              placeholder="https://…"
                              value={c.companyUrl || ""}
                              onChange={(e) =>
                                updateEditContact(c.id, "companyUrl", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              className={inputClass}
                              value={c.notes}
                              onChange={(e) =>
                                updateEditContact(c.id, "notes", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeEditRow(c)}
                              className="text-red-500 hover:text-red-700 text-xs"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="max-w-md">
              <label className="block text-sm font-medium mb-1">Add CSV (optional)</label>
              <p className="text-xs text-slate-400 mb-2">
                Appends contacts after saving the table edits.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => editFileRef.current?.click()}
                  disabled={saving}
                  className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {editCsvFile ? "Change CSV File" : "Choose CSV File"}
                </button>
                {editCsvFile && (
                  <span className="text-xs text-slate-500 truncate max-w-[200px]">
                    {editCsvFile.name}
                  </span>
                )}
                {editCsvFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditCsvFile(null);
                      if (editFileRef.current) editFileRef.current.value = "";
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                ref={editFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  setEditCsvFile(e.target.files?.[0] ?? null);
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveEdit}
                disabled={saving || editContactsPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
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
          <div className="px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold">{viewing.name}</h2>
              <p className="text-xs text-slate-400 mt-1">
                {viewing.contactCount} contact(s) in list
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadListAsCSV(viewContacts, viewing.name)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 font-medium transition-colors"
                title="Download Contacts as CSV"
              >
                Download CSV
              </button>
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
                onClick={() => setViewing(null)}
                className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 border rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
          {loadingContacts ? (
            <Loader />
          ) : (
            <ContactsTable
              contacts={viewContacts}
              listName={viewing.name}
              onDeleteMany={deleteContactsBulk}
              onDownload={(rows) =>
                downloadListAsCSV(rows as Contact[], viewing.name)
              }
            />
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
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <h2 className="font-semibold text-slate-800">Your lists</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Open a list to search, select, and manage contacts
                </p>
              </div>
              <input
                type="search"
                className="w-full sm:max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="Search lists…"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
              />
            </div>
            {filteredLists.length === 0 ? (
              <p className="text-sm text-slate-500 py-10 text-center">
                No lists match your search.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 border-b bg-slate-50/80">
                      <th className="px-5 py-3 font-medium">List name</th>
                      <th className="px-5 py-3 font-medium">Contacts</th>
                      <th className="px-5 py-3 font-medium">Created</th>
                      <th className="px-5 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLists.map((list) => (
                      <tr
                        key={list.id}
                        className={`border-b border-slate-100 hover:bg-slate-50/80 ${
                          viewing?.id === list.id ? "bg-blue-50/50" : ""
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null);
                              setViewing(list);
                            }}
                            className="font-medium text-slate-900 hover:text-blue-700 text-left"
                          >
                            {list.name}
                          </button>
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-slate-600">
                          {list.contactCount}
                        </td>
                        <td className="px-5 py-3.5 text-slate-500">
                          {new Date(list.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditing(null);
                                setViewing(list);
                              }}
                              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-white bg-white"
                            >
                              View
                            </button>
                            <button
                              onClick={() => startEdit(list)}
                              className="px-3 py-1.5 text-xs border rounded-lg hover:bg-white bg-white"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deleteList(list.id)}
                              className="px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 bg-white"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
