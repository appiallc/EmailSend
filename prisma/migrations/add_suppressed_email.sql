-- Global email suppression list
CREATE TABLE IF NOT EXISTS "SuppressedEmail" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'unsubscribe',
  "source" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SuppressedEmail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SuppressedEmail_email_key" ON "SuppressedEmail"("email");
CREATE INDEX IF NOT EXISTS "SuppressedEmail_createdAt_idx" ON "SuppressedEmail"("createdAt");
