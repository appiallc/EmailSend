import type { Campaign } from "@prisma/client";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
} from "./templates";
import {
  DEFAULT_FOLLOWUP_TIME,
  parseTimeOfDay,
} from "./send-time";

export interface FollowUpStep {
  days: number;
  /** Stored for DB compatibility; outbound Subject is always Re: {initial}. */
  subject: string;
  bodyHtml: string;
  /** Local HH:mm in operator timezone. */
  timeOfDay: string;
}

/** Placeholder stored in DB — never used as the SMTP Subject header. */
export const THREADED_FOLLOWUP_SUBJECT = DEFAULT_FOLLOWUP_SUBJECT;

export function parseExtraFollowUps(raw: unknown): FollowUpStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const days = Number(row.days);
      const bodyHtml = String(row.bodyHtml ?? "").trim();
      if (!Number.isFinite(days) || days < 0 || !bodyHtml) return null;
      const subject =
        String(row.subject ?? "").trim() || THREADED_FOLLOWUP_SUBJECT;
      return {
        days: Math.floor(days),
        subject,
        bodyHtml,
        timeOfDay: parseTimeOfDay(row.timeOfDay, DEFAULT_FOLLOWUP_TIME),
      };
    })
    .filter((s): s is FollowUpStep => s !== null);
}

export function getFollowUpSteps(campaign: {
  followUpDays: number;
  followUpSubject: string;
  followUpBodyHtml: string;
  followUpTimeOfDay?: string | null;
  extraFollowUps?: unknown;
}): FollowUpStep[] {
  const steps: FollowUpStep[] = [];
  if (campaign.followUpBodyHtml.trim()) {
    steps.push({
      days: campaign.followUpDays,
      subject: campaign.followUpSubject.trim() || THREADED_FOLLOWUP_SUBJECT,
      bodyHtml: campaign.followUpBodyHtml,
      timeOfDay: parseTimeOfDay(
        campaign.followUpTimeOfDay,
        DEFAULT_FOLLOWUP_TIME
      ),
    });
  }
  steps.push(...parseExtraFollowUps(campaign.extraFollowUps));
  return steps;
}

export function getFollowUpStepConfig(
  campaign: Parameters<typeof getFollowUpSteps>[0],
  stepIndex: number
): FollowUpStep | null {
  if (stepIndex < 1) return null;
  return getFollowUpSteps(campaign)[stepIndex - 1] ?? null;
}

/** @deprecated Prefer computeFollowUpDueAt from send-time with settings. */
export function computeFollowUpDue(sentAt: Date, days: number): Date {
  return new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function normalizeExtraFollowUps(raw: unknown): FollowUpStep[] {
  return parseExtraFollowUps(raw).map((step) => ({
    ...step,
    subject: THREADED_FOLLOWUP_SUBJECT,
  }));
}

export function sanitizeExtraFollowUps(
  defaultDays: number,
  defaultHasContent: boolean,
  extra: unknown
): { steps: FollowUpStep[]; error?: string } {
  const parsed = parseExtraFollowUps(extra);
  let prevDays = defaultHasContent ? defaultDays : -1;

  for (let i = 0; i < parsed.length; i++) {
    const step = parsed[i];
    if (defaultHasContent || i > 0) {
      if (step.days < prevDays) {
        return {
          steps: [],
          error: `Follow-up ${i + 2} must be at least ${prevDays} day(s) after the initial send (same or later than the previous step).`,
        };
      }
    }
    prevDays = step.days;
  }

  return { steps: parsed };
}

export function validateCampaignFollowUps(campaign: {
  followUpDays: number;
  followUpSubject: string;
  followUpBodyHtml: string;
  followUpTimeOfDay?: string | null;
  extraFollowUps?: unknown;
}): string | null {
  const defaultHasContent = !!campaign.followUpBodyHtml.trim();
  const extra = parseExtraFollowUps(campaign.extraFollowUps);

  if (extra.length > 0 && !defaultHasContent) {
    return "Configure the first follow-up before adding more.";
  }

  const { error } = sanitizeExtraFollowUps(
    campaign.followUpDays,
    defaultHasContent,
    extra
  );
  return error ?? null;
}

export function createEmptyExtraFollowUp(
  previousDays: number,
  timeOfDay = DEFAULT_FOLLOWUP_TIME
): FollowUpStep {
  return {
    days: previousDays,
    subject: THREADED_FOLLOWUP_SUBJECT,
    bodyHtml: DEFAULT_FOLLOWUP_BODY,
    timeOfDay: parseTimeOfDay(timeOfDay, DEFAULT_FOLLOWUP_TIME),
  };
}

export type CampaignWithFollowUps = Campaign & { extraFollowUps: unknown };
