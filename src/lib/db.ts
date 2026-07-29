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
      !isMissingColumn(err, "sendDelayMs")
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
