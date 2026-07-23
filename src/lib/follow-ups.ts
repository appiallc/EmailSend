import type { Campaign } from "@prisma/client";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
} from "./templates";

export interface FollowUpStep {
  days: number;
  subject: string;
  bodyHtml: string;
}

export function parseExtraFollowUps(raw: unknown): FollowUpStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const days = Number(row.days);
      const subject = String(row.subject ?? "").trim();
      const bodyHtml = String(row.bodyHtml ?? "").trim();
      if (!Number.isFinite(days) || days < 0 || !subject || !bodyHtml) return null;
      return { days: Math.floor(days), subject, bodyHtml };
    })
    .filter((s): s is FollowUpStep => s !== null);
}

export function getFollowUpSteps(campaign: {
  followUpDays: number;
  followUpSubject: string;
  followUpBodyHtml: string;
  extraFollowUps?: unknown;
}): FollowUpStep[] {
  const steps: FollowUpStep[] = [];
  if (campaign.followUpSubject.trim() && campaign.followUpBodyHtml.trim()) {
    steps.push({
      days: campaign.followUpDays,
      subject: campaign.followUpSubject,
      bodyHtml: campaign.followUpBodyHtml,
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

export function computeFollowUpDue(sentAt: Date, days: number): Date {
  return new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function normalizeExtraFollowUps(raw: unknown): FollowUpStep[] {
  return parseExtraFollowUps(raw);
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
  extraFollowUps?: unknown;
}): string | null {
  const defaultHasContent =
    !!campaign.followUpSubject.trim() && !!campaign.followUpBodyHtml.trim();
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

export function createEmptyExtraFollowUp(previousDays: number): FollowUpStep {
  return {
    days: previousDays,
    subject: DEFAULT_FOLLOWUP_SUBJECT,
    bodyHtml: DEFAULT_FOLLOWUP_BODY,
  };
}

export type CampaignWithFollowUps = Campaign & { extraFollowUps: unknown };
