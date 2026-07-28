-- Add campaign scheduled send support
ALTER TABLE "Campaign"
ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Campaign_status_scheduledAt_idx"
ON "Campaign"("status", "scheduledAt");
