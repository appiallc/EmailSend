export const MASKED_PASSWORD = "••••••••";

export interface Settings {
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

export type SettingsFieldErrors = Partial<Record<keyof Settings | "smtpSecure", string>>;

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

function validatePort(port: number): string | undefined {
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return "Port must be between 1 and 65535";
  }
}

function hasPassword(value: string): boolean {
  return !!value.trim() && value !== MASKED_PASSWORD;
}

export function validateSettings(settings: Settings): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};

  const baseUrl = settings.baseUrl.trim();
  if (baseUrl && !isValidHttpUrl(baseUrl)) {
    errors.baseUrl = "Enter a valid URL starting with http:// or https://";
  }

  const smtpStarted =
    settings.smtpHost.trim() ||
    settings.smtpUser.trim() ||
    settings.smtpFrom.trim() ||
    hasPassword(settings.smtpPass);

  if (smtpStarted) {
    if (!settings.smtpHost.trim()) {
      errors.smtpHost = "SMTP host is required";
    }
    if (!settings.smtpUser.trim()) {
      errors.smtpUser = "SMTP username is required";
    }
    if (!hasPassword(settings.smtpPass)) {
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

  const imapStarted =
    settings.imapHost.trim() ||
    settings.imapUser.trim() ||
    hasPassword(settings.imapPass);

  if (imapStarted) {
    if (!settings.imapHost.trim()) {
      errors.imapHost = "IMAP host is required";
    }
    if (!settings.imapUser.trim()) {
      errors.imapUser = "IMAP username is required";
    }
    if (!hasPassword(settings.imapPass)) {
      errors.imapPass = "IMAP password is required";
    }

    const imapPortError = validatePort(settings.imapPort);
    if (imapPortError) errors.imapPort = imapPortError;
  }

  return errors;
}
