export const MASKED_PASSWORD = "••••••••";

export interface Settings {
  companyName: string;
  emailSignature: string;
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
  sendDelayMs: number;
  timezone: string;
  businessDaysOnly: boolean;
  sendWindowStart: string;
  sendWindowEnd: string;
  dailySendLimit: number;
  bouncePausePercent: number;
  lastOutboundAt?: string | null;
  lastOutboundError?: string;
  lastReplyCheckAt?: string | null;
  lastReplyCheckError?: string;
}

export type SettingsFieldErrors = Partial<
  Record<keyof Settings | "smtpSecure", string>
>;

function isValidHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidMailHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host.includes("@") || host.includes("/") || host.includes(" ")) return false;

  const ipv4 =
    /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  if (ipv4.test(host)) return true;

  const hostname =
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
  return hostname.test(host);
}

function validatePort(port: number): string | undefined {
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return "Port must be between 1 and 65535";
  }
}

function passwordIsSet(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0;
}

function isValidTimeOfDay(value: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

/** Saved masked placeholder or any non-empty value counts as set. */
export function validateSettings(settings: Settings): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};

  const baseUrl = settings.baseUrl.trim();
  if (baseUrl && !isValidHttpUrl(baseUrl)) {
    errors.baseUrl = "Enter a valid URL starting with http:// or https://";
  }

  const smtpHost = settings.smtpHost.trim();
  const smtpStarted =
    smtpHost ||
    settings.smtpUser.trim() ||
    settings.smtpFrom.trim() ||
    passwordIsSet(settings.smtpPass);

  if (smtpStarted) {
    if (!smtpHost) {
      errors.smtpHost = "SMTP host is required";
    } else if (!isValidMailHost(smtpHost)) {
      errors.smtpHost = "Enter a valid hostname (e.g. smtp.gmail.com)";
    }
    if (!settings.smtpUser.trim()) {
      errors.smtpUser = "SMTP username is required";
    }
    if (!passwordIsSet(settings.smtpPass)) {
      errors.smtpPass = "SMTP password is required";
    }

    const portError = validatePort(settings.smtpPort);
    if (portError) errors.smtpPort = portError;

    const from = settings.smtpFrom.trim();
    if (from && !isValidEmail(from)) {
      errors.smtpFrom = "Enter a valid from email address";
    }

    if (settings.smtpPort === 465 && !settings.smtpSecure) {
      errors.smtpSecure = "Port 465 requires SSL/TLS enabled";
    }
    if (settings.smtpPort === 587 && settings.smtpSecure) {
      errors.smtpSecure = "Port 587 usually uses STARTTLS (leave SSL/TLS off)";
    }
  }

  const imapHost = settings.imapHost.trim();
  const imapStarted =
    imapHost ||
    settings.imapUser.trim() ||
    passwordIsSet(settings.imapPass);

  if (imapStarted) {
    if (!imapHost) {
      errors.imapHost = "IMAP host is required";
    } else if (!isValidMailHost(imapHost)) {
      errors.imapHost = "Enter a valid hostname (e.g. imap.gmail.com)";
    }
    if (!settings.imapUser.trim()) {
      errors.imapUser = "IMAP username is required";
    }
    if (!passwordIsSet(settings.imapPass)) {
      errors.imapPass = "IMAP password is required";
    }

    const imapPortError = validatePort(settings.imapPort);
    if (imapPortError) errors.imapPort = imapPortError;
  }

  if (
    settings.sendDelayMs !== undefined &&
    (!Number.isFinite(settings.sendDelayMs) ||
      settings.sendDelayMs < 0 ||
      settings.sendDelayMs > 60_000)
  ) {
    errors.sendDelayMs = "Send delay must be between 0 and 60000 ms";
  }

  if (settings.timezone?.trim()) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: settings.timezone.trim() });
    } catch {
      errors.timezone = "Enter a valid IANA timezone (e.g. Asia/Kolkata)";
    }
  }

  if (settings.sendWindowStart && !isValidTimeOfDay(settings.sendWindowStart)) {
    errors.sendWindowStart = "Use HH:mm format";
  }
  if (settings.sendWindowEnd && !isValidTimeOfDay(settings.sendWindowEnd)) {
    errors.sendWindowEnd = "Use HH:mm format";
  }

  if (
    settings.dailySendLimit !== undefined &&
    (!Number.isFinite(settings.dailySendLimit) ||
      settings.dailySendLimit < 0 ||
      settings.dailySendLimit > 10_000)
  ) {
    errors.dailySendLimit = "Daily send limit must be between 0 and 10000";
  }

  if (
    settings.bouncePausePercent !== undefined &&
    (!Number.isFinite(settings.bouncePausePercent) ||
      settings.bouncePausePercent < 0 ||
      settings.bouncePausePercent > 100)
  ) {
    errors.bouncePausePercent = "Bounce pause % must be between 0 and 100";
  }

  return errors;
}
