import { prisma } from "./db";

export type SuppressReason = "unsubscribe" | "hard_bounce" | "manual";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const row = await prisma.suppressedEmail.findUnique({
    where: { email: normalizeEmail(email) },
    select: { id: true },
  });
  return !!row;
}

export async function getSuppressedEmailSet(emails: string[]): Promise<Set<string>> {
  const normalized = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
  if (normalized.length === 0) return new Set();

  const rows = await prisma.suppressedEmail.findMany({
    where: { email: { in: normalized } },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}

export async function suppressEmail(
  email: string,
  reason: SuppressReason,
  source = ""
) {
  const normalized = normalizeEmail(email);
  if (!normalized.includes("@")) {
    throw new Error("Invalid email");
  }

  return prisma.suppressedEmail.upsert({
    where: { email: normalized },
    create: { email: normalized, reason, source },
    update: { reason, source },
  });
}

export async function unsuppressEmail(email: string) {
  await prisma.suppressedEmail.deleteMany({
    where: { email: normalizeEmail(email) },
  });
}

export async function listSuppressedEmails() {
  return prisma.suppressedEmail.findMany({
    orderBy: { createdAt: "desc" },
  });
}
