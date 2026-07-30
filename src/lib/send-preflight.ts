import { parseTimeOfDay } from "./send-time";

export type PreflightSeverity = "ok" | "warning" | "error";

export interface PreflightItem {
  id: string;
  severity: PreflightSeverity;
  label: string;
  detail?: string;
}

export interface ContentScore {
  score: number; // 0–100, higher = healthier
  flags: string[];
}

const SPAMMY_PHRASES = [
  "act now",
  "limited time",
  "click here",
  "buy now",
  "free money",
  "congratulations",
  "winner",
  "risk free",
  "no obligation",
  "guaranteed",
  "make money",
  "double your",
  "$$$",
];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<\/\s*div\s*>/gi, "\n")
    .replace(/<\/\s*li\s*>/gi, "\n")
    .replace(/<\/\s*h[1-6]\s*>/gi, "\n\n");
  return stripHtml(withBreaks)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function scoreEmailContent(subject: string, bodyHtml: string): ContentScore {
  const flags: string[] = [];
  let score = 100;
  const subjectTrim = subject.trim();
  const text = stripHtml(bodyHtml);
  const lower = `${subjectTrim} ${text}`.toLowerCase();

  if (!subjectTrim) {
    flags.push("Subject is empty");
    score -= 40;
  } else {
    if (subjectTrim === subjectTrim.toUpperCase() && /[A-Z]/.test(subjectTrim)) {
      flags.push("Subject is ALL CAPS");
      score -= 20;
    }
    const bangs = (subjectTrim.match(/!/g) || []).length;
    if (bangs >= 2) {
      flags.push("Subject has multiple exclamation marks");
      score -= 15;
    }
  }

  if (!text) {
    flags.push("Body looks empty");
    score -= 40;
  } else if (text.length < 40) {
    flags.push("Body is very short");
    score -= 10;
  }

  const linkCount = (bodyHtml.match(/href\s*=\s*["']https?:\/\//gi) || []).length;
  const imgCount = (bodyHtml.match(/<img\b/gi) || []).length;
  if (linkCount >= 8) {
    flags.push("Many links in the body");
    score -= 15;
  }
  if (imgCount > 0 && text.length < 30) {
    flags.push("Image-heavy / little text");
    score -= 20;
  }

  for (const phrase of SPAMMY_PHRASES) {
    if (lower.includes(phrase)) {
      flags.push(`Spammy phrase: “${phrase}”`);
      score -= 8;
    }
  }

  return { score: Math.max(0, Math.min(100, score)), flags };
}

export function buildSendPreflight(opts: {
  subject: string;
  bodyHtml: string;
  recipientCount: number;
  dailySendLimit: number;
  imapConfigured: boolean;
  imapHealthy?: boolean | null;
}): { items: PreflightItem[]; blocking: boolean; content: ContentScore } {
  const items: PreflightItem[] = [];
  const content = scoreEmailContent(opts.subject, opts.bodyHtml);

  items.push({
    id: "unsubscribe",
    severity: "ok",
    label: "Unsubscribe footer & List-Unsubscribe headers",
    detail: "Added automatically on send.",
  });

  if (content.score < 50) {
    items.push({
      id: "content",
      severity: "warning",
      label: `Content score ${content.score}/100`,
      detail: content.flags.slice(0, 4).join("; ") || "Review subject and body.",
    });
  } else if (content.flags.length > 0) {
    items.push({
      id: "content",
      severity: "warning",
      label: `Content score ${content.score}/100`,
      detail: content.flags.slice(0, 3).join("; "),
    });
  } else {
    items.push({
      id: "content",
      severity: "ok",
      label: `Content score ${content.score}/100`,
      detail: "No obvious spam signals.",
    });
  }

  if (!opts.subject.trim() || !stripHtml(opts.bodyHtml)) {
    items.push({
      id: "empty",
      severity: "error",
      label: "Subject or body is empty",
      detail: "Fix the template before sending.",
    });
  }

  const limit = Math.max(0, Math.floor(opts.dailySendLimit || 0));
  if (limit > 0 && opts.recipientCount > limit) {
    items.push({
      id: "volume",
      severity: "warning",
      label: `List (${opts.recipientCount}) exceeds daily send cap (${limit})`,
      detail:
        "Extra recipients stay queued and send on later days — large blasts hurt inbox placement.",
    });
  } else if (limit > 0) {
    items.push({
      id: "volume",
      severity: "ok",
      label: `Within daily send cap (${opts.recipientCount} / ${limit})`,
    });
  }

  if (!opts.imapConfigured) {
    items.push({
      id: "imap",
      severity: "warning",
      label: "IMAP not configured",
      detail: "Replies won’t stop follow-ups until reply detection is set up.",
    });
  } else if (opts.imapHealthy === false) {
    items.push({
      id: "imap",
      severity: "warning",
      label: "IMAP credentials look broken",
      detail: "Replies won’t stop follow-ups. Fix IMAP in Settings.",
    });
  } else {
    items.push({
      id: "imap",
      severity: "ok",
      label: "IMAP reply detection configured",
    });
  }

  const blocking = items.some((i) => i.severity === "error");
  return { items, blocking, content };
}

export function normalizeFollowUpTime(value: unknown): string {
  return parseTimeOfDay(value, "10:00");
}
