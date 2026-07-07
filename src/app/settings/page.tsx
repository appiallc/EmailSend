"use client";

import { useEffect, useState } from "react";

interface Settings {
  companyName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  baseUrl: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    setSettings(data);
    setSaving(false);
    setMessage("Settings saved successfully.");
  };

  const runScheduler = async () => {
    setChecking(true);
    setMessage("");

    try {
      const res = await fetch("/api/scheduler/run", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setMessage(`Error: ${data.error || "Scheduler run failed"}`);
        return;
      }

      let msg = `Scheduler run complete: ${data.replies} reply(ies) detected, ${data.followUps} follow-up(s) sent.`;
      if (data.errors?.length) {
        msg += ` Issues: ${data.errors.join("; ")}`;
      }
      setMessage(msg);
    } catch (err) {
      setMessage(
        `Error: ${err instanceof Error ? err.message : "Scheduler run failed"}`
      );
    } finally {
      setChecking(false);
    }
  };

  if (!settings) {
    return (
      <div className="p-8">
        <p className="text-slate-500">Loading settings...</p>
      </div>
    );
  }

  const field = (
    label: string,
    key: keyof Settings,
    type: string = "text",
    placeholder?: string
  ) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        className="w-full border rounded-lg px-3 py-2 text-sm"
        value={String(settings[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) =>
          setSettings({
            ...settings,
            [key]:
              type === "number"
                ? parseInt(e.target.value) || 0
                : type === "checkbox"
                  ? e.target.checked
                  : e.target.value,
          })
        }
        {...(type === "checkbox" ? { checked: !!settings[key] } : {})}
      />
    </div>
  );

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-500 mt-1">
          Configure SMTP for sending and IMAP for reply detection
        </p>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800 text-sm">
          {message}
        </div>
      )}

      <div className="space-y-6">
        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-4">Company</h2>
          {field("Company Name", "companyName")}
          {field("Base URL (for tracking pixels)", "baseUrl", "text", "https://your-app.example.com")}
          {settings.baseUrl.includes("localhost") && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Open/click tracking will not work for recipients while Base URL is localhost.
              Use a public URL (deployed app or a tunnel like ngrok) so email clients can load the tracking pixel.
            </p>
          )}
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">SMTP — Outgoing Email</h2>
          <p className="text-xs text-slate-400 mb-4">
            Use your company email provider (Gmail, Outlook, SendGrid SMTP, etc.)
          </p>
          <div className="grid grid-cols-2 gap-4">
            {field("SMTP Host", "smtpHost", "text", "smtp.gmail.com")}
            {field("SMTP Port", "smtpPort", "number")}
            {field("SMTP Username", "smtpUser")}
            {field("SMTP Password", "smtpPass", "password")}
            {field("From Address", "smtpFrom", "email", "you@company.com")}
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.smtpSecure}
                  onChange={(e) =>
                    setSettings({ ...settings, smtpSecure: e.target.checked })
                  }
                />
                Use SSL/TLS (port 465)
              </label>
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">IMAP — Reply Detection</h2>
          <p className="text-xs text-slate-400 mb-4">
            Optional. Checks your inbox every 15 min for replies to sent emails.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {field("IMAP Host", "imapHost", "text", "imap.gmail.com")}
            {field("IMAP Port", "imapPort", "number")}
            {field("IMAP Username", "imapUser")}
            {field("IMAP Password", "imapPass", "password")}
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">Scheduler</h2>
          <p className="text-xs text-slate-400 mb-4">
            Follow-ups run automatically every hour. Use this to trigger manually.
          </p>
          <button
            onClick={runScheduler}
            disabled={checking}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {checking ? "Running..." : "Run Follow-up & Reply Check Now"}
          </button>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
