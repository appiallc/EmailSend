import nodemailer from "nodemailer";
import type { Contact, Settings } from "@prisma/client";
import { renderTemplate } from "./templates";

export function createTransporter(settings: Settings) {
  if (!settings.smtpHost || !settings.smtpUser) {
    throw new Error("SMTP not configured. Go to Settings to set up email.");
  }

  const port = settings.smtpPort;
  const secure = settings.smtpSecure || port === 465;

  return nodemailer.createTransport({
    host: settings.smtpHost,
    port,
    secure,
    // Port 587 uses STARTTLS (secure=false + requireTLS)
    ...(port === 587 && !secure ? { requireTLS: true } : {}),
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

function formatSmtpError(err: unknown, settings: Settings): string {
  const host = `${settings.smtpHost}:${settings.smtpPort}`;
  if (!(err instanceof Error)) {
    return `SMTP connection failed for ${host}. Check host, port, SSL, and credentials.`;
  }

  const anyErr = err as Error & { code?: string; response?: string; command?: string };
  const code = anyErr.code || "";
  const msg = anyErr.message || "Unknown error";

  if (code === "ETIMEDOUT" || code === "ESOCKET" || /timeout/i.test(msg)) {
    return (
      `Connection timed out to ${host}. ` +
      `Your network may be blocking this SMTP host/port. ` +
      `If you use Zoho India (smtppro.zoho.in / smtp.zoho.in) and it times out, try another network/VPN, ` +
      `or confirm Zoho’s recommended host for your account. ` +
      `Also try port 587 with SSL/TLS unchecked.`
    );
  }

  if (code === "EAUTH" || /invalid login|authentication failed|535/i.test(msg)) {
    return (
      `Authentication failed for ${settings.smtpUser} on ${host}. ` +
      `Use your full email as username and an app password if Zoho/Gmail requires it. ` +
      `Re-enter the SMTP password and save, then test again.`
    );
  }

  if (code === "EENVELOPE" || /self signed|certificate/i.test(msg)) {
    return `TLS/certificate error connecting to ${host}: ${msg}`;
  }

  return `SMTP error (${code || "unknown"}) on ${host}: ${msg}`;
}

/** Verify SMTP credentials / connectivity without sending mail. */
export async function verifySmtpConnection(settings: Settings) {
  const transporter = createTransporter(settings);
  try {
    await transporter.verify();
  } catch (err) {
    throw new Error(formatSmtpError(err, settings));
  }
  return { ok: true as const };
}

export function injectTracking(
  html: string,
  baseUrl: string,
  trackingId: string
): string {
  const pixel = `<img src="${baseUrl}/api/track/open/${trackingId}" width="1" height="1" alt="" style="display:none" />`;
  const unsubNeedle = `/unsubscribe/${trackingId}`;

  const trackedHtml = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (full, url: string) => {
      // Never wrap unsubscribe links in click tracking
      if (url.includes(unsubNeedle) || url.includes("/api/unsubscribe")) {
        return full;
      }
      return `href="${baseUrl}/api/track/click/${trackingId}?url=${encodeURIComponent(url)}"`;
    }
  );

  return trackedHtml + pixel;
}

function appendUnsubscribeFooter(html: string, baseUrl: string, trackingId: string) {
  const unsubUrl = `${baseUrl}/unsubscribe/${trackingId}`;
  return `${html}
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;">
  <p style="margin:0;">
    Don&apos;t want these emails?
    <a href="${unsubUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
  </p>
</div>`;
}

export interface SendEmailOptions {
  settings: Settings;
  contact: Contact;
  subject: string;
  bodyHtml: string;
  trackingId: string;
  inReplyTo?: string;
  references?: string;
}

export async function sendTrackedEmail(opts: SendEmailOptions) {
  const transporter = createTransporter(opts.settings);
  const baseUrl = opts.settings.baseUrl.replace(/\/$/, "");
  const unsubPageUrl = `${baseUrl}/unsubscribe/${opts.trackingId}`;
  const unsubApiUrl = `${baseUrl}/api/unsubscribe?trackingId=${opts.trackingId}`;

  const subject = renderTemplate(opts.subject, opts.contact);
  const body = renderTemplate(opts.bodyHtml, opts.contact);
  const signature = opts.settings.emailSignature?.trim();
  const bodyWithSignature = signature
    ? `${body}<div style="margin-top:16px">${renderTemplate(signature, opts.contact)}</div>`
    : body;
  const withUnsub = appendUnsubscribeFooter(bodyWithSignature, baseUrl, opts.trackingId);
  const html = injectTracking(withUnsub, baseUrl, opts.trackingId);

  const messageId = `<${opts.trackingId}@${baseUrl.replace(/^https?:\/\//, "")}>`;

  const info = await transporter.sendMail({
    from: opts.settings.smtpFrom || opts.settings.smtpUser,
    to: opts.contact.email,
    subject,
    html,
    messageId,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    headers: {
      "X-Campaign-Tracking-Id": opts.trackingId,
      "List-Unsubscribe": `<${unsubApiUrl}>, <${unsubPageUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  return { messageId: info.messageId || messageId };
}
