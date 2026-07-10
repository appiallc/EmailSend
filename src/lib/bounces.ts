import type { BounceType } from "./email-log";

export interface ParsedMailForDetection {
  fromAddress?: string;
  fromName?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
}

export interface BounceParseResult {
  isBounce: boolean;
  recipient?: string;
  bounceType?: BounceType;
  reason?: string;
}

const BOUNCE_FROM_PATTERNS = [
  /mailer-daemon/i,
  /mail delivery subsystem/i,
  /postmaster/i,
  /mail delivery system/i,
  /delivery subsystem/i,
];

const BOUNCE_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /mail delivery failed/i,
  /undelivered mail returned to sender/i,
  /returned mail/i,
  /delivery incomplete/i,
  /delivery failed/i,
  /failure notice/i,
  /undeliverable/i,
  /could not be delivered/i,
  /delivery failure/i,
];

const DSN_BODY_MARKERS = [
  /final-recipient:/i,
  /original-recipient:/i,
  /diagnostic-code:/i,
  /status:\s*[45]/i,
  /action:\s*failed/i,
  /report-type=delivery-status/i,
  /message wasn't delivered/i,
  /message could not be delivered/i,
  /address couldn't be found/i,
  /address not found/i,
  /user not found/i,
  /recipient address rejected/i,
];

const RECIPIENT_PATTERNS = [
  /final-recipient:\s*rfc822;\s*<?([^\s>;]+@[^\s>;]+)>?/i,
  /original-recipient:\s*rfc822;\s*<?([^\s>;]+@[^\s>;]+)>?/i,
  /x-failed-recipients:\s*([^\s,;]+@[^\s,;]+)/i,
  /delivered to\s+<?([^\s<>]+@[^\s<>]+)>?\s+because/i,
  /wasn't delivered to\s+<?([^\s<>]+@[^\s<>]+)>?/i,
  /could not be delivered to\s+<?([^\s<>]+@[^\s<>]+)>?/i,
  /recipient:\s*<?([^\s<>]+@[^\s<>]+)>?/i,
  /to:\s*<?([^\s<>]+@[^\s<>]+)>?\s*$/im,
];

const SYSTEM_LOCALPARTS = new Set([
  "mailer-daemon",
  "postmaster",
  "noreply",
  "no-reply",
  "bounce",
]);

const HARD_BOUNCE_PATTERNS = [
  /user unknown/i,
  /user not found/i,
  /no such user/i,
  /address not found/i,
  /address couldn't be found/i,
  /recipient address rejected/i,
  /mailbox unavailable/i,
  /mailbox not found/i,
  /does not exist/i,
  /invalid recipient/i,
  /unknown user/i,
  /host not found/i,
  /domain not found/i,
  /no such host/i,
  /550[ -]/i,
  /551[ -]/i,
  /552[ -]/i,
  /553[ -]/i,
  /554[ -]/i,
  /5\.1\.1/i,
  /5\.1\.2/i,
  /5\.4\.1/i,
];

const SOFT_BOUNCE_PATTERNS = [
  /inbox full/i,
  /mailbox full/i,
  /recipient inbox full/i,
  /over quota/i,
  /quota exceeded/i,
  /temporary/i,
  /try again later/i,
  /server error/i,
  /service unavailable/i,
  /452[ -]/i,
  /421[ -]/i,
  /4\.\d\.\d/i,
];

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase();
}

export function headersFromMailparser(
  headers: Map<string, unknown> | undefined
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;

  for (const [key, value] of headers.entries()) {
    const normalized = normalizeHeaderKey(key);
    if (Array.isArray(value)) {
      out[normalized] = value.map(String).join(" ");
    } else if (value !== undefined && value !== null) {
      out[normalized] = String(value);
    }
  }
  return out;
}

function combinedBody(mail: ParsedMailForDetection): string {
  const text = mail.text || "";
  const html = (mail.html || "").replace(/<[^>]+>/g, " ");
  return `${mail.subject || ""}\n${text}\n${html}`;
}

function isSystemAddress(email: string): boolean {
  const local = email.split("@")[0]?.toLowerCase() || "";
  return SYSTEM_LOCALPARTS.has(local) || local.includes("mailer-daemon");
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(value));
}

export function isBounceSender(mail: ParsedMailForDetection): boolean {
  const from = `${mail.fromName || ""} ${mail.fromAddress || ""}`.trim();
  if (!from) return false;
  return matchesAny(from, BOUNCE_FROM_PATTERNS);
}

export function isBounceSubject(subject: string | undefined): boolean {
  if (!subject) return false;
  return matchesAny(subject, BOUNCE_SUBJECT_PATTERNS);
}

export function hasDsnMarkers(body: string, headers: Record<string, string>): boolean {
  if (headers["content-type"]?.includes("report-type=delivery-status")) return true;
  if (headers["auto-submitted"]?.toLowerCase().includes("auto-replied")) return true;
  return matchesAny(body, DSN_BODY_MARKERS);
}

export function isLikelyBounce(mail: ParsedMailForDetection): boolean {
  const body = combinedBody(mail);
  const headers = mail.headers || {};
  const senderBounce = isBounceSender(mail);
  const subjectBounce = isBounceSubject(mail.subject);
  const dsn = hasDsnMarkers(body, headers);

  if (senderBounce) return true;
  if (subjectBounce && dsn) return true;
  if (subjectBounce && matchesAny(body, [/diagnostic-code:/i, /status:\s*[45]/i])) return true;
  return false;
}

export function extractBouncedRecipient(mail: ParsedMailForDetection): string | undefined {
  const body = combinedBody(mail);
  const headers = mail.headers || {};

  const candidates: string[] = [];

  for (const pattern of RECIPIENT_PATTERNS) {
    const match = body.match(pattern);
    if (match?.[1]) candidates.push(match[1].toLowerCase());
  }

  if (headers["x-failed-recipients"]) {
    candidates.push(
      ...headers["x-failed-recipients"]
        .split(/[,;]/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  const unique = [...new Set(candidates)].filter(
    (email) => email.includes("@") && !isSystemAddress(email)
  );

  return unique[0];
}

function extractDiagnosticReason(body: string, headers: Record<string, string>): string {
  const diagnostic = body.match(/diagnostic-code:\s*([^\n\r]+)/i)?.[1]?.trim();
  if (diagnostic) return diagnostic.replace(/^smtp;\s*/i, "").trim();

  const statusLine = body.match(/status:\s*([^\n\r]+)/i)?.[1]?.trim();
  if (statusLine) return `Status ${statusLine}`;

  const subject = headers["subject"];
  if (subject && isBounceSubject(subject)) return subject.trim();

  const snippet = body
    .split(/\n/)
    .map((l) => l.trim())
    .find((line) => line.length > 10 && !line.startsWith("Content-"));

  return snippet?.slice(0, 200) || "Delivery failed";
}

export function classifyBounceType(reason: string, body: string): BounceType {
  const combined = `${reason}\n${body}`;
  if (matchesAny(combined, SOFT_BOUNCE_PATTERNS)) return "SOFT_BOUNCE";
  if (matchesAny(combined, HARD_BOUNCE_PATTERNS)) return "HARD_BOUNCE";
  return "HARD_BOUNCE";
}

export function parseBounceEmail(mail: ParsedMailForDetection): BounceParseResult {
  if (!isLikelyBounce(mail)) {
    return { isBounce: false };
  }

  const body = combinedBody(mail);
  const headers = mail.headers || {};
  const recipient = extractBouncedRecipient(mail);
  const reason = extractDiagnosticReason(body, headers);
  const bounceType = classifyBounceType(reason, body);

  return {
    isBounce: true,
    recipient,
    bounceType,
    reason,
  };
}

export function mailFromParsed(parsed: {
  from?: { value?: Array<{ address?: string; name?: string }>; text?: string };
  subject?: string;
  text?: string;
  html?: string | false;
  headers?: Map<string, unknown>;
}): ParsedMailForDetection {
  const from = parsed.from?.value?.[0];
  return {
    fromAddress: from?.address,
    fromName: from?.name || parsed.from?.text,
    subject: parsed.subject,
    text: parsed.text,
    html: typeof parsed.html === "string" ? parsed.html : undefined,
    headers: headersFromMailparser(parsed.headers),
  };
}
