-- CreateTable
CREATE TABLE "ContactList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactList_pkey" PRIMARY KEY ("id")
);

-- Default list for existing contacts
INSERT INTO "ContactList" ("id", "name", "createdAt")
VALUES ('legacy-imported-contacts', 'Imported Contacts', CURRENT_TIMESTAMP);

-- Add contactListId to Contact
ALTER TABLE "Contact" ADD COLUMN "contactListId" TEXT;
UPDATE "Contact" SET "contactListId" = 'legacy-imported-contacts' WHERE "contactListId" IS NULL;
ALTER TABLE "Contact" ALTER COLUMN "contactListId" SET NOT NULL;

-- Replace global email unique with per-list unique
ALTER TABLE "Contact" DROP CONSTRAINT IF EXISTS "Contact_email_key";
CREATE UNIQUE INDEX "Contact_contactListId_email_key" ON "Contact"("contactListId", "email");
CREATE INDEX "Contact_contactListId_idx" ON "Contact"("contactListId");

ALTER TABLE "Contact" ADD CONSTRAINT "Contact_contactListId_fkey"
    FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Campaign ↔ ContactList junction
CREATE TABLE "CampaignContactList" (
    "campaignId" TEXT NOT NULL,
    "contactListId" TEXT NOT NULL,

    CONSTRAINT "CampaignContactList_pkey" PRIMARY KEY ("campaignId","contactListId")
);

ALTER TABLE "CampaignContactList" ADD CONSTRAINT "CampaignContactList_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CampaignContactList" ADD CONSTRAINT "CampaignContactList_contactListId_fkey"
    FOREIGN KEY ("contactListId") REFERENCES "ContactList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
