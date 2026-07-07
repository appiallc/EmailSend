import nodemailer from "nodemailer";
import type { Contact, Settings } from "@prisma/client";
import { renderTemplate } from "./templates";

export function createTransporter(settings: Settings) {
  if (!settings.smtpHost || !settings.smtpUser) {
    throw new Error("SMTP not configured. Go to Settings to set up email.");
  }

  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export function injectTracking(
  html: string,
  baseUrl: string,
  trackingId: string
): string {
  const pixel = `<img src="${baseUrl}/api/track/open/${trackingId}" width="1" height="1" alt="" style="display:none" />`;

  const trackedHtml = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url: string) =>
      `href="${baseUrl}/api/track/click/${trackingId}?url=${encodeURIComponent(url)}"`
  );

  return trackedHtml + pixel;
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

  const subject = renderTemplate(opts.subject, opts.contact);
  const body = renderTemplate(opts.bodyHtml, opts.contact);
  const html = injectTracking(body, baseUrl, opts.trackingId);

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
    },
  });

  return { messageId: info.messageId || messageId };
}
