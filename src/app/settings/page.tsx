"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Loader } from "@/components/Loader";
import { AlertBanner } from "@/components/AlertBanner";
import { FormField, PasswordInput } from "@/components/SettingsFormFields";
import { API } from "@/lib/swr";
import {
  validateSettings,
  type Settings,
  type SettingsFieldErrors,
} from "@/lib/settings-validation";

export default function SettingsPage() {
  const { data, isLoading, mutate } = useSWR<Settings>(API.settings);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<SettingsFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (data) setSettings(data);
  }, [data]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[key];
      if (key === "smtpPort" || key === "smtpSecure") delete copy.smtpSecure;
      return copy;
    });
  };

  const save = async () => {
    if (!settings) return;

    const validationErrors = validateSettings(settings);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setMessage("Error: Fix the highlighted fields before saving.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      const res = await fetch(API.settings, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const updated = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${updated.error || "Could not save settings"}`);
        return;
      }
      setSettings(updated);
      setErrors({});
      await mutate(updated, { revalidate: false });
      setMessage("Settings saved successfully.");
    } finally {
      setSaving(false);
    }
  };

  const runScheduler = async () => {
    setChecking(true);
    setMessage("");

    try {
      const res = await fetch("/api/scheduler/run", { method: "POST" });
      const result = await res.json();

      if (!res.ok) {
        setMessage(`Error: ${result.error || "Scheduler run failed"}`);
        return;
      }

      let msg = `Scheduler run complete: ${result.replies} reply(ies), ${result.bounces ?? 0} bounce(s), ${result.followUps} follow-up(s) sent.`;
      if (result.errors?.length) {
        msg += ` Issues: ${result.errors.join("; ")}`;
      }
      setMessage(msg);
      await Promise.all([globalMutate(API.campaigns), globalMutate(API.stats)]);
    } catch (err) {
      setMessage(
        `Error: ${err instanceof Error ? err.message : "Scheduler run failed"}`
      );
    } finally {
      setChecking(false);
    }
  };

  if ((isLoading && !settings) || !settings) {
    return <Loader fullPage />;
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-slate-500 mt-1">
          Configure SMTP for sending and IMAP for reply detection
        </p>
      </div>

      {message && <AlertBanner message={message} />}

      <div className="space-y-6">
        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-4">Company</h2>
          <div className="space-y-4">
            <FormField
              id="companyName"
              label="Company Name"
              value={settings.companyName}
              onChange={(v) => update("companyName", v)}
            />
            <FormField
              id="baseUrl"
              label="Base URL (for tracking pixels)"
              value={settings.baseUrl}
              placeholder="https://your-app.example.com"
              error={errors.baseUrl}
              hint="Use your public deployed URL so opens/clicks can be tracked."
              onChange={(v) => update("baseUrl", v)}
            />
          </div>
          {settings.baseUrl.includes("localhost") && !errors.baseUrl && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
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
            <FormField
              id="smtpHost"
              label="SMTP Host"
              value={settings.smtpHost}
              placeholder="smtp.gmail.com"
              error={errors.smtpHost}
              onChange={(v) => update("smtpHost", v)}
            />
            <FormField
              id="smtpPort"
              label="SMTP Port"
              type="number"
              value={settings.smtpPort}
              error={errors.smtpPort}
              hint="587 (STARTTLS) or 465 (SSL)"
              onChange={(v) => update("smtpPort", parseInt(v, 10) || 0)}
            />
            <FormField
              id="smtpUser"
              label="SMTP Username"
              value={settings.smtpUser}
              error={errors.smtpUser}
              onChange={(v) => update("smtpUser", v)}
            />
            <div>
              <label htmlFor="smtpPass" className="block text-sm font-medium mb-1">
                SMTP Password
              </label>
              <PasswordInput
                id="smtpPass"
                value={settings.smtpPass}
                placeholder="App password or SMTP password"
                error={errors.smtpPass}
                autoComplete="new-password"
                onChange={(v) => update("smtpPass", v)}
              />
            </div>
            <FormField
              id="smtpFrom"
              label="From Address"
              type="email"
              value={settings.smtpFrom}
              placeholder="you@company.com"
              error={errors.smtpFrom}
              onChange={(v) => update("smtpFrom", v)}
            />
            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.smtpSecure}
                  onChange={(e) => update("smtpSecure", e.target.checked)}
                />
                Use SSL/TLS (port 465)
              </label>
              {errors.smtpSecure && (
                <p className="mt-1 text-xs text-red-600">{errors.smtpSecure}</p>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">IMAP — Reply Detection</h2>
          <p className="text-xs text-slate-400 mb-4">
            Optional. Checks your inbox for replies to sent emails (every 15 min when scheduler is configured).
          </p>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="imapHost"
              label="IMAP Host"
              value={settings.imapHost}
              placeholder="imap.gmail.com"
              error={errors.imapHost}
              onChange={(v) => update("imapHost", v)}
            />
            <FormField
              id="imapPort"
              label="IMAP Port"
              type="number"
              value={settings.imapPort}
              error={errors.imapPort}
              hint="Usually 993 for SSL"
              onChange={(v) => update("imapPort", parseInt(v, 10) || 0)}
            />
            <FormField
              id="imapUser"
              label="IMAP Username"
              value={settings.imapUser}
              error={errors.imapUser}
              onChange={(v) => update("imapUser", v)}
            />
            <div>
              <label htmlFor="imapPass" className="block text-sm font-medium mb-1">
                IMAP Password
              </label>
              <PasswordInput
                id="imapPass"
                value={settings.imapPass}
                placeholder="App password or IMAP password"
                error={errors.imapPass}
                autoComplete="new-password"
                onChange={(v) => update("imapPass", v)}
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">Scheduler</h2>
          <p className="text-xs text-slate-400 mb-4">
            On Vercel, automatic jobs need an external scheduler (e.g.{" "}
            <a
              href="https://cron-job.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              cron-job.org
            </a>
            ). Local <code className="text-[11px]">npm run dev</code> runs them in-process.
          </p>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 space-y-2">
            <p className="font-medium text-slate-700">Vercel cron URLs (add header below)</p>
            <p>
              Reply check every 15 min:{" "}
              <code className="break-all">
                {settings.baseUrl.replace(/\/$/, "")}/api/cron/replies
              </code>
            </p>
            <p>
              Follow-ups every hour:{" "}
              <code className="break-all">
                {settings.baseUrl.replace(/\/$/, "")}/api/cron/follow-ups
              </code>
            </p>
            <p>
              Header: <code>Authorization: Bearer YOUR_CRON_SECRET</code>
            </p>
            <p>Set <code>CRON_SECRET</code> in Vercel → Settings → Environment Variables.</p>
          </div>
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
