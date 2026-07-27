-- Run on any database that is missing the email signature column:
ALTER TABLE "Settings"
ADD COLUMN IF NOT EXISTS "emailSignature" TEXT NOT NULL DEFAULT '';
