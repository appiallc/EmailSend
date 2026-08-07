"use client";

import { useEffect, useState, type ReactNode } from "react";

export type ConfirmModalAction = {
  label: string;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export function ConfirmModal({
  open,
  title,
  body,
  checklist,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  checklist?: { severity: "ok" | "warning" | "error"; label: string; detail?: string }[];
  actions: ConfirmModalAction[];
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, busy]);

  if (!open) return null;

  const btnClass = (variant: ConfirmModalAction["variant"] = "secondary") => {
    switch (variant) {
      case "primary":
        return "bg-blue-600 text-white hover:bg-blue-700";
      case "danger":
        return "bg-red-600 text-white hover:bg-red-700";
      case "ghost":
        return "border border-slate-200 text-slate-600 hover:bg-slate-50";
      default:
        return "border border-slate-200 text-slate-700 hover:bg-slate-50";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-xl border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 id="confirm-modal-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-slate-600">
          {typeof body === "string" ? <p className="whitespace-pre-wrap">{body}</p> : body}
          {checklist && checklist.length > 0 && (
            <ul className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {checklist.map((item) => (
                <li key={item.label} className="text-xs">
                  <span
                    className={
                      item.severity === "error"
                        ? "font-medium text-red-700"
                        : item.severity === "warning"
                          ? "font-medium text-amber-800"
                          : "font-medium text-emerald-700"
                    }
                  >
                    {item.severity === "error"
                      ? "Blocked"
                      : item.severity === "warning"
                        ? "Warning"
                        : "OK"}
                    :{" "}
                  </span>
                  <span className="text-slate-700">{item.label}</span>
                  {item.detail && (
                    <p className="mt-0.5 text-slate-500">{item.detail}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap justify-end gap-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              className={`px-3 py-2 text-sm rounded-lg disabled:opacity-50 ${btnClass(action.variant)}`}
              onClick={() => {
                if (busy) return;
                setBusy(true);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
