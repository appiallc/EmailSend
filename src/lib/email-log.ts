export type EmailLogStatus =
  | "pending"
  | "sent"
  | "failed"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced";

export type BounceType = "HARD_BOUNCE" | "SOFT_BOUNCE";

export const EMAIL_LOG_STATUSES: EmailLogStatus[] = [
  "pending",
  "sent",
  "failed",
  "opened",
  "clicked",
  "replied",
  "bounced",
];
