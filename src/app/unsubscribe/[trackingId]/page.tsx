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
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-xl border shadow-sm p-8">
        <h1 className="text-xl font-bold text-slate-900">Unsubscribe</h1>
        <p className="mt-2 text-sm text-slate-500">
          Confirm below to stop receiving outreach emails from Appia.
        </p>

        {status === "done" ? (
          <p className="mt-6 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            {message}
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {status === "error" && (
              <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {message}
              </p>
            )}
            <button
              type="button"
              onClick={confirm}
              disabled={status === "loading"}
              className="w-full px-4 py-2.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {status === "loading" ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
