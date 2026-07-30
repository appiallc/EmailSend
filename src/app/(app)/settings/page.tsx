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
import { APPIA_EMAIL_SIGNATURE } from "@/lib/email-signature";

export default function SettingsPage() {
  const { data, isLoading, mutate } = useSWR<Settings>(API.settings);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<SettingsFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [testingImap, setTestingImap] = useState(false);
  const [suppressEmailInput, setSuppressEmailInput] = useState("");
  const [suppressBusy, setSuppressBusy] = useState(false);

  const {
    data: suppressed,
    mutate: mutateSuppressed,
  } = useSWR<{ id: string; email: string; reason: string; createdAt: string }[]>(
    API.suppression
  );

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

      let msg = `Scheduler run complete: ${result.replies} reply(ies), ${result.bounces ?? 0} bounce(s), ${result.scheduledCampaigns ?? 0} campaign(s) queued, ${result.sent ?? 0} email(s) sent, ${result.followUps} follow-up(s) created.`;
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

  const testSmtp = async () => {
    setTestingSmtp(true);
    setMessage("");
    try {
      // Persist current form values first so the test uses what the user typed
      if (settings) {
        const validationErrors = validateSettings(settings);
        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors);
          setMessage("Error: Fix SMTP fields before testing.");
          return;
        }
        const saveRes = await fetch(API.settings, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
        const saved = await saveRes.json();
        if (!saveRes.ok) {
          setMessage(`Error: ${saved.error || "Could not save settings before test"}`);
          return;
        }
        setSettings(saved);
        await mutate(saved, { revalidate: false });
      }

      const res = await fetch(API.settingsTestSmtp, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error || "SMTP test failed"}`);
        return;
      }
      setMessage(data.message || "SMTP connection successful.");
    } catch (err) {
      setMessage(
        `Error: ${err instanceof Error ? err.message : "SMTP test failed"}`
      );
    } finally {
      setTestingSmtp(false);
    }
  };

  const testImap = async () => {
    setTestingImap(true);
    setMessage("");
    try {
      if (settings) {
        const validationErrors = validateSettings(settings);
        if (Object.keys(validationErrors).length > 0) {
          setErrors(validationErrors);
          setMessage("Error: Fix IMAP fields before testing.");
          return;
        }
        const saveRes = await fetch(API.settings, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        });
        const saved = await saveRes.json();
        if (!saveRes.ok) {
          setMessage(`Error: ${saved.error || "Could not save settings before test"}`);
          return;
        }
        setSettings(saved);
        await mutate(saved, { revalidate: false });
      }

      const res = await fetch(API.settingsTestImap, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error || "IMAP test failed"}`);
        await mutate();
        return;
      }
      setMessage(data.message || "IMAP connection successful.");
      await mutate();
    } catch (err) {
      setMessage(
        `Error: ${err instanceof Error ? err.message : "IMAP test failed"}`
      );
    } finally {
      setTestingImap(false);
    }
  };

  const addSuppressed = async () => {
    const email = suppressEmailInput.trim();
    if (!email) return;
    setSuppressBusy(true);
    setMessage("");
    try {
      const res = await fetch(API.suppression, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error || "Could not add email"}`);
        return;
      }
      setSuppressEmailInput("");
      await mutateSuppressed();
      setMessage(`Added ${data.email} to the suppression list.`);
    } finally {
      setSuppressBusy(false);
    }
  };

  const removeSuppressed = async (email: string) => {
    if (!confirm(`Remove ${email} from the suppression list?`)) return;
    setSuppressBusy(true);
    try {
      const res = await fetch(
        `${API.suppression}?email=${encodeURIComponent(email)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        setMessage(`Error: ${data.error || "Could not remove email"}`);
        return;
      }
      await mutateSuppressed();
      setMessage(`Removed ${email} from the suppression list.`);
    } finally {
      setSuppressBusy(false);
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

      {message && <AlertBanner message={message} onClose={() => setMessage("")} />}

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
            <FormField
              id="sendDelayMs"
              label="Send delay between emails (ms)"
              type="number"
              value={settings.sendDelayMs ?? 500}
              error={errors.sendDelayMs}
              hint="Throttles SMTP sends (0–60000). Soft bounces auto-retry up to 3 times (1h / 6h / 24h)."
              onChange={(v) => update("sendDelayMs", parseInt(v, 10) || 0)}
            />
            <p className="text-xs text-slate-600 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              For inbox placement, publish SPF, DKIM, and DMARC for your sending domain
              (e.g. appia.in) in DNS. Zoho documents this under email authentication —
              the app cannot set DNS for you.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">Deliverability</h2>
          <p className="text-xs text-slate-400 mb-4">
            Limits and send windows reduce spam risk on a single mailbox. Follow-up
            times use this timezone.
          </p>
          <div className="space-y-4">
            <FormField
              id="timezone"
              label="Timezone"
              value={settings.timezone ?? "Asia/Kolkata"}
              error={errors.timezone}
              hint="IANA name, e.g. Asia/Kolkata"
              onChange={(v) => update("timezone", v)}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                id="sendWindowStart"
                label="Send window start"
                value={settings.sendWindowStart ?? "09:00"}
                error={errors.sendWindowStart}
                hint="HH:mm local"
                onChange={(v) => update("sendWindowStart", v)}
              />
              <FormField
                id="sendWindowEnd"
                label="Send window end"
                value={settings.sendWindowEnd ?? "17:00"}
                error={errors.sendWindowEnd}
                hint="HH:mm local"
                onChange={(v) => update("sendWindowEnd", v)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={settings.businessDaysOnly !== false}
                onChange={(e) => update("businessDaysOnly", e.target.checked)}
              />
              Send only on business days (Mon–Fri); roll weekends forward
            </label>
            <FormField
              id="dailySendLimit"
              label="Daily send limit"
              type="number"
              value={settings.dailySendLimit ?? 100}
              error={errors.dailySendLimit}
              hint="0 = unlimited. Remaining recipients stay queued for later days."
              onChange={(v) => update("dailySendLimit", parseInt(v, 10) || 0)}
            />
            <FormField
              id="bouncePausePercent"
              label="Auto-pause on hard bounce %"
              type="number"
              value={settings.bouncePausePercent ?? 5}
              error={errors.bouncePausePercent}
              hint="Pause campaign when hard-bounce rate exceeds this (0 = off). Needs ≥10 sends."
              onChange={(v) => update("bouncePausePercent", parseInt(v, 10) || 0)}
            />
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-4">Email Signature</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-3 mb-1">
                <label htmlFor="emailSignature" className="block text-sm font-medium">
                  Signature HTML
                </label>
                <button
                  type="button"
                  onClick={() => update("emailSignature", APPIA_EMAIL_SIGNATURE)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2"
                >
                  Use Appia signature
                </button>
              </div>
              <textarea
                id="emailSignature"
                rows={8}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                value={settings.emailSignature ?? ""}
                placeholder={"Warm regards,<br/>Jay Kakadiya<br/>..."}
                onChange={(e) => update("emailSignature", e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">
                HTML is supported. Appended to every campaign and follow-up email. Merge tags like{" "}
                <code>{"{{first_name}}"}</code> work here too.
              </p>
              {settings.emailSignature?.trim() ? (
                <div className="mt-3 rounded-lg border bg-slate-50 p-4">
                  <p className="text-xs font-medium text-slate-500 mb-2">Preview</p>
                  <div
                    className="text-sm"
                    dangerouslySetInnerHTML={{ __html: settings.emailSignature }}
                  />
                </div>
              ) : null}
            </div>
          </div>
            <p className="mt-3 text-xs text-slate-500">
              SMTP and IMAP passwords are encrypted at rest using{" "}
              <code className="text-[11px]">AUTH_SECRET</code>. Re-save passwords after rotating that secret.
            </p>
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
            Use your company email provider (Gmail, Outlook, Zoho SMTP, etc.).
            Zoho custom domains often use <code className="text-[11px]">smtppro.zoho.in</code>{" "}
            (India) or <code className="text-[11px]">smtppro.zoho.com</code> — port{" "}
            <strong>465 + SSL</strong> or <strong>587 without SSL</strong> (STARTTLS).
          </p>
          {(settings.smtpHost.includes("zoho.in") ||
            settings.imapHost.includes("zoho.in")) && (
            <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Your Zoho India hosts (<code>*.zoho.in</code>) are often blocked on some
              networks and cause &quot;Connection timeout&quot; on send/IMAP. If Test SMTP
              times out, try a VPN, unblock outbound ports 465/587/993 to Zoho, or use a
              reachable SMTP provider. <code>*.zoho.com</code> may connect but usually
              rejects India-region mailboxes (auth 535).
            </p>
          )}
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
          <div className="mt-4">
            <button
              type="button"
              onClick={testSmtp}
              disabled={testingSmtp || saving}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              {testingSmtp ? "Testing SMTP…" : "Test SMTP connection"}
            </button>
            <p className="mt-1 text-xs text-slate-400">
              Saves current SMTP settings, then verifies login with your provider.
            </p>
          </div>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">Suppression list</h2>
          <p className="text-xs text-slate-400 mb-4">
            Unsubscribed and hard-bounced addresses are blocked from all future sends.
            You can also add emails manually.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="email"
              className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm"
              placeholder="email@example.com"
              value={suppressEmailInput}
              onChange={(e) => setSuppressEmailInput(e.target.value)}
            />
            <button
              type="button"
              onClick={addSuppressed}
              disabled={suppressBusy || !suppressEmailInput.trim()}
              className="px-4 py-2 text-sm bg-slate-900 text-white rounded-lg disabled:opacity-50"
            >
              Add
            </button>
          </div>
          {(suppressed?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400">No suppressed emails yet.</p>
          ) : (
            <ul className="divide-y border rounded-lg max-h-56 overflow-y-auto">
              {suppressed?.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{row.email}</p>
                    <p className="text-xs text-slate-400 capitalize">{row.reason}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSuppressed(row.email)}
                    disabled={suppressBusy}
                    className="text-xs text-red-600 hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
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
          {settings.lastReplyCheckError ? (
            <p className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Last IMAP error: {settings.lastReplyCheckError}
              {settings.lastReplyCheckAt
                ? ` (${new Date(settings.lastReplyCheckAt).toLocaleString()})`
                : ""}
            </p>
          ) : settings.lastReplyCheckAt ? (
            <p className="mt-3 text-xs text-emerald-700">
              Last reply check OK at{" "}
              {new Date(settings.lastReplyCheckAt).toLocaleString()}
            </p>
          ) : null}
          <button
            type="button"
            onClick={testImap}
            disabled={testingImap}
            className="mt-4 px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {testingImap ? "Testing IMAP…" : "Test IMAP connection"}
          </button>
        </section>

        <section className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="font-semibold mb-1">Scheduler</h2>
          <p className="text-xs text-slate-400 mb-4">
            Automatic jobs are triggered from{" "}
            <a
              href="https://cron-job.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              cron-job.org
            </a>
            . Local <code className="text-[11px]">npm run dev</code> also runs them
            in-process.
          </p>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 space-y-2">
            <p className="font-medium text-slate-700">Health</p>
            <p>
              Last outbound:{" "}
              {settings.lastOutboundAt
                ? new Date(settings.lastOutboundAt).toLocaleString()
                : "never"}
              {settings.lastOutboundError
                ? ` — error: ${settings.lastOutboundError}`
                : settings.lastOutboundAt
                  ? " — OK"
                  : ""}
            </p>
            <p>
              Last reply check:{" "}
              {settings.lastReplyCheckAt
                ? new Date(settings.lastReplyCheckAt).toLocaleString()
                : "never"}
              {settings.lastReplyCheckError
                ? ` — error: ${settings.lastReplyCheckError}`
                : settings.lastReplyCheckAt
                  ? " — OK"
                  : ""}
            </p>
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600 space-y-3">
            <p className="font-medium text-slate-700">
              Create these two jobs on cron-job.org
            </p>
            <div className="space-y-1">
              <p className="font-medium text-slate-700">1. Outbound (every 1 minute)</p>
              <p>
                URL:{" "}
                <code className="break-all">
                  {settings.baseUrl.replace(/\/$/, "")}/api/cron/outbound
                </code>
              </p>
              <p>Runs scheduled campaigns, the send queue, and due follow-ups.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-slate-700">2. Replies (every 15 minutes)</p>
              <p>
                URL:{" "}
                <code className="break-all">
                  {settings.baseUrl.replace(/\/$/, "")}/api/cron/replies
                </code>
              </p>
              <p>Detects replies and bounces via IMAP.</p>
            </div>
            <div className="space-y-1">
              <p className="font-medium text-slate-700">Request header (both jobs)</p>
              <p>
                <code>Authorization: Bearer YOUR_CRON_SECRET</code>
              </p>
              <p>
                Set the same value as <code>CRON_SECRET</code> in your app environment.
                Use Base URL above as your public deployed URL (not localhost).
              </p>
            </div>
          </div>
          <button
            onClick={runScheduler}
            disabled={checking}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {checking ? "Running..." : "Run scheduler now"}
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
