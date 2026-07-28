"use client";

import { alertToneClasses, toneFromMessage, type AlertTone } from "@/lib/alert-tone";

export function AlertBanner({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone?: AlertTone;
  onClose?: () => void;
}) {
  const resolved = tone ?? toneFromMessage(message);
  const title =
    resolved === "error" ? "Error" : resolved === "warning" ? "Warning" : "Success";
  const body = message.replace(/^Error:\s*/i, "").trim();

  return (
    <div className="fixed top-4 left-1/2 z-50 w-[min(100%-2rem,36rem)] -translate-x-1/2 pointer-events-none">
      <div
        role="alert"
        className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg ${alertToneClasses(resolved)}`}
      >
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide opacity-80">
            {title}
          </p>
          <p className="leading-snug">{body}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-current/25 px-2.5 py-1 text-xs font-medium hover:bg-black/5"
            aria-label="Dismiss message"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
