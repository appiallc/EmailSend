import { Prisma, PrismaClient, type Settings } from "@prisma/client";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "./secrets";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  settingsSchemaReady?: boolean;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function isMissingColumn(err: unknown, column: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2022" &&
    String(err.meta?.column ?? "").includes(column)
  );
}

/** Ensures newer Settings columns exist (for deploys that skipped db push). */
export async function ensureSettingsSchema() {
  if (globalForPrisma.settingsSchemaReady) return;

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'emailsignature'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'emailSignature'
      ) THEN
        ALTER TABLE "Settings" RENAME COLUMN emailsignature TO "emailSignature";
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'emailSignature'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "emailSignature" TEXT NOT NULL DEFAULT '';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'sendDelayMs'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "sendDelayMs" INTEGER NOT NULL DEFAULT 500;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'timezone'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'businessDaysOnly'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "businessDaysOnly" BOOLEAN NOT NULL DEFAULT true;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'sendWindowStart'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "sendWindowStart" TEXT NOT NULL DEFAULT '09:00';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'sendWindowEnd'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "sendWindowEnd" TEXT NOT NULL DEFAULT '17:00';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'dailySendLimit'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "dailySendLimit" INTEGER NOT NULL DEFAULT 100;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'bouncePausePercent'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "bouncePausePercent" INTEGER NOT NULL DEFAULT 5;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'lastOutboundAt'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "lastOutboundAt" TIMESTAMP(3);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'lastOutboundError'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "lastOutboundError" TEXT NOT NULL DEFAULT '';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'lastReplyCheckAt'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "lastReplyCheckAt" TIMESTAMP(3);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'lastReplyCheckError'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "lastReplyCheckError" TEXT NOT NULL DEFAULT '';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Settings'
          AND column_name = 'outboundLeaseUntil'
      ) THEN
        ALTER TABLE "Settings"
        ADD COLUMN "outboundLeaseUntil" TIMESTAMP(3);
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Campaign'
          AND column_name = 'followUpTimeOfDay'
      ) THEN
        ALTER TABLE "Campaign"
        ADD COLUMN "followUpTimeOfDay" TEXT NOT NULL DEFAULT '10:00';
      END IF;
    END $$;
  `);

  globalForPrisma.settingsSchemaReady = true;
}

async function decryptAndMaybeMigrate(settings: Settings): Promise<Settings> {
  const smtpPassPlain = decryptSecret(settings.smtpPass);
  const imapPassPlain = decryptSecret(settings.imapPass);

  const smtpNeedsEncrypt =
    !!settings.smtpPass && !isEncryptedSecret(settings.smtpPass);
  const imapNeedsEncrypt =
    !!settings.imapPass && !isEncryptedSecret(settings.imapPass);

  if (smtpNeedsEncrypt || imapNeedsEncrypt) {
    try {
      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          smtpPass: smtpNeedsEncrypt
            ? encryptSecret(smtpPassPlain)
            : settings.smtpPass,
          imapPass: imapNeedsEncrypt
            ? encryptSecret(imapPassPlain)
            : settings.imapPass,
        },
      });
    } catch (err) {
      console.error("[settings] Failed to migrate secrets to encrypted form:", err);
    }
  }

  return {
    ...settings,
    smtpPass: smtpPassPlain,
    imapPass: imapPassPlain,
  };
}

async function loadSettings(): Promise<Settings> {
  let settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: "default" } });
  }
  return decryptAndMaybeMigrate(settings);
}

/** Returns settings with SMTP/IMAP passwords decrypted for runtime use. */
export async function getSettings() {
  try {
    const settings = await loadSettings();
    globalForPrisma.settingsSchemaReady = true;
    return settings;
  } catch (err) {
    if (
      !isMissingColumn(err, "emailSignature") &&
      !isMissingColumn(err, "sendDelayMs") &&
      !isMissingColumn(err, "timezone") &&
      !isMissingColumn(err, "dailySendLimit") &&
      !isMissingColumn(err, "followUpTimeOfDay")
    ) {
      throw err;
    }

    console.error(
      "[settings] Missing Settings column on connected DB. host=",
      (() => {
        try {
          return process.env.DATABASE_URL
            ? new URL(process.env.DATABASE_URL).hostname
            : "(no DATABASE_URL)";
        } catch {
          return "(bad DATABASE_URL)";
        }
      })()
    );

    await ensureSettingsSchema();
    return loadSettings();
  }
}
