"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

export default function UnsubscribePage() {
  const params = useParams<{ trackingId: string }>();
  const trackingId = params.trackingId;
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  const confirm = async () => {
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Could not unsubscribe");
        return;
      }
      setStatus("done");
      setMessage(
        `You have been unsubscribed${data.email ? ` (${data.email})` : ""}. You will not receive further emails from this sender.`
      );
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-full w-full flex items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Appia
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900 break-words">
          Unsubscribe
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Confirm below to stop receiving outreach emails from Appia.
        </p>

        {status === "done" ? (
          <p className="mt-6 text-sm leading-relaxed text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-3 break-words">
            {message}
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {status === "error" && (
              <p className="text-sm leading-relaxed text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3 break-words">
                {message}
              </p>
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={status === "loading" || !trackingId}
              className="w-full px-4 py-3 text-sm font-medium bg-slate-900 text-white rounded-xl hover:bg-slate-800 disabled:opacity-50"
            >
              {status === "loading" ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
            <p className="text-xs text-slate-400 text-center leading-relaxed">
              You can close this page after confirming.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
