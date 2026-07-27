import { Prisma, PrismaClient, type Settings } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  settingsSchemaReady?: boolean;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

function isMissingEmailSignatureColumn(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2022" &&
    String(err.meta?.column ?? "").includes("emailSignature")
  );
}

/** Ensures newer Settings columns exist (for deploys that skipped db push). */
export async function ensureSettingsSchema() {
  if (globalForPrisma.settingsSchemaReady) return;

  // Prisma expects the quoted camelCase column name.
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
    END $$;
  `);

  globalForPrisma.settingsSchemaReady = true;
}

async function loadSettings(): Promise<Settings> {
  let settings = await prisma.settings.findUnique({ where: { id: "default" } });
  if (!settings) {
    settings = await prisma.settings.create({ data: { id: "default" } });
  }
  return settings;
}

export async function getSettings() {
  try {
    const settings = await loadSettings();
    globalForPrisma.settingsSchemaReady = true;
    return settings;
  } catch (err) {
    if (!isMissingEmailSignatureColumn(err)) throw err;

    console.error(
      "[settings] Missing emailSignature column on connected DB. host=",
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
