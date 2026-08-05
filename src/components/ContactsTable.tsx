"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { normalizeExternalUrl } from "@/lib/csv";

export interface ContactsTableRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  phone: string;
  linkedinUrl?: string;
  companyUrl?: string;
  notes?: string;
}

type ColumnId =
  | "name"
  | "email"
  | "company"
  | "title"
  | "phone"
  | "linkedin"
  | "companyUrl";

const DEFAULT_COLUMNS: ColumnId[] = [
  "name",
  "email",
  "company",
  "title",
  "phone",
  "linkedin",
  "companyUrl",
];

const COLUMN_LABELS: Record<ColumnId, string> = {
  name: "Name",
  email: "Email",
  company: "Company",
  title: "Title",
  phone: "Phone",
  linkedin: "LinkedIn",
  companyUrl: "Company URL",
};

const STORAGE_KEY = "mailtrack.contactsTable.columnOrder";

function loadColumnOrder(): ColumnId[] {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLUMNS;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    const valid = parsed.filter((id): id is ColumnId =>
      DEFAULT_COLUMNS.includes(id as ColumnId)
    );
    for (const id of DEFAULT_COLUMNS) {
      if (!valid.includes(id)) valid.push(id);
    }
    return valid;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

function contactName(c: ContactsTableRow) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}

function UrlCell({ value, label }: { value?: string; label: string }) {
  const href = normalizeExternalUrl(value || "");
  if (!href) return <span className="text-slate-400">—</span>;
  let display = value!.trim();
  try {
    display = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    // keep raw
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[10rem] inline-block align-bottom"
      title={href}
    >
      {label === "linkedin" ? "Profile" : display}
    </a>
  );
}

function renderCell(column: ColumnId, c: ContactsTableRow) {
  switch (column) {
    case "name":
      return (
        <span className="font-medium text-slate-900">{contactName(c)}</span>
      );
    case "email":
      return <span className="text-slate-700">{c.email}</span>;
    case "company":
      return <span className="text-slate-600">{c.company || "—"}</span>;
    case "title":
      return <span className="text-slate-600">{c.title || "—"}</span>;
    case "phone":
      return <span className="text-slate-600">{c.phone || "—"}</span>;
    case "linkedin":
      return <UrlCell value={c.linkedinUrl} label="linkedin" />;
    case "companyUrl":
      return <UrlCell value={c.companyUrl} label="company" />;
  }
}

export function ContactsTable({
  contacts,
  onDeleteMany,
  onDownload,
  listName,
}: {
  contacts: ContactsTableRow[];
  onDeleteMany: (ids: string[]) => Promise<void> | void;
  onDownload?: (contacts: ContactsTableRow[]) => void;
  listName?: string;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busy, setBusy] = useState(false);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [columns, setColumns] = useState<ColumnId[]>(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [dragCol, setDragCol] = useState<ColumnId | null>(null);

  useEffect(() => {
    setColumns(loadColumnOrder());
  }, []);

  useEffect(() => {
    setSelected(new Set());
    setPage(1);
    setSearch("");
    setConfirmBulk(false);
  }, [listName]);

  const persistColumns = (next: ColumnId[]) => {
    setColumns(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const moveColumn = (id: ColumnId, dir: -1 | 1) => {
    const idx = columns.indexOf(id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    persistColumns(next);
  };

  const onDropColumn = (target: ColumnId) => {
    if (!dragCol || dragCol === target) {
      setDragCol(null);
      return;
    }
    const from = columns.indexOf(dragCol);
    const to = columns.indexOf(target);
    if (from < 0 || to < 0) {
      setDragCol(null);
      return;
    }
    const next = [...columns];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persistColumns(next);
    setDragCol(null);
  };

  const filtered = contacts.filter((c) => {
    if (!deferredSearch) return true;
    const hay = [
      c.email,
      c.firstName,
      c.lastName,
      c.company,
      c.title,
      c.phone,
      c.linkedinUrl || "",
      c.companyUrl || "",
      c.notes || "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(deferredSearch);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(page, totalPages);
  const start = (activePage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  const pageIds = pageRows.map((c) => c.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const somePageSelected =
    pageIds.some((id) => selected.has(id)) && !allPageSelected;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((c) => c.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const runBulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await onDeleteMany(ids);
      clearSelection();
      setConfirmBulk(false);
    } finally {
      setBusy(false);
    }
  };

  if (contacts.length === 0) {
    return (
      <p className="p-8 text-center text-slate-500 text-sm">
        No contacts in this list.
      </p>
    );
  }

  return (
    <div>
      <div className="px-4 py-3 border-b bg-slate-50/80 space-y-3">
        <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
          <div className="relative flex-1 min-w-0 max-w-md">
            <input
              type="search"
              className="w-full border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="Search name, email, company, URLs…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
              />
            </svg>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColumns((v) => !v)}
              className="px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white hover:bg-slate-50 font-medium text-slate-700"
            >
              Rearrange columns
            </button>
            {showColumns && (
              <div className="absolute right-0 top-full mt-1 z-20 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-3">
                <p className="text-xs text-slate-500 mb-2">
                  Drag headers in the table, or use arrows here. Order is saved on
                  this browser.
                </p>
                <ul className="space-y-1">
                  {columns.map((id, index) => (
                    <li
                      key={id}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <span className="flex-1 truncate">{COLUMN_LABELS[id]}</span>
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveColumn(id, -1)}
                        className="px-1.5 py-0.5 text-xs border rounded disabled:opacity-30"
                        aria-label={`Move ${COLUMN_LABELS[id]} left`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === columns.length - 1}
                        onClick={() => moveColumn(id, 1)}
                        className="px-1.5 py-0.5 text-xs border rounded disabled:opacity-30"
                        aria-label={`Move ${COLUMN_LABELS[id]} right`}
                      >
                        ↓
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    persistColumns(DEFAULT_COLUMNS);
                    setShowColumns(false);
                  }}
                  className="mt-2 text-xs text-slate-500 hover:text-slate-800"
                >
                  Reset to default
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 lg:ml-auto">
            {filtered.length === contacts.length
              ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`
              : `${filtered.length} of ${contacts.length} contacts`}
          </p>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
            <span className="font-medium text-blue-900">
              {selected.size} selected
            </span>
            {selected.size < filtered.length && filtered.length > 0 && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs text-blue-700 hover:underline"
              >
                Select all {filtered.length} matching
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-slate-600 hover:underline"
            >
              Clear
            </button>
            <div className="flex-1" />
            {onDownload && (
              <button
                type="button"
                onClick={() =>
                  onDownload(contacts.filter((c) => selected.has(c.id)))
                }
                className="px-2.5 py-1.5 text-xs border border-slate-200 bg-white rounded-lg hover:bg-slate-50"
              >
                Export selected
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmBulk(true)}
              disabled={busy}
              className="px-2.5 py-1.5 text-xs border border-red-200 text-red-700 bg-white rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
        )}

        {confirmBulk && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900">
            <p className="font-medium">
              Delete {selected.size} contact{selected.size === 1 ? "" : "s"}?
            </p>
            <p className="text-xs text-red-700/80 mt-1">
              This cannot be undone. Campaign history for these contacts will keep
              past email logs.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={runBulkDelete}
                disabled={busy}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulk(false)}
                disabled={busy}
                className="px-3 py-1.5 text-xs border border-red-200 bg-white rounded-lg hover:bg-red-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="text-left text-slate-500 border-b bg-slate-50">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePageSelected;
                  }}
                  onChange={togglePage}
                  aria-label="Select all on this page"
                  className="rounded border-slate-300"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  draggable
                  onDragStart={() => setDragCol(col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropColumn(col)}
                  onDragEnd={() => setDragCol(null)}
                  className={`px-4 py-3 font-medium cursor-grab active:cursor-grabbing select-none ${
                    dragCol === col ? "opacity-50" : ""
                  }`}
                  title="Drag to rearrange"
                >
                  {COLUMN_LABELS[col]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-10 text-center text-slate-500"
                >
                  No contacts match your search.
                </td>
              </tr>
            ) : (
              pageRows.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-slate-100 transition-colors ${
                      isSelected ? "bg-blue-50/60" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.email}`}
                        className="rounded border-slate-300"
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-3">
                        {renderCell(col, c)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 bg-slate-50/40">
        <div className="flex items-center gap-3 flex-wrap">
          <span>
            Showing{" "}
            <span className="font-medium text-slate-700">
              {filtered.length === 0 ? 0 : start + 1}
            </span>
            –
            <span className="font-medium text-slate-700">
              {Math.min(start + pageSize, filtered.length)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-slate-700">{filtered.length}</span>
          </span>
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="text-slate-400">Rows</span>
            {[10, 25, 50].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  setPageSize(size);
                  setPage(1);
                }}
                className={`px-2 py-1 rounded border font-semibold transition-colors ${
                  pageSize === size
                    ? "bg-blue-50 text-blue-600 border-blue-200"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={activePage <= 1}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="font-medium px-1">
            Page {activePage} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={activePage >= totalPages}
            className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
