-- Research leads storage for the data research team
CREATE TABLE IF NOT EXISTS "Lead" (
  "id" TEXT NOT NULL,
  "contactName" TEXT NOT NULL DEFAULT '',
  "email" TEXT NOT NULL DEFAULT '',
  "company" TEXT NOT NULL DEFAULT '',
  "title" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "upworkJobUrl" TEXT NOT NULL DEFAULT '',
  "linkedinProfileUrl" TEXT NOT NULL DEFAULT '',
  "linkedinCompanyUrl" TEXT NOT NULL DEFAULT '',
  "companyWebsite" TEXT NOT NULL DEFAULT '',
  "source" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'new',
  "researchedBy" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Lead_status_idx" ON "Lead"("status");
CREATE INDEX IF NOT EXISTS "Lead_createdAt_idx" ON "Lead"("createdAt");
CREATE INDEX IF NOT EXISTS "Lead_email_idx" ON "Lead"("email");
