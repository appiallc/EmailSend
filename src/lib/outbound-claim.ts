import { prisma } from "./db";
import type { Contact, EmailLog } from "@prisma/client";

/** Max time a row may stay in `sending` before being reclaimed as pending. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;

/** Statuses that mean the email has not been delivered yet (queue + in-flight). */
export const QUEUE_STATUSES = ["pending", "sending"] as const;

export type ClaimedEmailLog = EmailLog & { contact: Contact };

let emailLogGuardsReady = false;

/**
 * Ensure EmailLog claim column + unique recipient key exist (deploys that skipped db push).
 */
export async function ensureEmailLogSendGuards() {
  if (emailLogGuardsReady) return;

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'EmailLog'
          AND column_name = 'claimedAt'
      ) THEN
        ALTER TABLE "EmailLog" ADD COLUMN "claimedAt" TIMESTAMP(3);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'EmailLog_campaignId_contactId_type_followUpStep_key'
      ) THEN
        -- Drop accidental duplicate recipient rows (keep earliest) before unique index.
        DELETE FROM "EmailLog" a
        USING "EmailLog" b
        WHERE a."campaignId" = b."campaignId"
          AND a."contactId" = b."contactId"
          AND a.type = b.type
          AND a."followUpStep" = b."followUpStep"
          AND a.id > b.id;

        CREATE UNIQUE INDEX "EmailLog_campaignId_contactId_type_followUpStep_key"
          ON "EmailLog" ("campaignId", "contactId", "type", "followUpStep");
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'EmailLog_status_claimedAt_idx'
      ) THEN
        CREATE INDEX "EmailLog_status_claimedAt_idx"
          ON "EmailLog" ("status", "claimedAt");
      END IF;
    END $$;
  `);

  emailLogGuardsReady = true;
}

/** Re-queue claims abandoned after a crashed/timed-out worker. */
export async function reclaimStaleEmailClaims(opts?: {
  campaignId?: string;
  type?: string;
}): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS);
  const campaignId = opts?.campaignId ?? null;
  const type = opts?.type ?? null;

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    UPDATE "EmailLog"
    SET status = 'pending', "claimedAt" = NULL
    WHERE status = 'sending'
      AND ("claimedAt" IS NULL OR "claimedAt" < $1)
      AND ($2::text IS NULL OR "campaignId" = $2)
      AND ($3::text IS NULL OR type = $3)
    RETURNING id
    `,
    staleBefore,
    campaignId,
    type
  );
  return rows.length;
}

/**
 * Atomically claim pending rows for SMTP. Concurrent workers cannot claim the same row.
 */
export async function claimPendingEmailLogs(
  campaignId: string,
  type: "initial" | "followup",
  limit: number
): Promise<ClaimedEmailLog[]> {
  const take = Math.max(0, Math.min(Math.floor(limit), 100));
  if (take === 0) return [];

  await reclaimStaleEmailClaims({ campaignId, type });

  // Prisma parameterizes tagged values; cast LIMIT via unsafe int interpolation only
  // after clamping above so workers cannot inject SQL.
  const claimed = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `
    UPDATE "EmailLog" AS el
    SET status = 'sending', "claimedAt" = NOW()
    WHERE el.id IN (
      SELECT id FROM "EmailLog"
      WHERE "campaignId" = $1
        AND type = $2
        AND status = 'pending'
      ORDER BY id ASC
      LIMIT ${take}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING el.id
    `,
    campaignId,
    type
  );

  if (claimed.length === 0) return [];

  return prisma.emailLog.findMany({
    where: { id: { in: claimed.map((r) => r.id) } },
    include: { contact: true },
    orderBy: { id: "asc" },
  });
}

/**
 * Non-blocking outbound lease so cron + after() don't thrash the same drain.
 * Row-level claims remain the hard anti-duplicate guarantee.
 */
export async function tryAcquireOutboundLease(
  ttlMs = 55_000
): Promise<boolean> {
  await ensureOutboundLeaseColumn();
  const now = new Date();
  const until = new Date(now.getTime() + ttlMs);
  const updated = await prisma.$executeRaw`
    UPDATE "Settings"
    SET "outboundLeaseUntil" = ${until}
    WHERE id = 'default'
      AND (
        "outboundLeaseUntil" IS NULL
        OR "outboundLeaseUntil" < ${now}
      )
  `;
  return Number(updated) > 0;
}

export async function renewOutboundLease(ttlMs = 55_000): Promise<void> {
  await ensureOutboundLeaseColumn();
  const until = new Date(Date.now() + ttlMs);
  await prisma.$executeRaw`
    UPDATE "Settings"
    SET "outboundLeaseUntil" = ${until}
    WHERE id = 'default'
  `;
}

export async function releaseOutboundLease(): Promise<void> {
  await ensureOutboundLeaseColumn();
  await prisma.$executeRaw`
    UPDATE "Settings"
    SET "outboundLeaseUntil" = NULL
    WHERE id = 'default'
  `;
}

async function ensureOutboundLeaseColumn() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'outboundLeaseUntil'
      ) THEN
        ALTER TABLE "Settings" ADD COLUMN "outboundLeaseUntil" TIMESTAMP(3);
      END IF;
    END $$;
  `);
}
