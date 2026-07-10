-- Add bounce tracking fields to EmailLog
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bounceReason" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bounceType" TEXT;
ALTER TABLE "EmailLog" ADD COLUMN IF NOT EXISTS "bouncedAt" TIMESTAMP(3);
